import type { AppData } from './models';
import { normalizeAppData } from './normalize';
import { validateSnapshot } from './transfer';

// Version 0 is the historical, unversioned local snapshot. Portable exports
// remain version 1; storage metadata is deliberately excluded from that format.
export const CURRENT_SCHEMA_VERSION = 1;
export interface PersistedSnapshot extends AppData {
  schemaVersion: number;
  revision: number;
}

export function snapshotVersion(value: unknown): number {
  const version = value && typeof value === 'object' && 'schemaVersion' in value ? value.schemaVersion : 0;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) throw Error('Invalid local schema version. Your saved data has not been changed.');
  if (version > CURRENT_SCHEMA_VERSION) throw Error(`Unsupported local data version ${version}. This app supports version ${CURRENT_SCHEMA_VERSION}. Update LifeCommand to open this data; your saved data has not been changed.`);
  return version;
}

export function snapshotRevision(value: unknown): number {
  if (snapshotVersion(value) === 0) return 0;
  const revision = (value as PersistedSnapshot).revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw Error('Invalid local data revision. Your saved data has not been changed.');
  return revision;
}

export function snapshotData(value: unknown): unknown {
  snapshotVersion(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { schemaVersion: _version, revision: _revision, ...data } = value as Record<string, unknown>;
  return data;
}

// Pure, deterministic migration. Legacy repair retains usable records using
// the established recovery rules. Current-version data must validate strictly.
export function migrateSnapshot(value: unknown): AppData {
  const version = snapshotVersion(value);
  const input = snapshotData(value);
  if (version === 0) return validateSnapshot(normalizeAppData(input)).data;
  snapshotRevision(value);
  return validateSnapshot(input).data;
}

export function persistedSnapshot(data: AppData, revision: number): PersistedSnapshot {
  if (!Number.isSafeInteger(revision) || revision < 1) throw Error('Local data revision limit reached. Export your data before continuing.');
  return { ...validateSnapshot(data).data, schemaVersion: CURRENT_SCHEMA_VERSION, revision };
}
