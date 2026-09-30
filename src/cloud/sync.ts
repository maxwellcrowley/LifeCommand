import { DATA_VERSION, parseTransferJSON, validateImport, type DataExport, type ImportPreview } from '../domain/transfer';

export interface CloudSnapshot {
  user_id: string;
  payload: unknown;
  schema_version: number;
  revision: number;
  updated_at: string;
}
export interface CloudGateway {
  userId(): Promise<string>;
  read(userId: string): Promise<CloudSnapshot | null>;
  write(userId: string, payload: DataExport, expectedRevision: number): Promise<CloudSnapshot>;
}
export interface RevisionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export interface UploadPreview {
  kind: 'upload'; userId: string; raw: string; preview: ImportPreview;
  expectedRevision: number; stale: boolean; updatedAt?: string;
}
export interface DownloadPreview {
  kind: 'download'; userId: string; raw: string; preview: ImportPreview;
  revision: number; updatedAt: string;
}
export class CloudConflictError extends Error {
  constructor() { super('Cloud data changed after this preview. Cancel and preview again before overwriting. Download it first to preserve the other device’s changes.'); }
}

export function serializeUpload(raw: string): DataExport {
  validateImport(raw);
  const payload = parseTransferJSON(raw) as DataExport;
  if (payload.schemaVersion !== DATA_VERSION) throw Error('Export local data again with this app version.');
  return payload;
}
function validateRow(row: CloudSnapshot, userId: string) {
  if (row.user_id !== userId) throw Error('Cloud snapshot belongs to a different account.');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updated_at))) throw Error('Invalid cloud snapshot metadata.');
  const raw = JSON.stringify(row.payload);
  const preview = validateImport(raw);
  const envelope = parseTransferJSON(raw) as DataExport;
  if (row.schema_version !== envelope.schemaVersion) throw Error('Cloud schema version does not match its snapshot.');
  return { raw, preview };
}

// No timers or subscriptions: callers explicitly prepare, review, then confirm.
// importLocal is the existing provider import path (validation, backup, draft reset).
export function createCloudSync(gateway: CloudGateway, revisions: RevisionStorage, scope: string,
  exportLocal: () => Promise<string>, importLocal: (raw: string) => Promise<unknown>) {
  const key = (id: string) => `lifecommand:cloud:v1:${scope}:${id}`;
  async function assertAccount(id: string) {
    if (await gateway.userId() !== id) throw Error('Account changed. Cancel and preview again.');
  }
  async function remember(id: string, revision: number) {
    try { await revisions.setItem(key(id), String(revision)); return ''; }
    catch { return 'Completed, but this device could not save the known cloud revision. Future uploads will ask you to review it again.'; }
  }
  return {
    async status() {
      const id = await gateway.userId();
      const row = await gateway.read(id);
      await assertAccount(id);
      if (row) validateRow(row, id);
      // Merely looking at the timestamp never acknowledges a cloud revision.
      return row;
    },
    async prepareUpload(): Promise<UploadPreview> {
      const userId = await gateway.userId();
      const raw = await exportLocal();
      serializeUpload(raw);
      const row = await gateway.read(userId);
      if (row) validateRow(row, userId);
      const known = Number(await revisions.getItem(key(userId)) ?? 0);
      await assertAccount(userId);
      return { kind: 'upload', userId, raw, preview: validateImport(raw), expectedRevision: row?.revision ?? 0,
        stale: !!row && (!Number.isSafeInteger(known) || known < row.revision), updatedAt: row?.updated_at };
    },
    async upload(selection: UploadPreview) {
      await assertAccount(selection.userId);
      const row = await gateway.write(selection.userId, serializeUpload(selection.raw), selection.expectedRevision);
      validateRow(row, selection.userId);
      return { row, warning: await remember(selection.userId, row.revision) };
    },
    async prepareDownload(): Promise<DownloadPreview> {
      const userId = await gateway.userId();
      const row = await gateway.read(userId);
      if (!row) throw Error('No cloud snapshot yet. Upload from the device containing your data first.');
      const parsed = validateRow(row, userId);
      await assertAccount(userId);
      return { kind: 'download', userId, ...parsed, revision: row.revision, updatedAt: row.updated_at };
    },
    async download(selection: DownloadPreview) {
      validateImport(selection.raw);
      await assertAccount(selection.userId);
      const row = await gateway.read(selection.userId);
      if (!row || row.revision !== selection.revision) throw new CloudConflictError();
      const checked = validateRow(row, selection.userId);
      if (checked.raw !== selection.raw) throw new CloudConflictError();
      await assertAccount(selection.userId);
      await importLocal(selection.raw);
      return { row, warning: await remember(selection.userId, row.revision) };
    },
  };
}
