'use client';

import { PreviewPanel } from '@/components/upload/preview-panel';
import type { UploadPreview } from '@/lib/ingest/upload-preview';

const noop = () => {};

export function DemoPreview({ preview }: { preview: UploadPreview }) {
  return (
    <PreviewPanel
      preview={preview}
      busy={false}
      onConfirm={noop}
      onEscalate={noop}
      onDiscard={noop}
    />
  );
}
