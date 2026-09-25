import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { app, db, auth, storage } from './firebase/config';

export { app, db, auth, storage };

import { safeStringify } from './safeJson';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  let errorMsg = 'Unknown Firestore error';
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (typeof error === 'string') {
    errorMsg = error;
  } else if (typeof error === 'object' && error !== null) {
    errorMsg = (error as any).message || (error as any).code || 'Database error occurred';
  }

  const errInfo: FirestoreErrorInfo = {
    error: String(errorMsg),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  const serialized = safeStringify(errInfo);
  console.error('Firestore Error: ', serialized);
  throw new Error(serialized);
}

export interface SavedStoryMediaItem {
  id?: string;
  name: string;
  mimeType: string;
  cloudUrl?: string;
  storagePath?: string;
  comment?: string;
  durationSec?: number;
  startTimeSec?: number;
  endTimeSec?: number;
  audioVolume?: number;
  exifDate?: string;
}

export interface SavedStory {
  id: string;
  title: string;
  concept: string;
  musicSuggestion: string;
  timeline: { time: string; elementName: string; action: string; directorNote?: string }[];
  voiceover: string;
  coverUrl?: string;
  mood?: string;
  exifDate?: string;
  mediaItems?: SavedStoryMediaItem[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageUploadProgress {
  percent: number;
  bytesTransferred: number;
  totalBytes: number;
}

/**
 * Uploads a large video/audio/image file to Firebase Cloud Storage with real-time progress tracking.
 */
export async function uploadMediaToCloudStorage(
  userId: string,
  file: File | Blob,
  fileName: string,
  onProgress?: (progress: StorageUploadProgress) => void
): Promise<{ downloadUrl: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const storagePath = `users/${userId}/media/${uniqueId}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      originalName: fileName,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString()
    }
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / (snapshot.totalBytes || 1)) * 100);
        if (onProgress) {
          onProgress({
            percent,
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes
          });
        }
      },
      (error) => {
        console.error('[Firebase Storage Error]', error);
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ downloadUrl, storagePath });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Deletes a file from Firebase Cloud Storage by its storage path.
 */
export async function deleteMediaFromCloudStorage(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    // If already removed or not found, don't crash
    if (error?.code !== 'storage/object-not-found') {
      console.warn('[Firebase Storage Delete Warning]', error);
    }
  }
}

/**
 * Recursively removes undefined values from an object or array.
 * Firestore does not support undefined values.
 */
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => (v && typeof v === 'object') ? removeUndefined(v) : v).filter(v => v !== undefined);
  }
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, (v && typeof v === 'object') ? removeUndefined(v) : v])
    );
  }
  return obj;
}

export async function saveStoryToFirestore(userId: string, story: Omit<SavedStory, 'userId' | 'createdAt' | 'updatedAt' | 'id'> & { id?: string }): Promise<string> {
  const storyId = story.id || `story_${Date.now()}`;
  const path = `users/${userId}/stories/${storyId}`;
  try {
    const now = new Date().toISOString();
    const docData: SavedStory = {
      mediaItems: [],
      ...story,
      id: storyId,
      userId,
      createdAt: now,
      updatedAt: now,
    };
    
    // Deep clean undefined values which Firestore doesn't support
    const cleanData = removeUndefined(docData);

    await setDoc(doc(db, 'users', userId, 'stories', storyId), cleanData);
    return storyId;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można zapisać historii w chmurze (${path}):`, errMsg);
      return storyId;
    }
  }
}

export function subscribeToUserStories(userId: string, onUpdate: (stories: SavedStory[]) => void, onError?: (err: any) => void) {
  const path = `users/${userId}/stories`;
  try {
    const q = query(collection(db, 'users', userId, 'stories'));
    return onSnapshot(
      q,
      (snapshot) => {
        const stories: SavedStory[] = [];
        snapshot.forEach((d) => {
          stories.push(d.data() as SavedStory);
        });
        onUpdate(stories);
      },
      (error) => {
        const errMsg = error?.message || String(error);
        const isPermissionDenied = error?.code === 'permission-denied' || errMsg.includes('insufficient permissions');
        if (isPermissionDenied) {
          handleFirestoreError(error, OperationType.LIST, path);
        } else {
          console.warn(`[Firestore Status] Połączenie offline dla ${path}:`, errMsg);
          if (onError) onError(error);
        }
      }
    );
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionDenied = error?.code === 'permission-denied' || errMsg.includes('insufficient permissions');
    if (isPermissionDenied) {
      handleFirestoreError(error, OperationType.LIST, path);
    } else {
      console.warn(`[Firestore Status] Błąd subskrypcji dla ${path}:`, errMsg);
      if (onError) onError(error);
    }
  }
}

export async function deleteStoryFromFirestore(userId: string, storyId: string): Promise<void> {
  const path = `users/${userId}/stories/${storyId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'stories', storyId));
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można usunąć historii z chmury (${path}):`, errMsg);
    }
  }
}
