"use client";

// Text fields for screens that re-render constantly (the live camera re-renders
// on every degree of compass movement). The field owns its own text: React
// never rewrites the box while you type, so the iPhone keyboard's tapped
// autocorrect / predictive suggestions aren't dropped — they were, in the live
// camera, because the controlled value was re-applied mid-replacement.
// The parent still gets every change through onChange, and outside changes
// (dictation appending text, clearing after save) are copied into the box.

import { forwardRef, useCallback, useEffect, useRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

function useSyncedField<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: unknown,
  forwardedRef: React.ForwardedRef<T>,
) {
  const inner = useRef<T | null>(null);
  const text = value == null ? "" : String(value);

  useEffect(() => {
    const el = inner.current;
    // Only write when the outside value really differs from what's in the box
    // (dictation, reset) — never while it already matches what was typed.
    if (el && el.value !== text) el.value = text;
  }, [text]);

  const setRef = useCallback(
    (el: T | null) => {
      inner.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  return { setRef, text };
}

export const StableTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function StableTextarea({ value, defaultValue: _ignored, ...rest }, ref) {
    const { setRef, text } = useSyncedField<HTMLTextAreaElement>(value, ref);
    return (
      <textarea
        autoCorrect="on"
        autoCapitalize="sentences"
        spellCheck
        {...rest}
        ref={setRef}
        defaultValue={text}
      />
    );
  },
);

export const StableInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function StableInput({ value, defaultValue: _ignored, ...rest }, ref) {
    const { setRef, text } = useSyncedField<HTMLInputElement>(value, ref);
    return (
      <input
        autoCorrect="on"
        autoCapitalize="sentences"
        spellCheck
        {...rest}
        ref={setRef}
        defaultValue={text}
      />
    );
  },
);
