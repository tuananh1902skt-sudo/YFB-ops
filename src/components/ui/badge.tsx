import type { ReactNode } from 'react';

type Tone = 'neutral' | 'live' | 'done' | 'attention' | 'blocking' | 'outside';

const TONES: Record<Tone, string> = {
  neutral: 'bg-outside-surface text-muted',
  live: 'bg-live-surface text-live',
  done: 'bg-done-surface text-done',
  attention: 'bg-attention-surface text-attention',
  blocking: 'bg-blocking-surface text-blocking',
  outside: 'bg-outside-surface text-outside',
};

/**
 * Always carries words, never colour alone: studio lighting distorts colour and
 * not everyone sees it the same way (docs/06 §3.2).
 */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
