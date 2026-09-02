import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy,
  onSnapshot 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface SavedStory {
  id: string;
  title: string;
  concept: string;
  musicSuggestion: string;
  timeline: { time: string; elementName: string; action: string }[];
  voiceover: string;
  coverUrl?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export async function saveStoryToFirestore(userId: string, story: Omit<SavedStory, 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  const storyId = story.id || `story_${Date.now()}`;
  const path = `users/${userId}/stories/${storyId}`;
  try {
    const now = new Date().toISOString();
    const docData: SavedStory = {
      ...story,
      id: storyId,
      userId,
      createdAt: now,
      updatedAt: now,
    };
    
    // Clean up undefined values which Firestore doesn't support
    const cleanData = Object.fromEntries(
      Object.entries(docData).filter(([_, v]) => v !== undefined)
    );

    await setDoc(doc(db, 'users', userId, 'stories', storyId), cleanData);
    return storyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
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
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteStoryFromFirestore(userId: string, storyId: string): Promise<void> {
  const path = `users/${userId}/stories/${storyId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
