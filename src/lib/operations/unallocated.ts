import { Decimal } from 'decimal.js';

export interface UnallocatedRow {
  sourceSnapshotId: string | null;
  prevSnapshotId: string | null;
  sourceGmv: string | null;
  prevGmv: string | null;
}

export interface UnallocatedTotal {
  /** Stretches of room time, not attribution rows. */
  count: number;
  amount: Decimal;
}

/**
 * Totals the GMV that no shift can claim yet.
 *
 * One unresolved stretch produces a row for every shift it overlaps, so the
 * rows are collapsed by the snapshot pair they came from — adding them up as
 * they are stored would report the same money twice.
 */
export function sumUnallocated(rows: UnallocatedRow[]): UnallocatedTotal {
  const seen = new Map<string, Decimal>();

  for (const row of rows) {
    if (row.sourceGmv === null) continue;
    const key = `${row.sourceSnapshotId ?? ''}|${row.prevSnapshotId ?? ''}`;
    if (seen.has(key)) continue;

    const source = new Decimal(row.sourceGmv);
    const previous = row.prevGmv === null ? new Decimal(0) : new Decimal(row.prevGmv);
    seen.set(key, source.minus(previous));
  }

  return {
    count: seen.size,
    amount: [...seen.values()].reduce((total, value) => total.plus(value), new Decimal(0)),
  };
}
