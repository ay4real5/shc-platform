'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';

export type DraftKind = 'job_advert' | 'interview_questions' | 'supervision_write_up';
export interface DraftContext {
  jobTitle?: string;
  discipline?: string;
  location?: string;
}

/** AI help is shown only to people with `ai:use` (admins and managers, S-022), and only when it is switched on. */
export function useAiHelp(): boolean {
  const { request, can } = useAuth();
  const allowed = can('ai:use');
  const status = useQuery({
    queryKey: ['ai', 'status'],
    enabled: allowed,
    staleTime: 5 * 60_000,
    queryFn: async () => (await request<{ enabled: boolean }>('/ai/status')).data,
  });
  return allowed && Boolean(status.data?.enabled);
}

export function useDraft() {
  const { request } = useAuth();
  return useMutation({
    mutationFn: async (body: { kind: DraftKind; notes: string } & DraftContext) => (await request<{ text: string }>('/ai/draft', { method: 'POST', body })).data.text,
  });
}

export const AI_CHECK_NOTE = 'Written by AI from your notes. Read it and correct anything before saving.';

/**
 * "Tidy up with AI" for a text box in an ordinary form: sends what's typed in the box (the manager's rough notes) and
 * offers the draft to replace it. The form itself is untouched until the manager presses "Replace with this".
 */
export function AiAssist({ kind, field, label, context }: { kind: DraftKind; field: string; label: string; context?: (form: HTMLFormElement) => DraftContext }) {
  const enabled = useAiHelp();
  const anchor = useRef<HTMLDivElement>(null);
  const draft = useDraft();
  const [hint, setHint] = useState<string | null>(null);

  if (!enabled) return null;
  const box = () => anchor.current?.closest('form')?.elements.namedItem(field) as HTMLTextAreaElement | null;

  const run = () => {
    setHint(null);
    const form = anchor.current?.closest('form');
    const notes = box()?.value.trim() ?? '';
    if (notes.length < 10) {
      setHint('Type a few rough notes in the box first, then press this again.');
      return;
    }
    draft.mutate({ kind, notes, ...(form && context ? context(form) : {}) });
  };
  const replace = () => {
    const el = box();
    if (el && draft.data) {
      el.value = draft.data;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    }
    draft.reset();
  };

  return (
    <div ref={anchor} className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" onClick={run} disabled={draft.isPending} className="border-accent-500 px-3 py-1.5 text-xs">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-accent-600" /> {draft.isPending ? 'Writing…' : label}
        </Button>
      </div>
      {hint && <p className="text-xs text-amber-800">{hint}</p>}
      <ErrorAlert error={draft.error} />
      {draft.data && (
        <div className="flex flex-col gap-2 rounded-md border border-accent-300 bg-accent-50/50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
            <Sparkles aria-hidden className="h-3.5 w-3.5 text-accent-600" /> AI draft
          </p>
          <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-ink">{draft.data}</div>
          <p className="text-xs text-slate-600">{AI_CHECK_NOTE}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={replace} className="px-3 py-1.5 text-xs">
              <Check aria-hidden className="h-3.5 w-3.5" /> Replace with this
            </Button>
            <Button type="button" variant="ghost" onClick={() => draft.reset()} className="px-3 py-1.5 text-xs">
              <X aria-hidden className="h-3.5 w-3.5" /> Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Interview questions for a job (S-022): a stand-alone helper on the job page; the questions are copied, not saved. */
export function InterviewQuestions({ context }: { context: DraftContext }) {
  const enabled = useAiHelp();
  const draft = useDraft();
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  if (!enabled) return null;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Interview questions</h2>
        <p className="text-xs text-slate-600">AI suggestions for this role: values, real care scenarios and experience, with what to look for.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Anything to focus on? (optional)</span>
        <textarea
          rows={2}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. lots of dementia care, lone working at night, new carers welcome"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </label>
      <div>
        <Button type="button" variant="secondary" disabled={draft.isPending} className="border-accent-500" onClick={() => draft.mutate({ kind: 'interview_questions', notes: notes.trim() || 'No extra notes.', ...context })}>
          <Sparkles aria-hidden className="h-4 w-4 text-accent-600" /> {draft.isPending ? 'Writing…' : draft.data ? 'Suggest different questions' : 'Suggest interview questions'}
        </Button>
      </div>
      <ErrorAlert error={draft.error} />
      {draft.data && (
        <div className="flex flex-col gap-2 rounded-md border border-accent-300 bg-accent-50/50 p-3">
          <div className="whitespace-pre-wrap text-sm text-ink">{draft.data}</div>
          <Alert tone="info" className="text-xs">
            Suggestions only. Ask every candidate the same core questions, and score answers yourselves: the AI never scores or ranks people.
          </Alert>
          <div>
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(draft.data).then(() => setCopied(true));
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy aria-hidden className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
