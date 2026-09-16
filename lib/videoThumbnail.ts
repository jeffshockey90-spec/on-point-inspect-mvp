// Client-side video poster generation (canvas). Separate from lib/videoPoster,
// which is the SERVER ffmpeg extractor (child_process) — never mix the two in
// one module or the browser bundle breaks.
//
// The old approach grabbed a single frame ~25% in, which for dim footage (under
// a sink, a crawlspace, a dark utility closet) is often near-black — so the
// poster looked "missing." This samples several timestamps, measures each
// frame's average brightness, and keeps the brightest non-dark one — stopping
// early once it finds a clearly-lit frame. Falls back to the brightest of
// whatever it captured, so it never returns worse than before. The blob source
// is same-origin, so the canvas isn't tainted and getImageData works; if it ever
// throws, we still return a frame.

export async function createVideoThumbnailForUpload(file: File): Promise<File | null> {
  if (!file.type.startsWith("video/")) return null;

  return await new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let times: number[] = [];
    let idx = 0;
    let best: { blob: Blob; score: number } | null = null;

    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const done = () => {
      if (!best) {
        finish(null);
        return;
      }
      finish(
        new File([best.blob], `video-thumb-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      );
    };

    // Enough time for a few seeks, but never hang the upload.
    const timeout = window.setTimeout(() => done(), 6000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = objectUrl;
    video.onerror = () => finish(null);

    video.onloadedmetadata = () => {
      const duration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (duration > 0) {
        const last = Math.max(duration - 0.1, 0.3);
        times = [0.15, 0.35, 0.55, 0.75]
          .map((p) => Math.min(Math.max(duration * p, 0.3), last))
          .map((t) => Math.round(t * 100) / 100);
        times = Array.from(new Set(times));
      } else {
        times = [0.3];
      }
      seekNext();
    };

    function seekNext() {
      if (idx >= times.length) {
        done();
        return;
      }
      try {
        video.currentTime = times[idx];
      } catch {
        done();
      }
    }

    video.onseeked = () => {
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / vw);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          idx += 1;
          seekNext();
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Score the frame by average luminance (0-255). Higher = brighter.
        let score = 1;
        try {
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let sum = 0;
          let n = 0;
          const step = 4 * 20; // sample ~every 20th pixel for speed
          for (let i = 0; i < data.length; i += step) {
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            n += 1;
          }
          score = n ? sum / n : 1;
        } catch {
          score = 1; // tainted/unsupported — keep it as a candidate anyway
        }

        canvas.toBlob(
          (blob) => {
            if (blob && (!best || score > best.score)) best = { blob, score };
            // A clearly-lit frame is good enough — stop sampling.
            if (blob && score >= 60) {
              done();
              return;
            }
            idx += 1;
            seekNext();
          },
          "image/jpeg",
          0.78,
        );
      } catch {
        idx += 1;
        seekNext();
      }
    };
  });
}
