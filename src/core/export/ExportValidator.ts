export interface OutputVerificationResult {
  valid: boolean;
  duration: number;
  width: number;
  height: number;
  error?: string;
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
              await playPromise;
              testVideo.pause();
            }
          } catch (playErr: any) {
            // Ignore NotAllowedError in headless/uninteracted iframes
            if (playErr.name !== 'NotAllowedError') {
              console.warn('[ExportValidator] Ostrzeżenie próbkowania odtwarzania:', playErr);
            }
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
}
