// Shared AI-frame helpers used by the live camera AND the background draft
// worker (lib/offline/draftQueue). Extracted from AILiveInspectionCamera so both
// the synchronous and the async-draft paths prepare frames identically.

// Read a File/Blob into a data-URL (for feeding the vision model). Browser-only.
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error || new Error("read failed"));
      r.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}

// Rebuild a File from a data-URL (e.g. a captured frame).
export function dataUrlToFile(dataUrl: string, namePrefix = "ai-camera-frame"): File {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], `${namePrefix}-${Date.now()}.jpg`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

// Downscale a captured frame to a smaller copy JUST for the AI request — a
// smaller image uploads faster and the vision model responds faster. Never
// touches the SAVED photo. Fail-open: returns the original on any error, and
// never upscales. 1600px / q0.72 matches the app's proven AI-upload baseline.
//
// IMPORTANT (field freeze fix): the decode + encode here run on EVERY Analyze,
// once per shot. The old path decoded via `<img>.src` and encoded via the
// SYNCHRONOUS `canvas.toDataURL`, both of which block the main thread — on a
// multi-angle finding that stacked into a multi-second UI freeze that then
// "recovered". This version decodes with createImageBitmap and encodes with
// convertToBlob/toBlob (both async / off the main thread), so the UI keeps
// breathing. Falls back to the legacy path where createImageBitmap is missing.
export async function shrinkForAi(
  dataUrl: string,
  maxWidth = 1600,
  quality = 0.72,
): Promise<string> {
  try {
    if (typeof document === "undefined") return dataUrl;
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return dataUrl;
    if (typeof createImageBitmap !== "function" || typeof fetch !== "function") {
      return shrinkForAiLegacy(dataUrl, maxWidth, quality);
    }

    // Decode off the main thread. fetch() of a data: URL + createImageBitmap
    // avoids both the synchronous atob loop and the synchronous image decode.
    const blobIn = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blobIn);
    const w = bmp.width;
    const h = bmp.height;
    if (!w || !h || w <= maxWidth) {
      bmp.close?.();
      return dataUrl; // already small enough
    }

    const scale = maxWidth / w;
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    let blobOut: Blob | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      const oc = new OffscreenCanvas(cw, ch);
      const octx = oc.getContext("2d");
      if (!octx) {
        bmp.close?.();
        return dataUrl;
      }
      octx.drawImage(bmp, 0, 0, cw, ch);
      bmp.close?.();
      blobOut = await oc.convertToBlob({ type: "image/jpeg", quality });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bmp.close?.();
        return dataUrl;
      }
      ctx.drawImage(bmp, 0, 0, cw, ch);
      bmp.close?.();
      blobOut = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
    }

    if (!blobOut) return dataUrl;
    return await fileToDataUrl(blobOut);
  } catch {
    return dataUrl;
  }
}

// Legacy synchronous-encode path, kept only for environments without
// createImageBitmap. Same output as before; fail-open to the original.
async function shrinkForAiLegacy(
  dataUrl: string,
  maxWidth: number,
  quality: number,
): Promise<string> {
  try {
    const img = document.createElement("img");
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
    img.src = dataUrl;
    await loaded;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h || w <= maxWidth) return dataUrl;

    const scale = maxWidth / w;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

// fetch() with backoff retry on network errors / 5xx. Same signature as fetch.
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(input, init);
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
