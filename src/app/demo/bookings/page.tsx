import { BookingReview } from '@/components/bookings/booking-review';
import { OpenShifts } from '@/components/bookings/open-shifts';
import type { OpenSlotView, PendingBookingView } from '@/lib/planning/load-bookings';

export const metadata = { title: 'Xem trước đăng ký ca' };

const slots: OpenSlotView[] = [
  {
    slotId: 's1',
    sessionId: 'x1',
    brandName: 'Franklin',
    dateLabel: '18/09/2026',
    timeLabel: '20:00 → 23:00',
    roleLabel: 'Host',
    targetLabel: '30.000.000 ₫',
    spotsLeft: 1,
    myStatus: null,
    registeredCount: 2,
  },
  {
    slotId: 's2',
    sessionId: 'x1',
    brandName: 'Franklin',
    dateLabel: '18/09/2026',
    timeLabel: '20:00 → 23:00',
    roleLabel: 'Trợ live',
    targetLabel: '30.000.000 ₫',
    spotsLeft: 1,
    myStatus: 'REGISTERED',
    registeredCount: 1,
  },
  {
    slotId: 's3',
    sessionId: 'x2',
    brandName: 'Franklin',
    dateLabel: '19/09/2026',
    timeLabel: '10:00 → 13:00',
    roleLabel: 'Host',
    targetLabel: null,
    spotsLeft: 0,
    myStatus: 'APPROVED',
    registeredCount: 0,
  },
];

const bookings: PendingBookingView[] = [
  {
    slotId: 's1',
    userId: 'u1',
    userName: 'Khói',
    brandName: 'Franklin',
    dateLabel: '18/09/2026',
    timeLabel: '20:00 → 23:00',
    roleLabel: 'Host',
    spotsLeft: 1,
    note: 'Em nhận được ca này, đã live ngành hàng này 3 tháng.',
  },
  {
    slotId: 's1',
    userId: 'u2',
    userName: 'Linh Ân',
    brandName: 'Franklin',
    dateLabel: '18/09/2026',
    timeLabel: '20:00 → 23:00',
    roleLabel: 'Host',
    spotsLeft: 1,
    note: null,
  },
];

export default function DemoBookingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted">FRANKLIN · bản xem thử thiết kế</p>
        <h1 className="text-2xl font-semibold">Đăng ký ca và duyệt đăng ký</h1>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Host / trợ live thấy gì</h2>
        <OpenShifts slots={slots} readOnly />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Operation thấy gì</h2>
        <p className="mb-3 text-sm text-muted">
          Hai người cùng đăng ký một chỗ. Duyệt một người là chỗ đó đóng lại.
        </p>
        <BookingReview bookings={bookings} readOnly />
      </section>
    </main>
  );
}
