"use client";

export async function uploadWithRetry({
  upload,
  retries = 3,
  delayMs = 750,
}: {
  upload: () => Promise<any>;
  retries?: number;
  delayMs?: number;
}) {
  let lastError: any = null;

  for (
    let attempt = 1;
    attempt <= retries;
    attempt += 1
  ) {
    try {
      return await upload();
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            delayMs * attempt
          )
        );
      }
    }
  }

  throw lastError;
}
