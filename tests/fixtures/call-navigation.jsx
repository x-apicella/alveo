import { useSyncExternalStore } from 'react';
let path = '/s/server/c/voice';
const listeners = new Set();
export function usePathname() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => path);
}
export function navigate(value) { path = value; listeners.forEach(listener => listener()); }
