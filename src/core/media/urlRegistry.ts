/**
 * Memory Safety: Central Object URL Registry.
 * Guarantees that every createObjectURL is tracked and revoked when no longer needed.
 */
class UrlRegistry {
  private urls = new Set<string>();
  private blobToUrl = new WeakMap<Blob, string>();
  private refCount = new Map<string, number>();

  create(blob: Blob): string {
    if (this.blobToUrl.has(blob)) {
      const existing = this.blobToUrl.get(blob)!;
      const count = this.refCount.get(existing) || 1;
      this.refCount.set(existing, count + 1);
      return existing;
    }

    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    this.blobToUrl.set(blob, url);
    this.refCount.set(url, 1);
    return url;
  }

  release(url: string | undefined | null) {
    if (!url || !url.startsWith('blob:')) return;

    const count = (this.refCount.get(url) || 1) - 1;
    if (count <= 0) {
      this.refCount.delete(url);
      this.urls.delete(url);
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
    this.refCount.clear();
  }

  getActiveCount(): number {
    return this.urls.size;
  }
}

export const urlRegistry = new UrlRegistry();
