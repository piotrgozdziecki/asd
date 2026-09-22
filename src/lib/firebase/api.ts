import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './config';
import { handleFirestoreError, OperationType } from './errors';
import type { ProjectState } from '../../types/project';
import { sanitizeProjectForStorage, migrateProjectToLatest } from '../../core/validation/projectMigration';
import { safeClone } from '../safeJson';

// Helper function to safely serialize state to clean plain object
const serializeState = (state: ProjectState) => {
  const clean = sanitizeProjectForStorage(state);
  return safeClone(clean);
};

export async function saveProject(project: ProjectState): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Musisz być zalogowany, aby zapisać projekt.');
  }

  const path = `users/${user.uid}/projects/${project.id}`;
  try {
    const data = {
      state: serializeState(project),
      userId: user.uid,
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(doc(db, path), data, { merge: true });
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można zapisać projektu w chmurze (${path}):`, errMsg);
    }
  }
}

export async function loadProject(projectId: string): Promise<ProjectState | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const path = `users/${user.uid}/projects/${projectId}`;
  try {
    const docSnap = await getDoc(doc(db, path));
    if (docSnap.exists()) {
      return migrateProjectToLatest(docSnap.data().state);
    }
    return null;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.GET, path);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można pobrać projektu z chmury (${path}):`, errMsg);
      return null;
    }
  }
}

export async function deleteProjectFromCloud(projectId: string = 'main-project'): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const path = `users/${user.uid}/projects/${projectId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można usunąć projektu z chmury (${path}):`, errMsg);
    }
  }
}
