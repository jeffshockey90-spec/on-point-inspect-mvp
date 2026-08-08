import { isLikelyNetworkError } from "./networkError";

export const LAB_REPORT_MAX_BYTES = 25 * 1024 * 1024;

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

async function uploadOnce(
  file: File,
  inspectionId: string,
  kind: "mold" | "radon",
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("inspectionId", inspectionId);
  fd.append("kind", kind);

  const res = await fetch("/api/lab-report-upload", {
    method: "POST",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed.");
  if (!data?.url) throw new Error("Upload succeeded but no link came back.");
  return data.url as string;
}

// A weak/flaky field connection can drop a single upload attempt without
// meaning the upload is doomed - retry a couple of times before giving up,
// same idea as the offline safety net in app/field/page.tsx.
const RETRY_DELAYS_MS = [1500, 3000];

export async function uploadLabReportPdf(
  file: File,
  inspectionId: string,
  kind: "mold" | "radon",
): Promise<string> {
  if (!isPdfFile(file)) throw new Error("Please choose a PDF file.");
  if (file.size > LAB_REPORT_MAX_BYTES) {
    throw new Error("That PDF is over 25 MB. Please use a smaller file.");
  }

  let lastError: any;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await uploadOnce(file, inspectionId, kind);
    } catch (err) {
      lastError = err;
      if (!isLikelyNetworkError(err) || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  throw new Error(
    isLikelyNetworkError(lastError)
      ? "Couldn't upload the PDF - check your connection and try again."
      : lastError?.message || "Upload failed. Please try again.",
  );
}
