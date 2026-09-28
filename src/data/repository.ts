import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRepository } from './storage';

export const { loadAppData, saveAppData, resetAppData, changeAppData, getRecoveryNotice } = createRepository(AsyncStorage);
