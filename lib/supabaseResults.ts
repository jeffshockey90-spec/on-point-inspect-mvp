// Supabase returns { error } instead of throwing, so `await Promise.all(updates)`
// inside try/catch never reaches the catch — the UI showed an order (or edit)
// that was never saved. Call this on the results to turn the first error into
// a throw so the existing catch (re-sync / alert) actually runs.
export function throwIfAnyError(results: Array<{ error?: unknown } | null | undefined | void>): void {
  for (const r of results) {
    const error = r && typeof r === "object" ? (r as any).error : null;
    if (error) throw error instanceof Error ? error : new Error(String((error as any)?.message || error));
  }
}
