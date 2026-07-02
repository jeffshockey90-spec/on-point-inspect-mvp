"use client";

import { useEffect, useState } from "react";

type SafeImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
  fallbackSrc?: string | null;
};

export default function SafeImage({
  src,
  fallbackSrc,
  alt,
  onError,
  ...props
}: SafeImageProps) {
  const primarySrc = String(src || "").trim();
  const backupSrc = String(fallbackSrc || "").trim();
  const [currentSrc, setCurrentSrc] = useState(primarySrc);

  useEffect(() => {
    setCurrentSrc(primarySrc);
  }, [primarySrc]);

  if (!currentSrc) return null;

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt || ""}
      onError={(event) => {
        if (backupSrc && currentSrc !== backupSrc) {
          setCurrentSrc(backupSrc);
          return;
        }

        onError?.(event);
      }}
    />
  );
}
