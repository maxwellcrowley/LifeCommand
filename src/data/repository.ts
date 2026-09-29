import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from './coordination';
import { createRepository } from './storage';

export const { hasExternalChange, loadAppData, saveAppData, resetAppData, changeAppData, getRecoveryNotice, exportAppData, importAppData, listRecoveryBackups, previewRecoveryBackup, restoreRecoveryBackup } = createRepository(AsyncStorage, withStorageLock);
