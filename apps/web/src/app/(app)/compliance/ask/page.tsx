'use client';

import { useMutation } from '@tanstack/react-query';
import { BookOpen, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAiHelp } from '@/components/ai/ai-assist';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';

interface PolicyAnswer {
  answer: string;
  sources: string[];
  policiesRead: number;
  skipped: string[];
}

const EXAMPLES = ['What should a carer do if a visit feels unsafe?', 'When does someone need a fit note?', 'What happens after a missed visit?'];

/** "Ask our policies" (S-022): managers ask in plain words; the answer comes only from the company's own policies. */
export default function AskPoliciesPage() {
  const { request, can } = useAuth();
  const enabled = useAiHelp();
  const [question, setQuestion] = useState('');
  const ask = useMutation({
    mutationFn: async (q: string) => (await request<PolicyAnswer>('/ai/policy-question', { method: 'POST', body: { question: q } })).data,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim()) ask.mutate(question.trim());
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="Ask our policies" subtitle="Ask a question in plain words. The answer comes only from your own policies, and names the policy it used." />
      {!can('ai:use') ? (
        <Alert tone="info">AI help is for administrators and managers.</Alert>
      ) : !enabled ? (
        <Alert tone="info">AI help isn&apos;t switched on yet.</Alert>
      ) : (
        <>
          <Card className="p-5">
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label htmlFor="policy-question" className="font-display text-lg font-semibold text-ink">
                Your question
              </label>
              <textarea
                id="policy-question"
                rows={3}
                maxLength={1000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What should a carer do if a client refuses their medication?"
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="accent" disabled={ask.isPending || !question.trim()}>
                  <Sparkles aria-hidden className="h-4 w-4" /> {ask.isPending ? 'Reading your policies…' : 'Ask'}
                </Button>
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setQuestion(e)}
                    className="rounded-sm border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-400"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </form>
          </Card>

          <ErrorAlert error={ask.error} />

          {ask.data && (
            <Card className="flex flex-col gap-4 border-l-4 border-l-accent-500 p-5">
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{ask.data.answer}</div>
              {ask.data.sources.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">From</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {ask.data.sources.map((s) => (
                      <li key={s} className="flex items-center gap-1.5 rounded-sm border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900">
                        <BookOpen aria-hidden className="h-3.5 w-3.5" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-slate-600">
                Answered by AI from {ask.data.policiesRead} {ask.data.policiesRead === 1 ? 'policy' : 'policies'}. Check the policy itself before acting on anything important.
                {ask.data.skipped.length > 0 && <> Not read (not PDF or too large): {ask.data.skipped.join(', ')}.</>}
              </p>
            </Card>
          )}

          <p className="text-xs text-slate-600">
            Policies are the documents of type &ldquo;Policy&rdquo; in <Link href="/documents" className="underline">Documents</Link>, saved as PDF. Upload new
            versions there and answers use them straight away.
          </p>
        </>
      )}
    </div>
  );
}
