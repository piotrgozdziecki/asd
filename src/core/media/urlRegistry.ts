/**
 * Memory Safety: Central Object URL Registry.
 * Guarantees that every createObjectURL is tracked and revoked when no longer needed,
 * while preventing returning stale revoked URLs.
 */
class UrlRegistry {
  private urls = new Set<string>();
  private blobToUrl = new WeakMap<Blob, string>();
  private urlToBlob = new Map<string, Blob>();
  private refCount = new Map<string, number>();

  create(blob: Blob): string {
    if (this.blobToUrl.has(blob)) {
      const existing = this.blobToUrl.get(blob)!;
      // Only reuse if URL is still alive in the active registry
      if (this.urls.has(existing)) {
        const count = this.refCount.get(existing) || 1;
        this.refCount.set(existing, count + 1);
        return existing;
      }
      // If it was revoked previously, clear stale mapping
      this.blobToUrl.delete(blob);
    }

    // Ensure blob has a valid MIME type to prevent MEDIA_ERR_SRC_NOT_SUPPORTED in browsers
    let blobToCreate = blob;
    if (!blob.type || blob.type === 'application/octet-stream' || blob.type.trim() === '') {
      const name = (blob as any).name || '';
      const isLikelyImage = /\.(jpe?g|png|webp|gif)$/i.test(name);
      const isLikelyAudio = /\.(mp3|wav|ogg|m4a|aac)$/i.test(name);
      const mime = isLikelyImage ? 'image/jpeg' : (isLikelyAudio ? 'audio/mpeg' : 'video/mp4');
      blobToCreate = new Blob([blob], { type: mime });
    }

    const url = URL.createObjectURL(blobToCreate);
    this.urls.add(url);
    this.blobToUrl.set(blob, url);
    this.urlToBlob.set(url, blob);
    this.refCount.set(url, 1);
    return url;
  }

  isAlive(url: string | undefined | null): boolean {
    if (!url || !url.startsWith('blob:')) return false;
    return this.urls.has(url);
  }

  release(url: string | undefined | null) {
    if (!url || !url.startsWith('blob:')) return;

    const count = (this.refCount.get(url) || 1) - 1;
    if (count <= 0) {
      this.refCount.delete(url);
      this.urls.delete(url);
      const blob = this.urlToBlob.get(url);
      if (blob) {
        this.blobToUrl.delete(blob);
        this.urlToBlob.delete(url);
      }
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore already revoked
      }
    } else {
      this.refCount.set(url, count);
    }
  }

  releaseAll() {
    this.urls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore
      }
    });
    this.urls.clear();
    this.urlToBlob.clear();
    this.refCount.clear();
  }

  getActiveCount(): number {
    return this.urls.size;
  }
}

export const urlRegistry = new UrlRegistry();
