import type { ReactNode } from 'react';

/** Never a blank page: an empty screen still says what to do next (docs/06 §7). */
export function PageState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-base text-muted">{children}</p>
    </main>
  );
}
