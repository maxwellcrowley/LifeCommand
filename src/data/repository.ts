import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from './coordination';
import { createRepository } from './storage';

import { accountStorage } from './accountStorage';
import { createDefaultAppData } from '../domain/defaults';
export let repositoryScope = 'guest';
let repository = createRepository(AsyncStorage, withStorageLock);
export function selectRepositoryAccount(scope: string) {
  repositoryScope = scope;
  repository = createRepository(accountStorage(AsyncStorage, scope), withStorageLock, createDefaultAppData);
}
export const currentRepository = () => repository;
export const getUndo: typeof repository.getUndo = (...args) => repository.getUndo(...args);
export const undoAppData: typeof repository.undoAppData = (...args) => repository.undoAppData(...args);
export const hasExternalChange: typeof repository.hasExternalChange = (...args) => repository.hasExternalChange(...args);
export const loadAppData: typeof repository.loadAppData = (...args) => repository.loadAppData(...args);
export const saveAppData: typeof repository.saveAppData = (...args) => repository.saveAppData(...args);
export const resetAppData: typeof repository.resetAppData = (...args) => repository.resetAppData(...args);
export const changeAppData: typeof repository.changeAppData = (...args) => repository.changeAppData(...args);
export const getRecoveryNotice: typeof repository.getRecoveryNotice = (...args) => repository.getRecoveryNotice(...args);
export const exportAppData: typeof repository.exportAppData = (...args) => repository.exportAppData(...args);
export const importAppData: typeof repository.importAppData = (...args) => repository.importAppData(...args);
export const previewMergeImport: typeof repository.previewMergeImport = (...args) => repository.previewMergeImport(...args);
export const mergeImportAppData: typeof repository.mergeImportAppData = (...args) => repository.mergeImportAppData(...args);
export const listRecoveryBackups: typeof repository.listRecoveryBackups = (...args) => repository.listRecoveryBackups(...args);
export const previewRecoveryBackup: typeof repository.previewRecoveryBackup = (...args) => repository.previewRecoveryBackup(...args);
export const restoreRecoveryBackup: typeof repository.restoreRecoveryBackup = (...args) => repository.restoreRecoveryBackup(...args);
