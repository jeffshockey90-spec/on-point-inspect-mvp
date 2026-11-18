"use client";

// Text fields for screens that re-render constantly (the live camera re-renders
// on every keystroke, compass tick and clock update). The field owns its own
// text and React never touches the box after it first appears, so the iPhone
// keyboard's tapped autocorrect / predictive suggestions are applied.
//
// Why "never touches": on every re-render React re-applies a textarea's
// default text, which rewrites the box's inner text node. iOS then loses track
// of the word being typed, so tapping a suggestion only inserted the space.
// Here the field element is memoized (handlers go through a ref), so parent
// re-renders don't reach the DOM node at all.
// The parent still gets every change through onChange, and outside changes
// (dictation appending text, clearing after save) are copied into the box.

import { createElement, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { splitFieldProps } from "../lib/stableFieldProps";

function useStableField<T extends HTMLInputElement | HTMLTextAreaElement>(
  tag: "input" | "textarea",
  props: Record<string, unknown>,
  forwardedRef: React.ForwardedRef<T>,
) {
  const { value, defaultValue: _ignored, ...rest } = props;
  const inner = useRef<T | null>(null);
  const text = value == null ? "" : String(value);
  // The text the box starts with — fixed, so React never re-writes it.
  const [initialText] = useState(text);

  useEffect(() => {
    const el = inner.current;
    // Only write when the outside value really differs from what's in the box
    // (dictation, reset) — never while it already matches what was typed.
    if (el && el.value !== text) el.value = text;
  }, [text]);

  const refTarget = useRef(forwardedRef);
  refTarget.current = forwardedRef;
  const setRef = useCallback((el: T | null) => {
    inner.current = el;
    const target = refTarget.current;
    if (typeof target === "function") target(el);
    else if (target) target.current = el;
  }, []);

  const { handlers, attrs, attrsKey } = splitFieldProps(rest);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const handlerNames = Object.keys(handlers).sort().join(",");

  return useMemo(() => {
    const proxied: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of handlerNames ? handlerNames.split(",") : []) {
      proxied[name] = (...args: unknown[]) => handlersRef.current[name]?.(...args);
    }
    return createElement(tag, {
      autoCorrect: "on",
      autoCapitalize: "sentences",
      spellCheck: true,
      ...attrs,
      ...proxied,
      ref: setRef,
      defaultValue: initialText,
    });
    // attrsKey stands in for attrs (a stable string of the non-function props).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, attrsKey, handlerNames, setRef, initialText]);
}

export const StableTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function StableTextarea(props, ref) {
    return useStableField<HTMLTextAreaElement>("textarea", props as Record<string, unknown>, ref);
  },
);

export const StableInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function StableInput(props, ref) {
    return useStableField<HTMLInputElement>("input", props as Record<string, unknown>, ref);
  },
);
