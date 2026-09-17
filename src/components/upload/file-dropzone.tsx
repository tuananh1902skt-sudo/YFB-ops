'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';

export function FileDropzone({
  onFile,
  busy,
  fileName,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  fileName: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-live bg-live-surface' : 'border-border bg-surface'
      }`}
    >
      <p className="text-base font-medium">
        {fileName ?? 'Kéo file report vào đây'}
      </p>
      <p className="mt-1 text-sm text-muted">
        File tải từ TikTok Shop, định dạng .xlsx
      </p>
      <Button
        size="lg"
        variant="secondary"
        className="mt-4"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Đang đọc file…' : 'Chọn file'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
