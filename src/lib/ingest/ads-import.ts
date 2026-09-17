import type { AdsParseResult } from '../parsing/ads-daily';
import type {
  AdsDailyRecord,
  AuditEntry,
  ExistingImport,
  ImportContext,
  IngestRepository,
} from './types';

export type AdsImportReport =
  | { status: 'DUPLICATE_FILE'; existingImport: ExistingImport }
  | { status: 'NEEDS_MAPPING'; importId: string; missingColumns: string[] }
  | {
      status: 'IMPORTED';
      importId: string;
      daysInserted: number;
      daysOverwritten: { statDate: string; previousSpend: string; newSpend: string }[];
      failedRows: { rowIndex: number; reason: string }[];
      totalsRowSkipped: boolean;
    };

/**
 * Stores daily ads figures. TikTok keeps revising a day's numbers for a while,
 * so a later file wins — but the figure it replaces is written to the audit log
 * first, because someone will have reported the old one.
 *
 * These figures stay at day level and shop scope. They are never attributed to
 * a shift, a host or a campaign (docs/01 §10).
 */
export async function importAdsDaily(
  repo: IngestRepository,
  context: ImportContext,
  parsed: AdsParseResult,
): Promise<AdsImportReport> {
  const existing = await repo.findImportByHash(context.platformAccountId, context.fileHash);
  if (existing) {
    return { status: 'DUPLICATE_FILE', existingImport: existing };
  }

  if (parsed.status === 'NEEDS_MAPPING') {
    const importId = await repo.createImport({
      context,
      importType: 'ADS_DAILY',
      dataPeriodStart: null,
      dataPeriodEnd: null,
      rowCount: 0,
    });
    await repo.finishImport(importId, {
      status: 'NEEDS_REVIEW',
      errorSummary: { reason: 'HEADER_UNKNOWN', missingColumns: parsed.missingColumns },
    });
    return { status: 'NEEDS_MAPPING', importId, missingColumns: parsed.missingColumns };
  }

  const dates = parsed.rows.map((row) => row.statDate).sort();
  const importId = await repo.createImport({
    context,
    importType: 'ADS_DAILY',
    dataPeriodStart: dates[0] ?? null,
    dataPeriodEnd: dates[dates.length - 1] ?? null,
    rowCount: parsed.rows.length + parsed.failedRows.length,
  });

  const before = new Map(
    (await repo.findAdsDaily(context.platformAccountId, dates)).map((row) => [row.statDate, row]),
  );

  const records: AdsDailyRecord[] = parsed.rows.map((row) => ({
    statDate: row.statDate,
    adsSpend: row.adsSpend,
    adsSkuOrders: row.adsSkuOrders,
    adsGrossRevenue: row.adsGrossRevenue,
    currency: row.currency,
  }));

  const overwritten: { statDate: string; previousSpend: string; newSpend: string }[] = [];
  const audits: AuditEntry[] = [];

  for (const record of records) {
    const previous = before.get(record.statDate);
    if (!previous || previous.adsSpend.equals(record.adsSpend)) continue;

    overwritten.push({
      statDate: record.statDate,
      previousSpend: previous.adsSpend.toString(),
      newSpend: record.adsSpend.toString(),
    });
    audits.push({
      entityType: 'ads_daily',
      entityId: `${context.platformAccountId}:${record.statDate}`,
      action: 'OVERWRITE',
      beforeData: {
        adsSpend: previous.adsSpend.toString(),
        adsSkuOrders: previous.adsSkuOrders,
        adsGrossRevenue: previous.adsGrossRevenue?.toString() ?? null,
      },
      afterData: {
        adsSpend: record.adsSpend.toString(),
        adsSkuOrders: record.adsSkuOrders,
        adsGrossRevenue: record.adsGrossRevenue?.toString() ?? null,
      },
      reason: `Import lại từ file ${context.fileName}`,
      actorId: context.uploadedBy,
    });
  }

  await repo.upsertAdsDaily(context.platformAccountId, importId, records);
  if (audits.length > 0) await repo.writeAuditLogs(audits);

  const failedRows = parsed.failedRows.map((row) => ({ rowIndex: row.rowIndex, reason: row.reason }));
  await repo.finishImport(importId, {
    status: failedRows.length > 0 ? 'PARTIALLY_MATCHED' : 'MATCHED',
    errorSummary: failedRows.length > 0 ? { failedRows } : null,
  });

  return {
    status: 'IMPORTED',
    importId,
    daysInserted: records.filter((record) => !before.has(record.statDate)).length,
    daysOverwritten: overwritten,
    failedRows,
    totalsRowSkipped: parsed.totalsRowSkipped,
  };
}
