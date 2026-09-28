import { useEffect, useState } from 'react';
import type { AppData } from '@/src/domain/models';
import { loadAppData } from './repository';
export function useAppData() { const [data, setData] = useState<AppData | null>(null); useEffect(() => { loadAppData().then(setData); }, []); return data; }
