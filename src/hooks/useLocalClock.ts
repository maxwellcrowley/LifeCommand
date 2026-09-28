import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Null during static rendering avoids baking an export-time clock into the display.
export function useLocalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = setTimeout(update, 0);
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') update();
    }, 15_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearTimeout(initial); clearInterval(timer); subscription.remove(); };
  }, []);
  return now;
}
