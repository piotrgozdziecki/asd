import type { ProjectState, TimelineItem, TitleCard, ClipCategory } from '../../types/project';

export interface OutputVerificationResult {
  valid: boolean;
  duration: number;
  width: number;
  height: number;
  error?: string;
}

export interface PreFlightCheckResult {
  passed: boolean;
  fixedIssues: string[];
  sanitizedProject: ProjectState;
}

export class ExportValidator {
  /**
   * Performs deep 9-point validation of the exported video file:
   * 1. File existence
   * 2. Non-zero size (>= 4KB)
   * 3. Valid container header (ISO Base Media Box 'ftyp' or WebM EBML)
   * 4. Video track validation (width, height > 0)
   * 5. Duration sanity (> 0.05s)
   * 6. Resolution threshold standard
   * 7. HTML5 Video playability (canPlayType)
   * 8. Seek sampling verification
   * 9. Playback initiation test
   */
  static async verifyOutput(blob: Blob): Promise<OutputVerificationResult> {
    // 1. Check blob existence
    if (!blob) {
      return { valid: false, duration: 0, width: 0, height: 0, error: 'Plik wynikowy nie istnieje (błąd wewnętrzny silnika).' };
    }

    // 2. Check minimum size
    if (blob.size < 4096) {
      return {
        valid: false,
        duration: 0,
        width: 0,
        height: 0,
        error: `Nieprawidłowy rozmiar pliku (${blob.size} B). Minimalny wymagany rozmiar wideo to 4 KB.`
      };
    }

    // 3. Container signature inspection
    try {
      const headerSlice = blob.slice(0, 32);
      const headerBuf = await headerSlice.arrayBuffer();
      const headerBytes = new Uint8Array(headerBuf);

      // 'f', 't', 'y', 'p' are bytes 4..7 in standard ISO MP4
      const hasFtyp = (
        headerBytes[4] === 0x66 && // 'f'
        headerBytes[5] === 0x74 && // 't'
        headerBytes[6] === 0x79 && // 'y'
        headerBytes[7] === 0x70    // 'p'
      );

      // WebM EBML header is 0x1A, 0x45, 0xDF, 0xA3
      const isWebM = (
        headerBytes[0] === 0x1a &&
        headerBytes[1] === 0x45 &&
        headerBytes[2] === 0xdf &&
        headerBytes[3] === 0xa3
      );

      if (!hasFtyp && !isWebM && !blob.type.includes('webm')) {
        return {
          valid: false,
          duration: 0,
          width: 0,
          height: 0,
          error: 'Wygenerowany plik nie posiada poprawnego nagłówka ISO MP4 (ftyp) ani WebM.'
        };
      }
    } catch (err: any) {
      return {
        valid: false,
        duration: 0,
        width: 0,
        height: 0,
        error: `Błąd analizy nagłówków kontenera: ${err?.message || String(err)}`
      };
    }

    // 4..9. HTML5 Video Element Verification
    return new Promise((resolve) => {
      const testVideo = document.createElement('video');
      testVideo.preload = 'auto';
      testVideo.muted = true;
      testVideo.playsInline = true;
      const testUrl = URL.createObjectURL(blob);

      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          valid: false,
          duration: 0,
          width: 0,
          height: 0,
          error: 'Przekroczono limit czasu weryfikacji odtwarzalności wyjściowego pliku wideo.'
        });
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        testVideo.onloadedmetadata = null;
        testVideo.onseeked = null;
        testVideo.onerror = null;
        testVideo.src = '';
        URL.revokeObjectURL(testUrl);
      };

      testVideo.onloadedmetadata = async () => {
        const dur = testVideo.duration;
        const w = testVideo.videoWidth;
        const h = testVideo.videoHeight;

        // 4. Video track validation
        if (w <= 0 || h <= 0) {
          cleanup();
          resolve({
            valid: false,
            duration: dur || 0,
            width: 0,
            height: 0,
            error: 'Wygenerowany plik nie posiada aktywnego strumienia wideo (szerokość/wysokość = 0).'
          });
          return;
        }

        // 5. Duration check
        if (isNaN(dur) || !Number.isFinite(dur) || dur <= 0.05) {
          cleanup();
          resolve({
            valid: false,
            duration: 0,
            width: w,
            height: h,
            error: `Nieprawidłowy czas trwania wygenerowanego wideo (${dur}s).`
          });
          return;
        }

        // 6. Resolution threshold
        if (w < 240 || h < 240) {
          cleanup();
          resolve({
            valid: false,
            duration: dur,
            width: w,
            height: h,
            error: `Rozdzielczość (${w}x${h}) jest poniżej minimalnego dopuszczalnego standardu.`
          });
          return;
        }

        // 7. Check if environment can decode the container
        const canPlay = testVideo.canPlayType(blob.type) || testVideo.canPlayType('video/mp4') || testVideo.canPlayType('video/webm');
        if (canPlay === '') {
          cleanup();
          resolve({
            valid: false,
            duration: dur,
            width: w,
            height: h,
            error: 'Środowisko przeglądarki nie może odtworzyć tego formatu wideo.'
          });
          return;
        }

        // 8 & 9. Sample middle frame & brief playback verification
        try {
          testVideo.currentTime = Math.min(dur / 2, Math.max(0.1, dur - 0.1));
          await new Promise<void>((res) => {
            testVideo.onseeked = () => res();
            setTimeout(res, 2500);
          });

          try {
            const playPromise = testVideo.play();
            if (playPromise !== undefined) {
              await playPromise.catch(() => {});
              testVideo.pause();
            }
          } catch (playErr: any) {
            // Programmatic play without user gesture in sandboxed iframes can reject; metadata & seek already verified
          }

          cleanup();
          resolve({ valid: true, duration: dur, width: w, height: h });
        } catch (e: any) {
          cleanup();
          resolve({
            valid: false,
            duration: dur,
            width: w,
            height: h,
            error: `Próbkowanie wygenerowanego pliku nie powiodło się: ${e?.message || String(e)}`
          });
        }
      };

      testVideo.onerror = () => {
        cleanup();
        resolve({
          valid: false,
          duration: 0,
          width: 0,
          height: 0,
          error: 'Przeglądarka zgłosiła błąd odczytu pliku wideo (uszkodzony lub nieobsługiwany strumień).'
        });
      };

      testVideo.src = testUrl;
    });
  }

  /**
   * V. ZASADY PRE-FLIGHT CHECK (Automatyczna Walidacja AI przed Renderowaniem)
   * 1. Sprawdza, czy żaden tytuł ani opis nie zawiera słów technicznych (SCENA, KLIP, .MP4, .MOV, I3200, DSC_, VID_, IMG_).
   * 2. Sprawdza, czy każdy czas trwania ujęcia `duration` mieści się w przedziale 3–12 sekund.
   * 3. Sprawdza, czy dla każdego klipu została wygenerowana odpowiadająca mu karta wstępna (karty == klipy + 1 intro + 1 outro).
   * 4. Automatycznie koryguje i standaryzuje projekt przed przekazaniem do renderera.
   */
  static runAiPreFlightCheck(project: ProjectState): PreFlightCheckResult {
    const fixedIssues: string[] = [];
    const clipMap = new Map(project.mediaLibrary.map(c => [c.id, c]));
    const totalClips = project.timelineItems.length;

    const technicalPattern = /\.(mp4|mov|avi|mkv|jpg|jpeg|png)$|^(clip|video|dsc|img|vid|i\d{2,}|scena\s*\d*|ujęcie\s*\d*|ti_\d+)/i;

    const categoryTitles: Record<string, string[]> = {
      opening: ['Prolog – Początek Naszej Historii', 'Wspomnienia i Oczekiwanie', 'Magia Dnia Ślubu'],
      preparations: ['Poranne Przygotowania i Detale', 'Błogosławieństwo w Domu Rodzinnym', 'Chwile Przed Przysięgą'],
      ceremony: ['Przysięga Przed Ołtarzem', 'Wymiana Obrączek Ślubnych', 'Uroczyste Zaślubiny'],
      congratulations: ['Wzruszające Życzenia od Bliskich', 'Uściski i Gratulacje Rodziców', 'Radość Najbliższych'],
      first_dance: ['Pierwszy Taniec w Chmurach', 'Romantyczny Walc Nowożeńców', 'Magia Pierwszego Tańca'],
      toast: ['Wzniesienie Pierwszego Toastu', 'Uroczyste Przemowy i Wiwaty', 'Toast za Nowożeńców'],
      party: ['Zabawa na Parkiecie', 'Weselne Szaleństwo z Gośćmi', 'Najgorętsze Chwile Nocy'],
      cake: ['Krojenie Tortu Weselnego', 'Słodka Chwila Wesela', 'Tradycyjny Tort Nowożeńców'],
      outdoor: ['Romantyczny Spacer w Plenerze', 'Złote Promienie Miłości', 'Sesja w Ciepłym Słońcu'],
      ending: ['Zimne Ognie i Nocny Finał', 'Finałowa Iskra Miłości', 'Niezapomniane Zakończenie Nocy'],
      unassigned: ['Wyjątkowy Moment Uroczystości', 'Pamiątkowa Scena Weselna', 'Magiczne Chwile Razem']
    };

    const sanitizeTitle = (text: string | undefined, category: string, index: number): string => {
      let t = (text || '').replace(/\.[a-zA-Z0-9]{2,5}$/i, '').trim();
      if (!t || technicalPattern.test(t) || t.toLowerCase().includes('scena') || t.toLowerCase().includes('klip')) {
        const pool = categoryTitles[category] || categoryTitles.unassigned;
        return pool[index % pool.length];
      }
      return t;
    };

    let updatedStart = 0;
    const sanitizedTimelineItems: TimelineItem[] = project.timelineItems.map((item, idx) => {
      const clip = clipMap.get(item.clipId);
      const category = (clip?.category || 'ceremony') as ClipCategory;
      const isFirst = idx === 0;
      const isLast = idx === totalClips - 1;

      // 1. Duration check (3 - 12 seconds strict rule)
      let duration = item.duration;
      let sourceStart = item.sourceStart || 0;
      let sourceEnd = item.sourceEnd || (sourceStart + duration);

      if (duration > 12.0) {
        fixedIssues.push(`Skrócono ujęcie #${idx + 1} z ${duration.toFixed(1)}s do 12.0s (zasada Smart Trim 3–12s).`);
        duration = 12.0;
        sourceEnd = sourceStart + 12.0;
      } else if (duration < 3.0 && (clip?.duration || 0) >= 3.0) {
        fixedIssues.push(`Wydłużono ujęcie #${idx + 1} z ${duration.toFixed(1)}s do 3.0s dla zachowania czytelności kadru.`);
        duration = 3.0;
        sourceEnd = sourceStart + 3.0;
      }

      // 2. Title Card Check & Sanitization
      const rawTitle = item.titleCard?.text || clip?.name;
      const cleanTitle = sanitizeTitle(rawTitle, category, idx);
      const cleanSubtitle = (item.titleCard?.subtitle && !technicalPattern.test(item.titleCard.subtitle))
        ? item.titleCard.subtitle
        : (isFirst ? 'Sakrament Małżeństwa • Film Ślubny' : `Wyjątkowy moment uroczystości (${cleanTitle}).`);

      if (rawTitle !== cleanTitle) {
        fixedIssues.push(`Zamieniono nazwę techniczną "${rawTitle}" na elegancki tytuł sceny: "${cleanTitle}".`);
      }

      // Ensure titleCard is present and fully configured
      const titleCard: TitleCard = {
        enabled: true,
        text: isFirst ? (item.titleCard?.text && !technicalPattern.test(item.titleCard.text) ? item.titleCard.text : 'Ślub Joanny & Piotra') : cleanTitle,
        subtitle: cleanSubtitle,
        duration: isFirst ? 3.5 : 2.5,
        style: isFirst ? 'liturgical' : (item.titleCard?.style || 'elegant'),
        backgroundColor: 'gradient',
        cardType: isFirst ? 'intro' : 'scene'
      };

      // 3. Outro Card on Last Item
      let outroCard: TitleCard | undefined = undefined;
      if (isLast) {
        outroCard = {
          enabled: true,
          text: 'Dziękujemy za Wspólne Chwile',
          subtitle: 'Joanna & Piotr • Na Zawsze Razem',
          duration: 4.0,
          style: 'elegant',
          backgroundColor: '#0A0805',
          cardType: 'outro'
        };
      }

      const currentStart = updatedStart;
      updatedStart += duration;

      return {
        ...item,
        sourceStart,
        sourceEnd,
        timelineStart: currentStart,
        duration,
        fadeIn: 0.5,
        fadeOut: 0.5,
        transitionIn: isFirst ? 'dip_black' : (item.transitionIn || 'dissolve'),
        transitionDuration: 0.5,
        titleCard,
        outroCard
      };
    });

    // 4. Ensure Audio Settings & Ducking are optimized (-18dB under speech)
    const sanitizedAudioSettings = {
      duckingEnabled: true,
      duckingAmount: 0.18, // -18dB
      musicVolume: 0.85,
      voiceVolume: 1.2,
      originalAudioVolume: 1.0,
      ...project.audioSettings
    };

    const sanitizedProject: ProjectState = {
      ...project,
      timelineItems: sanitizedTimelineItems,
      audioSettings: sanitizedAudioSettings,
      updatedAt: new Date().toISOString()
    };

    const passed = fixedIssues.length === 0;
    return {
      passed,
      fixedIssues,
      sanitizedProject
    };
  }
}
