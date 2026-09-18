'use client';

import { useState } from 'react';
import { TargetSuggestion } from '@/components/targets/target-suggestion';
import { buildTargetDemo } from '@/lib/ingest/demo-scenarios';

const CASES = buildTargetDemo();

export default function DemoTargetPage() {
  const [chosen, setChosen] = useState<Record<string, string>>({});

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-semibold">Target Engine</h1>
      <p className="mt-1 mb-8 text-sm text-muted">
        Hệ thống gợi ý một khoảng, không tự đặt target. Mọi hệ số đo từ lịch sử của chính
        brand đó — không có con số nào viết cứng trong code.
      </p>

      <div className="space-y-8">
        {CASES.map((item) => (
          <section key={item.title}>
            <h2 className="text-base font-medium">{item.title}</h2>
            <p className="mb-3 text-sm text-muted">{item.note}</p>
            <TargetSuggestion
              view={item.view}
              onUse={(value) => setChosen((current) => ({ ...current, [item.title]: value }))}
            />
            {chosen[item.title] ? (
              <p className="tabular mt-2 text-sm text-muted">
                Ô Target GMV sẽ được điền: {chosen[item.title]}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
