import { Muted } from './ui';

export const supportsDataFiles = false;
export function downloadData(_raw: string) { throw Error('File export is currently available in the web app.'); }
export function DataFilePicker(_props: { disabled: boolean; onRead: (raw: string) => void; onError: (message: string) => void }) {
  return <Muted>File import is currently available in the web app. Local recovery restoration works on this device.</Muted>;
}
