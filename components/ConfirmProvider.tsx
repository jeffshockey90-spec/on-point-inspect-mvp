"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// One reusable, FLOW-styled replacement for the browser's plain alert()/confirm()
// boxes so confirmations and messages match the app everywhere. Async: call
// `await confirm("…")` in place of `if (confirm("…"))`, and `await alert("…")`.
type Tone = "default" | "danger" | "warn";
type Opts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
};
type PromptOpts = Opts & {
  defaultValue?: string;
  placeholder?: string;
  selectOnOpen?: boolean;
};
type Req =
  | (Opts & { kind: "confirm" | "alert"; resolve: (v: boolean) => void })
  | (PromptOpts & { kind: "prompt"; resolve: (v: string | null) => void });

type Ctx = {
  confirm: (opts: string | Opts) => Promise<boolean>;
  alert: (opts: string | Opts) => Promise<void>;
  prompt: (opts: string | PromptOpts) => Promise<string | null>;
};

const ConfirmCtx = createContext<Ctx | null>(null);

function normalize(opts: string | Opts): Opts {
  return typeof opts === "string" ? { message: opts } : opts;
}

function normalizePrompt(opts: string | PromptOpts): PromptOpts {
  return typeof opts === "string" ? { message: opts } : opts;
}

// Module singleton so call sites can use the styled dialogs imperatively (even
// from plain helper functions, not just inside a component) without wiring a
// hook each time. ConfirmProvider registers the live handler below.
let liveHandler: Ctx | null = null;

export function flowConfirm(opts: string | Opts): Promise<boolean> {
  if (liveHandler) return liveHandler.confirm(opts);
  return Promise.resolve(typeof window !== "undefined" ? window.confirm(normalize(opts).message) : false);
}

export function flowAlert(opts: string | Opts): Promise<void> {
  if (liveHandler) return liveHandler.alert(opts);
  if (typeof window !== "undefined") window.alert(normalize(opts).message);
  return Promise.resolve();
}

export function flowPrompt(opts: string | PromptOpts): Promise<string | null> {
  if (liveHandler) return liveHandler.prompt(opts);
  const p = normalizePrompt(opts);
  return Promise.resolve(
    typeof window !== "undefined" ? window.prompt(p.message, p.defaultValue) : null,
  );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const [inputValue, setInputValue] = useState("");
  const okRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const confirm = useCallback(
    (opts: string | Opts) =>
      new Promise<boolean>((resolve) => setReq({ ...normalize(opts), kind: "confirm", resolve })),
    [],
  );
  const alertFn = useCallback(
    (opts: string | Opts) =>
      new Promise<void>((resolve) => setReq({ ...normalize(opts), kind: "alert", resolve: () => resolve() })),
    [],
  );
  const promptFn = useCallback((opts: string | PromptOpts) => {
    const p = normalizePrompt(opts);
    setInputValue(p.defaultValue || "");
    return new Promise<string | null>((resolve) => setReq({ ...p, kind: "prompt", resolve }));
  }, []);

  const close = useCallback((value: boolean) => {
    setReq((cur) => {
      if (cur?.kind === "prompt") cur.resolve(value ? inputValue : null);
      else cur?.resolve(value);
      return null;
    });
  }, [inputValue]);

  // Register this provider as the live handler for imperative flowConfirm/flowAlert/flowPrompt.
  useEffect(() => {
    liveHandler = { confirm, alert: alertFn, prompt: promptFn };
    return () => {
      if (liveHandler && liveHandler.confirm === confirm) liveHandler = null;
    };
  }, [confirm, alertFn, promptFn]);

  useEffect(() => {
    if (!req) return;
    if (req.kind === "prompt") {
      inputRef.current?.focus();
      if (req.selectOnOpen) inputRef.current?.select();
    } else {
      okRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && req.kind !== "alert") close(false);
      if (e.key === "Enter" && req.kind !== "prompt") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, close]);

  const toneCls =
    req?.tone === "danger"
      ? "bg-red-500 text-white hover:bg-red-400"
      : req?.tone === "warn"
        ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
        : "bg-teal-500 text-slate-950 hover:bg-teal-400";

  return (
    <ConfirmCtx.Provider value={{ confirm, alert: alertFn, prompt: promptFn }}>
      {children}
      {req && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-4"
          onClick={() => req.kind !== "alert" && close(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 shadow-2xl"
          >
            {req.title && <h2 className="text-base font-bold text-[var(--fl-text)]">{req.title}</h2>}
            <p className={`${req.title ? "mt-1.5" : ""} whitespace-pre-wrap text-sm leading-6 text-[var(--fl-text)]`}>
              {req.message}
            </p>
            {req.kind === "prompt" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  close(true);
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  placeholder={req.placeholder}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="mt-3 h-11 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </form>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {req.kind !== "alert" && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] [touch-action:manipulation]"
                >
                  {req.cancelText || "Cancel"}
                </button>
              )}
              <button
                ref={req.kind === "prompt" ? undefined : okRef}
                type="button"
                onClick={() => close(true)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition [touch-action:manipulation] ${toneCls}`}
              >
                {req.confirmText || (req.kind === "alert" ? "OK" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

// Styled confirm/alert. Falls back to the native dialogs if used outside the
// provider, so a call site is never left without a working confirmation.
export function useConfirm(): Ctx {
  const ctx = useContext(ConfirmCtx);
  if (ctx) return ctx;
  return {
    confirm: async (opts) => window.confirm(normalize(opts).message),
    alert: async (opts) => window.alert(normalize(opts).message),
    prompt: async (opts) => {
      const p = normalizePrompt(opts);
      return window.prompt(p.message, p.defaultValue);
    },
  };
}
