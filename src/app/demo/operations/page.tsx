import { QueueList } from '@/components/operations/queue-list';
import { OwnershipQueue } from '@/components/operations/ownership-queue';
import { buildOperationsDemo } from '@/lib/ingest/demo-scenarios';
import { buildQueueRows, buildUnknownStretchRows } from '@/lib/operations/presentation';

export const metadata = { title: 'Xem trước hàng đợi Operation' };

export default async function DemoOperationsPage() {
  const demo = await buildOperationsDemo();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted">FRANKLIN · bản xem thử thiết kế</p>
        <h1 className="text-2xl font-semibold">Hàng đợi Operation</h1>
        <p className="mt-2 text-base text-muted">
          Các đoạn chưa rõ ownership và tổng GMV chưa quy kết là do engine thật tính ra. Vài con số
          cần dữ liệu lịch (ca quá hạn, ca chưa có người) là ví dụ minh hoạ.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Cần xử lý</h2>
        <QueueList rows={buildQueueRows(demo.counts)} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Đoạn live chưa rõ ai vận hành</h2>
        <p className="mb-4 text-sm text-muted">
          Chừng nào chưa xác nhận, các đoạn này không vào bất kỳ KPI nào của agency.
        </p>
        <OwnershipQueue rows={buildUnknownStretchRows(demo.stretches)} />
      </section>
    </main>
  );
}
