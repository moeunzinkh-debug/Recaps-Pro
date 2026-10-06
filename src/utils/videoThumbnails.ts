/**
 * Capture frame thumbnail from an HTML5 video element at a specific seek time.
 */
export async function captureFrameThumbnail(
  videoElement: HTMLVideoElement,
  targetTimeSec: number
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (!videoElement || !videoElement.src) {
        return resolve(null);
      }

      // Create an off-screen clone video to avoid interrupting the main player playback
      const tempVideo = document.createElement('video');
      tempVideo.crossOrigin = 'anonymous';
      tempVideo.src = videoElement.src;
      tempVideo.muted = true;
      tempVideo.playsInline = true;

      const timeout = setTimeout(() => {
        tempVideo.remove();
        resolve(null);
      }, 5000);

      tempVideo.addEventListener('loadedmetadata', () => {
        tempVideo.currentTime = Math.min(Math.max(0, targetTimeSec), tempVideo.duration || targetTimeSec);
      });

      tempVideo.addEventListener('seeked', () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 135; // 16:9 aspect ratio
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            tempVideo.remove();
            resolve(dataUrl);
          } else {
            tempVideo.remove();
            resolve(null);
          }
        } catch (e) {
          tempVideo.remove();
          resolve(null);
        }
      });

      tempVideo.addEventListener('error', () => {
        clearTimeout(timeout);
        tempVideo.remove();
        resolve(null);
      });

      tempVideo.load();
    } catch {
      resolve(null);
    }
  });
}
