'use client';

import { useMutation } from '@tanstack/react-query';
import { BookOpen, SendHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAiHelp } from './ai-assist';

interface PolicyAnswer {
  answer: string;
  sources: string[];
  policiesRead: number;
  skipped: string[];
}
type Turn = { id: number; question: string; answer?: PolicyAnswer; error?: string };

const EXAMPLES = ['What should a carer do if a visit feels unsafe?', 'When does someone need a fit note?', 'What happens after a missed visit?'];

function errorText(error: unknown): string {
  const message = (error as { message?: string } | null)?.message;
  return message && message.length < 300 ? message : 'The AI couldn’t answer just now. Try again in a moment.';
}

/**
 * "Ask AI" (S-022, S-026): a round button fixed in the bottom-right corner of every signed-in page, for admins and
 * managers only. It opens a chat panel over the current page (no page change); answers come only from the company's
 * own policies and name the policy used. The conversation lasts until the page is reloaded; nothing is saved.
 */
export function AiChat() {
  const { can, request } = useAuth();
  const enabled = useAiHelp();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const ask = useMutation({
    mutationFn: async (q: string) => (await request<PolicyAnswer>('/ai/policy-question', { method: 'POST', body: { question: q } })).data,
  });

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const escape = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [turns, ask.isPending]);

  if (!can('ai:use')) return null;

  const send = (text: string) => {
    const q = text.trim();
    if (!q || ask.isPending) return;
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question: q }]);
    setQuestion('');
    ask.mutate(q, {
      onSuccess: (answer) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer } : x))),
      onError: (error) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: errorText(error) } : x))),
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(question);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(question);
    }
  };

  return (
    <div className="print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label="Ask AI"
          className="fixed bottom-24 right-4 z-50 flex h-[min(600px,calc(100vh-8rem))] w-[calc(100vw-2rem)] max-w-[400px] animate-fade-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-lift)] sm:right-6"
        >
          <header className="bg-hero flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="font-display text-[15px] font-bold">Ask AI</p>
                <p className="text-xs text-white/85">Answers from your own policies</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Ask AI" className="rounded-lg p-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
              <X aria-hidden className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4" aria-live="polite">
            {!enabled ? (
              <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">AI help isn&apos;t switched on yet.</p>
            ) : turns.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-700">Ask a question in plain words. I&apos;ll answer only from your company&apos;s policies and tell you which one I used.</p>
                <div className="flex flex-col gap-2">
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => send(e)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {turns.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2">
                    <p className="ml-8 self-end rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">{t.question}</p>
                    {t.answer ? (
                      <div className="mr-4 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink">
                        <p className="whitespace-pre-wrap leading-relaxed">{t.answer.answer}</p>
                        {t.answer.sources.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {t.answer.sources.map((s) => (
                              <li key={s} className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">
                                <BookOpen aria-hidden className="h-3 w-3" /> {s}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : t.error ? (
                      <p role="alert" className="mr-4 rounded-2xl rounded-bl-md border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm text-rose-800">
                        {t.error}
                      </p>
                    ) : (
                      <p className="mr-4 flex items-center gap-2 text-sm text-slate-500">
                        <Sparkles aria-hidden className="h-4 w-4 animate-pulse text-brand-600" /> Reading your policies…
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <div ref={end} />
          </div>

          {enabled && (
            <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3">
              <div className="flex items-end gap-2">
                <label htmlFor="ai-chat-question" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="ai-chat-question"
                  ref={box}
                  rows={1}
                  maxLength={1000}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Ask about your policies…"
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  type="submit"
                  disabled={ask.isPending || !question.trim()}
                  aria-label="Send"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  <SendHorizontal aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">AI can make mistakes. Check the policy itself before acting on anything important.</p>
            </form>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close Ask AI' : 'Ask AI'}
        title="Ask AI about your policies"
        className="fixed bottom-6 right-4 z-50 inline-flex h-14 items-center gap-2 rounded-full bg-brand-600 px-5 font-semibold text-white shadow-[var(--shadow-glow)] ring-4 ring-accent-400/60 transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:right-6"
      >
        {open ? <X aria-hidden className="h-5 w-5" /> : <Sparkles aria-hidden className="h-5 w-5" />}
        <span className="hidden sm:inline">{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </div>
  );
}
