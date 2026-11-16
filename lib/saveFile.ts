// Save a file generated in the browser (CSV, JSON, PNG, HTML) on any device.
// A plain <a download> click does nothing inside the iOS/Android app's
// WebView, so in the app: images go to the Photos library (native plugin) and
// other files open the system share sheet (Save to Files, Mail, AirDrop…).
// On the web it's a normal download.
import { isNativeApp } from "./nativePhoto";
import { saveFileToDeviceGallery } from "./nativeGallery";

export type SaveFileOutcome = "saved-to-photos" | "shared" | "downloaded" | "cancelled" | "failed";

function anchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function saveOrShareFile(
  blob: Blob,
  filename: string,
  opts: { title?: string } = {},
): Promise<SaveFileOutcome> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

  if (isNativeApp()) {
    if (file.type.startsWith("image/")) {
      return (await saveFileToDeviceGallery(file)) ? "saved-to-photos" : "failed";
    }
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: opts.title || filename });
        return "shared";
      } catch (error: any) {
        return error?.name === "AbortError" ? "cancelled" : "failed";
      }
    }
  }

  anchorDownload(blob, filename);
  return "downloaded";
}
