/**
 * LOCAL-ONLY CONFIG - No Firebase initialization
 * All storage is handled by IndexedDB provider
 */

export const isFirestoreConnected = typeof navigator !== 'undefined' ? navigator.onLine : true;
const connectionListeners: ((status: boolean) => void)[] = [];

export function onFirestoreConnectionChange(callback: (status: boolean) => void) {
  connectionListeners.push(callback);
  return () => {
    const index = connectionListeners.indexOf(callback);
    if (index !== -1) connectionListeners.splice(index, 1);
  };
}

function updateConnectionStatus(status: boolean) {
  if (typeof window !== 'undefined') {
    connectionListeners.forEach(cb => cb(status));
  }
}

// Browser online/offline event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));
}
