import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './config';
import { handleFirestoreError, OperationType } from './errors';
import type { ProjectTemplate } from '../../types/template';
import { safeClone } from '../safeJson';

export const PREBUILT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl_wedding_highlights',
    userId: 'system',
    title: 'Wedding Highlights (Master Kinowy)',
    description: 'Kompletna struktura pełnego filmu ślubnego od przygotowań po finałowe zimne ognie. Zawiera nagłówki rozdziałów i dopasowane przejścia.',
    category: 'wedding_highlights',
    icon: '✨',
    isPrebuilt: true,
    structure: {
      pacing: 'cinematic',
      colorGrade: 'golden_hour',
      resolution: '1080p',
      fps: 30,
      fitMode: 'fit',
      applySmartTrim: true,
      applyTransitions: true,
      suggestedMusicPreset: 'golden_hour_piano',
      introCard: {
        enabled: true,
        text: 'ŚLUB JOANNY I PIOTRA',
        subtitle: '14.09.2024 • Sakrament Małżeństwa',
        duration: 3.5,
        style: 'liturgical',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'PODZIĘKOWANIA',
        subtitle: 'Z całego serca dziękujemy Rodzicom za dar życia i miłość, Świadkom za pomoc i wsparcie, oraz wszystkim wspaniałym Gościom za modlitwę, radość i wspólne świętowanie.',
        duration: 4.5,
        style: 'elegant',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'preparations', name: 'Poranne Przygotowania', targetDurationSec: 60, description: 'Suknia, garnitur, detale i pierwsze spojrzenie' },
        { chapterKey: 'ceremony', name: 'Ceremonia Ślubna', targetDurationSec: 120, description: 'Wejście, przysięga i wymiana obrączek' },
        { chapterKey: 'congratulations', name: 'Życzenia od Gości', targetDurationSec: 45, description: 'Radosne uściski i gratulacje przed kościołem' },
        { chapterKey: 'first_dance', name: 'Pierwszy Taniec', targetDurationSec: 90, description: 'Taniec w chmurach i wybuch konfetti' },
        { chapterKey: 'party', name: 'Zabawa i Toasty', targetDurationSec: 120, description: 'Szalony parkiet i toasty z przyjaciółmi' },
        { chapterKey: 'cake', name: 'Tort Weselny', targetDurationSec: 45, description: 'Krojenie tortu w blasku świec' },
        { chapterKey: 'ending', name: 'Finał pod Gwiazdami', targetDurationSec: 30, description: 'Zimne ognie i nocny pocałunek' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_ceremony_only',
    userId: 'system',
    title: 'Ceremony Only (Uroczysty Sakrament)',
    description: 'Skupiony wyłącznie na podniosłej atmosferze mszy świętej, wejściu Młodej Pary, słowach przysięgi oraz życzeniach.',
    category: 'ceremony_only',
    icon: '⛪',
    isPrebuilt: true,
    structure: {
      pacing: 'cinematic',
      colorGrade: 'vivid_master',
      resolution: '1080p',
      fps: 24,
      fitMode: 'fit',
      applySmartTrim: false,
      applyTransitions: true,
      suggestedMusicPreset: 'altar_procession',
      introCard: {
        enabled: true,
        text: 'CEREMONIA ZAŚLUBIN',
        subtitle: 'Uroczysta Msza Święta i Przysięga Małżeńska',
        duration: 4.0,
        style: 'liturgical',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'BÓG JEST MIŁOŚCIĄ',
        subtitle: 'Co Bóg złączył, człowiek niech nie rozdziela. Dziękujemy za modlitwę.',
        duration: 4.0,
        style: 'classic',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'ceremony', name: 'Wejście i Liturgia', targetDurationSec: 90, description: 'Orszak ślubny i błogosławieństwo' },
        { chapterKey: 'ceremony', name: 'Słowa Przysięgi', targetDurationSec: 180, description: 'Uroczysta przysięga i nałożenie obrączek' },
        { chapterKey: 'congratulations', name: 'Wyjście i Życzenia', targetDurationSec: 60, description: 'Wyjście w deszczu płatków róż' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_photo_mix',
    userId: 'system',
    title: 'Photo Gallery Mix (Wspomnienia Foto & Wideo)',
    description: 'Dedykowana struktura do mieszania zdjęć z krótkimi nagraniami wideo, łagodnymi przenikaniami i ozdobnymi podpisami.',
    category: 'photo_mix',
    icon: '🖼️',
    isPrebuilt: true,
    structure: {
      pacing: 'emotional',
      colorGrade: 'pastel_boho',
      resolution: '1080p',
      fps: 30,
      fitMode: 'fit',
      applySmartTrim: false,
      applyTransitions: true,
      suggestedMusicPreset: 'venice_strings',
      introCard: {
        enabled: true,
        text: 'GALERIA WSPOMNIEŃ',
        subtitle: 'Najpiękniejsze Chwile z Naszego Dnia',
        duration: 3.0,
        style: 'elegant',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'NA ZAWSZE RAZEM',
        subtitle: 'Joanna & Piotr • Dziękujemy za obecność w naszym życiu',
        duration: 4.0,
        style: 'elegant',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'preparations', name: 'Detale i Portrety', targetDurationSec: 45, description: 'Fotografie przygotowań i uśmiechy' },
        { chapterKey: 'outdoor', name: 'Sesja Plenerowa', targetDurationSec: 60, description: 'Spacer zakochanych w koronie drzew' },
        { chapterKey: 'family', name: 'Portrety Rodzinne', targetDurationSec: 45, description: 'Pamiątkowe zdjęcia z najbliższymi' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_party_reel',
    userId: 'system',
    title: 'Dynamic Party Reel (Szalony Parkiet)',
    description: 'Szybki, energetyczny teledysk skupiony na imprezie weselnej, oczepinach, zabawie z gośćmi i konfetti.',
    category: 'party_reel',
    icon: '🎉',
    isPrebuilt: true,
    structure: {
      pacing: 'dynamic',
      colorGrade: 'vivid_master',
      resolution: 'vertical_1080p',
      fps: 60,
      fitMode: 'fill',
      applySmartTrim: true,
      applyTransitions: true,
      suggestedMusicPreset: 'boho_celebration',
      introCard: {
        enabled: true,
        text: 'WESELNY VIBE',
        subtitle: 'Noc pełna emocji, tańca i radości',
        duration: 2.5,
        style: 'cinematic',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'DZIĘKUJEMY ZA ZABAWĘ!',
        subtitle: 'Do zobaczenia na kolejnej rocznicy!',
        duration: 3.0,
        style: 'cinematic',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'toast', name: 'Uroczyste Toasty', targetDurationSec: 30, description: 'Wyrazy radości i kieliszki w górę' },
        { chapterKey: 'first_dance', name: 'Pierwszy Taniec', targetDurationSec: 45, description: 'Efektowne obroty i wybuch dymu' },
        { chapterKey: 'party', name: 'Szarża na Parkiecie', targetDurationSec: 90, description: 'Pociąg weselny i zabawy imprezowe' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function getUserTemplates(): Promise<ProjectTemplate[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = `users/${user.uid}/templates`;
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const userTemplates: ProjectTemplate[] = [];
    snapshot.forEach(docSnap => {
      userTemplates.push(docSnap.data() as ProjectTemplate);
    });

    return userTemplates;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.GET, path);
    } else {
      console.warn(`[Firestore Templates] Nie można pobrać szablonów z chmury (${path}):`, errMsg);
    }
    return [];
  }
}

export async function saveUserTemplate(template: Omit<ProjectTemplate, 'userId' | 'createdAt' | 'updatedAt'>): Promise<ProjectTemplate> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Musisz być zalogowany, aby zapisać szablon w chmurze Firebase.');
  }

  const templateId = template.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `users/${user.uid}/templates/${templateId}`;

  const fullTemplate: ProjectTemplate = {
    ...template,
    id: templateId,
    userId: user.uid,
    isPrebuilt: false,
    structure: safeClone(template.structure),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, path), fullTemplate, { merge: true });
    return fullTemplate;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } else {
      console.warn(`[Firestore Templates] Błąd zapisu szablonu (${path}):`, errMsg);
    }
    throw error;
  }
}

export async function deleteUserTemplate(templateId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const path = `users/${user.uid}/templates/${templateId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } else {
      console.warn(`[Firestore Templates] Błąd usuwania szablonu (${path}):`, errMsg);
    }
    throw error;
  }
}
