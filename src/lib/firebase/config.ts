import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Connectivity status tracker
export let isFirestoreConnected = true;
const connectionListeners: ((status: boolean) => void)[] = [];

export function onFirestoreConnectionChange(callback: (status: boolean) => void) {
  connectionListeners.push(callback);
  return () => {
    const index = connectionListeners.indexOf(callback);
    if (index !== -1) connectionListeners.splice(index, 1);
  };
}

function updateConnectionStatus(status: boolean) {
  if (isFirestoreConnected === status) return;
  isFirestoreConnected = status;
  connectionListeners.forEach(cb => cb(status));
}

// Diagnostic test for Firestore connectivity
if (typeof window !== 'undefined') {
  const testConnection = async () => {
    try {
      const { doc, getDocFromServer } = await import('firebase/firestore');
      // Attempting to read a non-existent document from server to check connectivity
      await getDocFromServer(doc(db, '_internal_system_', 'connectivity_test')).catch(() => {
        // We expect a "not-found" or "permission-denied", both mean we REACHED the server
      });
      console.log('[Firebase] Diagnostic: Połączono z backendem Firestore.');
      updateConnectionStatus(true);
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('could not reach') || msg.includes('offline') || msg.includes('timeout')) {
        console.error('[Firebase] Diagnostic Error: Nie można nawiązać połączenia z serwerem Firestore.', error);
        updateConnectionStatus(false);
      }
    }
  };
  
  // Initial check
  testConnection();
  
  // Periodic check if disconnected
  setInterval(() => {
    if (!isFirestoreConnected) testConnection();
  }, 30000);
}
