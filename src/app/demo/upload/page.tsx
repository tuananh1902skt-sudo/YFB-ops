import { buildDemoScenarios } from '@/lib/ingest/demo-scenarios';
import { DemoPreview } from './demo-preview';

export const metadata = { title: 'Xem trước màn hình nộp dữ liệu' };

/**
 * Bản xem thử để duyệt thiết kế trước khi có dữ liệu thật. Các con số ở đây do
 * chính engine tách ca tính ra, không phải ảnh chụp hay số viết tay.
 */
export default async function DemoUploadPage() {
  const scenarios = await buildDemoScenarios();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted">FRANKLIN · bản xem thử thiết kế</p>
        <h1 className="text-2xl font-semibold">Nộp dữ liệu — 4 tình huống thường gặp</h1>
        <p className="mt-2 text-base text-muted">
          Số liệu là ví dụ, nhưng cách tách ca và cảnh báo là do engine thật tính ra.
        </p>
      </header>

      <div className="space-y-12">
        {scenarios.map((scenario) => (
          <section key={scenario.id}>
            <h2 className="text-lg font-semibold">{scenario.title}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">{scenario.situation}</p>
            <DemoPreview preview={scenario.preview} />
          </section>
        ))}
      </div>
    </main>
  );
}
