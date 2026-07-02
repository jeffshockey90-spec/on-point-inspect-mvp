"use client";

import { useState, type ImgHTMLAttributes } from "react";

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
};

export default function SafeImage({
  src,
  fallbackSrc,
  style,
  ...props
}: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hidden, setHidden] = useState(false);

  return (
    <img
      {...props}
      src={currentSrc}
      style={{
        ...style,
        display: hidden ? "none" : style?.display,
      }}
      onError={() => {
        const fallback = String(fallbackSrc || "").trim();

        if (fallback && currentSrc !== fallback) {
          setCurrentSrc(fallback);
          return;
        }

        setHidden(true);
      }}
    />
  );
}
