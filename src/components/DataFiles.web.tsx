import { MAX_TRANSFER_BYTES } from '@/src/domain/transfer';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { useEffect, useRef } from 'react';

export const supportsDataFiles = true;
export function downloadData(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `lifecommand-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DataFilePicker({ disabled, onRead, onError }: { disabled: boolean; onRead: (raw: string) => void; onError: (message: string) => void }) {
  const { colors } = useAppTheme();
  const readVersion = useRef(0);
  useEffect(() => () => { readVersion.current++; }, []);
  return <input aria-label="LifeCommand JSON file" type="file" accept=".json,application/json" disabled={disabled}
    style={{ color: colors.text, width: '100%', minWidth: 0, minHeight: 48, fontSize: 16 }}
    onChange={async event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      const version = ++readVersion.current;
      if (file.size > MAX_TRANSFER_BYTES) { onError('File exceeds the 10 MB import limit.'); return; }
      try { const raw = await file.text(); if (version === readVersion.current) onRead(raw); }
      catch { if (version === readVersion.current) onError('Could not read the file. Choose it again.'); }
    }} />;
}
