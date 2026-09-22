// Helper to extract metadata and thumbnail from a video file without loading the whole file into memory
export async function extractVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number; fps?: number; thumbnailUrl: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    
    video.onloadedmetadata = () => {
      // Seek to 1 second or middle to grab a thumbnail, avoiding black frames at 0s
      const targetTime = video.duration > 2 ? 1 : video.duration / 2;
      video.currentTime = targetTime;
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      // We don't revoke the objectUrl here if we want to play it later, 
      // but typically we should manage these URLs carefully to avoid memory leaks.
      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        thumbnailUrl
      });
    };
    
    video.onerror = (e) => {
      reject(new Error('Failed to load video metadata: ' + (video.error?.message || 'Unknown error')));
    };
  });
}
