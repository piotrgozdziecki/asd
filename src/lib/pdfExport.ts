import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Storyboard, MediaItem } from '../types/legacy';

export interface PdfExportProgress {
  status: 'preparing' | 'rendering' | 'compiling' | 'ready' | 'error';
  percent: number;
  message: string;
}

/**
 * Sanitizes Polish text to filename-safe characters
 */
function toSafeFilename(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40);
  return `scenariusz_slubny_${normalized || 'storyboard'}.pdf`;
}

/**
 * Creates printable A4 HTML pages offscreen and converts them to high-resolution vector/canvas PDF
 */
export async function generateStoryboardPdf(
  storyboard: Storyboard,
  mediaItems: MediaItem[] = [],
  onProgress?: (progress: PdfExportProgress) => void
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.({
    status: 'preparing',
    percent: 10,
    message: 'Przygotowywanie szablonu drukarskiego A4...'
  });

  // Create temporary container for offscreen rendering
  const container = document.createElement('div');
  container.id = 'pdf-export-render-container';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // 210mm at 96 DPI
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#1A1918';
  container.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
  container.style.zIndex = '-1000';
  container.style.opacity = '1';

  document.body.appendChild(container);

  try {
    const timeline = storyboard.timeline || [];
    const scenesPerPage = 3; // Keep scene cards spacious and readable
    const totalScenePages = Math.max(1, Math.ceil(timeline.length / scenesPerPage));
    const totalPages = 1 + totalScenePages; // Page 1 = Production Slate; Page 2..N = Scenes

    const pagesHtml: string[] = [];

    // --- PAGE 1: PRODUCTION SLATE & DIRECTOR VISION ---
    pagesHtml.push(`
      <div class="a4-page" style="width: 794px; min-height: 1123px; max-height: 1123px; box-sizing: border-box; padding: 48px; background: #FFFFFF; position: relative; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; border: 1px solid #E5E0D8;">
        <div>
          <!-- Elegant Top Crest & Branding -->
          <div style="border-bottom: 2px solid #C5A059; padding-bottom: 18px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #9E7B36; margin-bottom: 4px;">
                ✦ AETHEL WEDDING CINEMA STUDIO ✦
              </div>
              <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 800; color: #1A1918; line-height: 1.15;">
                OFICJALNY SCENARIUSZ REŻYSERSKI
              </div>
            </div>
            <div style="text-align: right;">
              <span style="display: inline-block; background: #FAF5EB; border: 1px solid #E2D1B0; color: #8A6828; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px;">
                DOKUMENT PRODUKCYJNY
              </span>
              <div style="font-size: 10px; color: #78716C; margin-top: 4px; font-family: monospace;">
                Data wydania: ${new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <!-- Storyboard Title & Concept Box -->
          <div style="background: #FAF8F5; border: 1px solid #EAE3D8; border-left: 4px solid #C5A059; border-radius: 12px; padding: 22px; margin-bottom: 24px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #8A6828; margin-bottom: 6px;">
              Tytuł Projektu Filmowego
            </div>
            <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 800; color: #1A1918; margin: 0 0 10px 0; line-height: 1.2;">
              ${storyboard.title || 'Wesele Filmowe'}
            </h1>
            <p style="font-size: 13px; line-height: 1.6; color: #44403C; margin: 0; font-weight: 450;">
              ${storyboard.concept || 'Profesjonalny scenariusz montażowy i reżyserski rejestrujący kluczowe emocje dnia ślubu.'}
            </p>
          </div>

          <!-- Production Parameters Grid -->
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 24px;">
            <div style="border: 1px solid #E7E5E4; border-radius: 10px; padding: 14px; background: #FFFFFF;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #78716C; margin-bottom: 4px;">
                Format & Proporcje
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #1C1917;">
                ${storyboard.format === 'reel' ? 'Reels / TikTok (Pion 9:16)' : storyboard.format === 'documentary' ? 'Pełen Reportaż 4K (16:9)' : 'Highlight Teledysk (16:9)'}
              </div>
              <div style="font-size: 11px; color: #78716C; margin-top: 2px;">
                Nastrój: <strong>${storyboard.mood ? storyboard.mood.toUpperCase() : 'ROMANTYCZNY'}</strong>
              </div>
            </div>

            <div style="border: 1px solid #E7E5E4; border-radius: 10px; padding: 14px; background: #FFFFFF;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #78716C; margin-bottom: 4px;">
                Ścieżka Dźwiękowa (Soundtrack)
              </div>
              <div style="font-size: 13px; font-weight: 700; color: #8A6828; line-height: 1.3;">
                ${storyboard.musicSuggestion || 'Akustyczna symfonia, fortepian & smyczki'}
              </div>
              <div style="font-size: 11px; color: #78716C; margin-top: 2px;">
                Synchronizacja ujęć do tempa i kluczowych akcentów
              </div>
            </div>

            <div style="border: 1px solid #E7E5E4; border-radius: 10px; padding: 14px; background: #FFFFFF;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #78716C; margin-bottom: 4px;">
                Skala Projektu & Czas
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #1C1917;">
                ${timeline.length} Sekwencji Montażowych
              </div>
              <div style="font-size: 11px; color: #78716C; margin-top: 2px;">
                Szacowany czas realizacji: ${timeline.length * 5 - 10} - ${timeline.length * 8 + 15} sekund
              </div>
            </div>

            <div style="border: 1px solid #E7E5E4; border-radius: 10px; padding: 14px; background: #FFFFFF;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #78716C; margin-bottom: 4px;">
                Klatkaż & Standard Wideo
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #1C1917;">
                24 fps Kinowy • 60/120 fps Slow-Mo
              </div>
              <div style="font-size: 11px; color: #78716C; margin-top: 2px;">
                Kolor: Profil Naturalny z ciepłym złotym gradingiem
              </div>
            </div>
          </div>

          <!-- Director Voiceover Box (if provided) -->
          ${storyboard.voiceover ? `
            <div style="background: #FDFBF7; border: 1px dashed #D6C4A5; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span style="color: #9E7B36; font-size: 14px;">🎙️</span>
                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #8A6828;">
                  Głos Lektorski & Przysięga (Voiceover)
                </span>
              </div>
              <blockquote style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 13px; line-height: 1.6; color: #292524; margin: 0; padding-left: 12px; border-left: 2px solid #C5A059;">
                "${storyboard.voiceover}"
              </blockquote>
            </div>
          ` : ''}

          <!-- Technical Rider for Camera Crew on Set -->
          <div style="border: 1px solid #E7E5E4; border-radius: 12px; padding: 18px; background: #FAF9F6;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #1A1918; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <span>📋</span> WSKAZÓWKI TECHNICZNE DLA EKIPY FILMOWEJ NA PLANIE:
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 11px; color: #44403C; line-height: 1.4;">
              <div style="display: flex; gap: 8px;">
                <span style="color: #9E7B36; font-weight: bold;">✔</span>
                <span><strong>Audio:</strong> Przypięcie mikroportu bezprzewodowego do garnituru Pana Młodego 30 min przed ceremonią.</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #9E7B36; font-weight: bold;">✔</span>
                <span><strong>Światło:</strong> Zarezerwowanie 25 minut na sesję o Złotej Godzinie (Golden Hour) tuż przed zachodem.</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #9E7B36; font-weight: bold;">✔</span>
                <span><strong>Kamera B:</strong> Ustawienie statywu z szerokim obiektywem 24mm jako plan ogólny ołtarza / sali.</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #9E7B36; font-weight: bold;">✔</span>
                <span><strong>Dublowanie:</strong> Podwójny zapis na karty SD (Dual-Slot Backup) w trakcie kluczowych momentów.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #E7E5E4; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #A8A29E; font-family: monospace;">
          <span>Strona 1 z ${totalPages} • Wersja Reżyserska</span>
          <span>Wygenerowano w AI Wedding Storyboard Studio</span>
        </div>
      </div>
    `);

    // --- PAGES 2+: DETAILED SCENE-BY-SCENE TIMELINE ---
    for (let p = 0; p < totalScenePages; p++) {
      const pageIndex = p + 2;
      const startIdx = p * scenesPerPage;
      const pageScenes = timeline.slice(startIdx, startIdx + scenesPerPage);

      pagesHtml.push(`
        <div class="a4-page" style="width: 794px; min-height: 1123px; max-height: 1123px; box-sizing: border-box; padding: 48px; background: #FFFFFF; position: relative; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; border: 1px solid #E5E0D8;">
          <div>
            <!-- Header for Timeline Pages -->
            <div style="border-bottom: 2px solid #C5A059; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #9E7B36;">
                  TABELA UJĘĆ & HARMONOGRAM MONTAŻU
                </span>
                <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 700; color: #1A1918;">
                  ${storyboard.title || 'Scenariusz Ślubny'}
                </div>
              </div>
              <div style="background: #FAF5EB; border: 1px solid #E2D1B0; color: #8A6828; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-family: monospace;">
                Sekwencje #${startIdx + 1} – #${Math.min(startIdx + scenesPerPage, timeline.length)}
              </div>
            </div>

            <!-- Scene Cards -->
            <div style="display: flex; flex-direction: column; gap: 16px;">
              ${pageScenes.map((scene, idx) => {
                const globalIdx = startIdx + idx;
                const mediaItem = mediaItems[globalIdx];
                const hasMedia = !!mediaItem;
                const isVideo = mediaItem?.mimeType?.startsWith('video') || mediaItem?.name?.match(/\.(mp4|mov|webm)$/i);

                return `
                  <div style="border: 1px solid #E7E5E4; border-radius: 12px; padding: 18px; background: #FAFAF9; position: relative; border-left: 4px solid #C5A059;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="background: #1C1917; color: #F5F5F4; font-size: 11px; font-weight: 800; font-family: monospace; padding: 3px 8px; border-radius: 6px;">
                          UJĘCIE #${globalIdx + 1}
                        </span>
                        <span style="background: #FEF3C7; color: #92400E; font-size: 11px; font-weight: 700; font-family: monospace; padding: 3px 8px; border-radius: 6px; border: 1px solid #FCD34D;">
                          ⏱ ${scene.time || `00:${String(globalIdx * 8).padStart(2, '0')}`}
                        </span>
                        ${hasMedia ? `
                          <span style="background: #DCFCE7; color: #166534; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
                            ${isVideo ? '🎥 WIDEO' : '📷 ZDJĘCIE'}
                          </span>
                        ` : ''}
                      </div>

                      <div style="font-size: 10px; color: #78716C; font-family: monospace; border: 1px dashed #D6D3D1; padding: 3px 8px; border-radius: 4px;">
                        [ ] ZREALIZOWANE / OK
                      </div>
                    </div>

                    <!-- Element Name & Action -->
                    <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; color: #1C1917; margin-bottom: 6px;">
                      ${scene.elementName || `Kadr filmowy #${globalIdx + 1}`}
                    </div>

                    <div style="font-size: 12px; line-height: 1.5; color: #44403C; margin-bottom: 10px; background: #FFFFFF; padding: 10px 12px; border-radius: 8px; border: 1px solid #F0EFEA;">
                      <strong style="color: #1C1917; display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; color: #8A6828;">
                        Akcja przed kamerą:
                      </strong>
                      ${scene.action || 'Rejestracja ujęcia zgodnie z wizją reżyserską.'}
                    </div>

                    <!-- Director Note / Technical Specifications -->
                    <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; background: #F5F3EF; padding: 8px 12px; border-radius: 8px; font-size: 11px;">
                      <div>
                        <span style="font-weight: 700; color: #78350F; text-transform: uppercase; font-size: 10px;">
                          🎬 Wskazówka Reżyserska & Kadr:
                        </span>
                        <div style="color: #451A03; margin-top: 2px; font-style: italic;">
                          ${scene.directorNote || 'Ujęcie stabilizowane na gimbalu, płynny ruch, płytka głębia ostrości.'}
                        </div>
                      </div>

                      ${hasMedia && mediaItem.name ? `
                        <div style="text-align: right; font-family: monospace; font-size: 10px; color: #78716C; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          Plik: ${mediaItem.name}
                        </div>
                      ` : ''}
                    </div>

                    <!-- Operator Notes Field for Printing -->
                    <div style="margin-top: 10px; border-top: 1px dashed #E2DDD5; padding-top: 6px; display: flex; justify-content: space-between; font-size: 10px; color: #A8A29E; font-family: monospace;">
                      <span>Dubel: [ 1 ] [ 2 ] [ 3 ]</span>
                      <span>Kąt: [ Szeroki ] [ Detal ] [ Portret ]</span>
                      <span>Notatki z planu: ____________________</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #E7E5E4; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #A8A29E; font-family: monospace;">
            <span>Strona ${pageIndex} z ${totalPages} • Reżyseria & Montaż</span>
            <span>✦ Aethel Wedding Cinema Studio ✦</span>
          </div>
        </div>
      `);
    }

    // Insert all pages into DOM container
    container.innerHTML = pagesHtml.join('');

    onProgress?.({
      status: 'rendering',
      percent: 40,
      message: 'Renderowanie stron A4 o wysokiej rozdzielczości...'
    });

    // Create jsPDF instance (A4 Portrait in mm: 210 x 297)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageElements = container.querySelectorAll('.a4-page');
    const totalRenderPages = pageElements.length;

    for (let i = 0; i < totalRenderPages; i++) {
      const pageEl = pageElements[i] as HTMLElement;
      
      const canvas = await html2canvas(pageEl, {
        scale: 2, // 2x scale for ultra-crisp Retina / 300 DPI print quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      // 210mm x 297mm full-bleed A4 placement
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

      const progressPercent = Math.round(40 + ((i + 1) / totalRenderPages) * 50);
      onProgress?.({
        status: 'compiling',
        percent: progressPercent,
        message: `Kompilowanie strony ${i + 1} z ${totalRenderPages}...`
      });
    }

    onProgress?.({
      status: 'ready',
      percent: 100,
      message: 'Plik PDF gotowy do pobrania!'
    });

    const pdfBlob = pdf.output('blob');
    const filename = toSafeFilename(storyboard.title || 'scenariusz');

    return { blob: pdfBlob, filename };
  } finally {
    // Clean up temporary DOM container
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Downloads the generated PDF directly to the user's device and triggers native share if supported
 */
export async function downloadStoryboardPdfFile(
  storyboard: Storyboard,
  mediaItems: MediaItem[] = [],
  onProgress?: (progress: PdfExportProgress) => void
): Promise<{ success: boolean; filename: string }> {
  try {
    const { blob, filename } = await generateStoryboardPdf(storyboard, mediaItems, onProgress);

    // Create download link
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Free memory after a brief delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    return { success: true, filename };
  } catch (error: any) {
    onProgress?.({
      status: 'error',
      percent: 0,
      message: error?.message || 'Błąd podczas generowania pliku PDF'
    });
    throw error;
  }
}

/**
 * Shares the PDF using the Web Share API (mobile devices, WhatsApp, AirDrop, etc.)
 */
export async function shareStoryboardPdfFile(
  storyboard: Storyboard,
  mediaItems: MediaItem[] = [],
  onProgress?: (progress: PdfExportProgress) => void
): Promise<boolean> {
  const { blob, filename } = await generateStoryboardPdf(storyboard, mediaItems, onProgress);
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: storyboard.title || 'Scenariusz Ślubny PDF',
        text: `Scenariusz reżyserski ślubny: ${storyboard.title} do druku i realizacji na planie.`
      });
      return true;
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        // If sharing was cancelled by user, it's not an error
        console.warn('Błąd udostępniania:', e);
      }
    }
  }

  // Fallback to normal download
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  return true;
}
