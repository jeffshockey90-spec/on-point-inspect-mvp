// Shared registry so the floating "AI Inspector" status toasts — one per
// finding, each rendered as its own fixed-position portal — stack instead of
// landing on top of each other when more than one is showing at once.
"use client";

import { useEffect, useRef, useState } from "react";

let nextId = 0;
const order: number[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Exported (not just used internally) so the ordering logic can be covered
// by a plain unit test without needing to render the hook.
export function registerToast(): number {
  const id = nextId++;
  order.push(id);
  notify();
  return id;
}

export function unregisterToast(id: number) {
  const index = order.indexOf(id);
  if (index !== -1) order.splice(index, 1);
  notify();
}

export function toastStackIndexOf(id: number): number {
  return order.indexOf(id);
}

// Returns this toast's slot among all currently-active toasts (0 = bottom-most),
// re-rendering whenever another toast registers or unregisters.
export function useToastStackIndex(active: boolean): number {
  const idRef = useRef<number | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    idRef.current = registerToast();
    bump((n) => n + 1);

    const listener = () => bump((n) => n + 1);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (idRef.current != null) {
        unregisterToast(idRef.current);
        idRef.current = null;
      }
    };
  }, [active]);

  if (!active || idRef.current == null) return 0;
  return toastStackIndexOf(idRef.current);
}
