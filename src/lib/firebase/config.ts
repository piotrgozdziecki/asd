import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../../firebase-applet-config.json';

// Ensure singleton Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with robust modern multi-tab persistent cache
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  // In case Firestore has already been initialized on this app instance
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export const storage = getStorage(app);

// Connectivity status tracker with graceful offline detection
export let isFirestoreConnected = typeof navigator !== 'undefined' ? navigator.onLine : true;
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

// Browser online/offline event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    updateConnectionStatus(true);
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });
}

// Initial connection test as per Firebase guidelines
if (typeof window !== 'undefined') {
  async function testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      updateConnectionStatus(true);
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      const isOffline =
        errMsg.includes('the client is offline') ||
        errMsg.includes('unavailable') ||
        error?.code === 'unavailable' ||
        error?.code === 'failed-precondition';

      if (isOffline) {
        updateConnectionStatus(false);
        console.warn('[Firebase] Client is currently operating in offline mode. Local persistent cache is enabled.');
      }
    }
  }
  testConnection();
}
