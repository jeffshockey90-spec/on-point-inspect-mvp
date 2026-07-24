"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Global app error:", error);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{
          minHeight: "100vh",
          background: "#020617",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "Arial, sans-serif",
        }}>
          <section style={{
            width: "100%",
            maxWidth: "720px",
            border: "1px solid rgba(239, 68, 68, 0.45)",
            background: "#0b1220",
            borderRadius: "24px",
            padding: "32px",
          }}>
            <p style={{
              color: "#14c8d2",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}>
              FLOW
            </p>

            <h1 style={{
              marginTop: "16px",
              fontSize: "36px",
              lineHeight: 1.1,
            }}>
              The app needs to reload
            </h1>

            <p style={{
              marginTop: "16px",
              color: "#cbd5e1",
              lineHeight: 1.7,
            }}>
              A serious error occurred. Your saved inspection data is protected.
              Reload the app and continue from the dashboard.
            </p>

            {error?.digest && (
              <p style={{
                marginTop: "16px",
                color: "#94a3b8",
                wordBreak: "break-all",
                fontSize: "12px",
              }}>
                Error ID: {error.digest}
              </p>
            )}

            <button
              onClick={reset}
              style={{
                marginTop: "24px",
                border: "0",
                borderRadius: "12px",
                background: "#14b8a6",
                color: "#020617",
                padding: "14px 20px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Reload App
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
