"use client";

export type CompressedImage = {
  file: File;
  base64: string;
  name: string;
  type: string;
  size: number;
};

export function fileToBase64(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      resolve(reader.result as string);

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(
  file: File,
  options: {
    maxWidth?: number;
    quality?: number;
    outputName?: string;
  } = {}
): Promise<CompressedImage> {
  const maxWidth = options.maxWidth ?? 1600;
  const quality = options.quality ?? 0.72;

  if (!file.type.startsWith("image/")) {
    const base64 = await fileToBase64(file);

    return {
      file,
      base64,
      name: file.name,
      type: file.type,
      size: file.size,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const scale =
          img.width > maxWidth
            ? maxWidth / img.width
            : 1;

        const width = Math.round(
          img.width * scale
        );

        const height = Math.round(
          img.height * scale
        );

        const canvas =
          document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);

          reject(
            new Error(
              "Image compression failed."
            )
          );

          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          async (blob) => {
            URL.revokeObjectURL(objectUrl);

            if (!blob) {
              reject(
                new Error(
                  "Image compression failed."
                )
              );

              return;
            }

            const cleanName =
              options.outputName ||
              file.name.replace(
                /\.[^/.]+$/,
                ""
              ) + "-compressed.jpg";

            const compressedFile = new File(
              [blob],
              cleanName,
              {
                type: "image/jpeg",
                lastModified: Date.now(),
              }
            );

            const base64 =
              await fileToBase64(
                compressedFile
              );

            resolve({
              file: compressedFile,
              base64,
              name: cleanName,
              type: "image/jpeg",
              size: compressedFile.size,
            });
          },
          "image/jpeg",
          quality
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);

        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(
        new Error("Could not load image.")
      );
    };

    img.src = objectUrl;
  });
}

export async function compressImageFiles(
  files: File[],
  options: {
    maxWidth?: number;
    quality?: number;
  } = {}
): Promise<File[]> {
  const compressed: File[] = [];

  for (const file of files) {
    const result =
      await compressImageFile(
        file,
        options
      );

    compressed.push(result.file);
  }

  return compressed;
}
