"use client";


import { formatAppValue } from "../../../lib/app-time";
import { useState } from "react";

type GooglePlaceResult = {
  placeId: string;
  name: string;
  address: string;
  rating?: number | null;
  reviewCount?: number;
  googleMapsUrl?: string;
};

function FastSpinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export default function GoogleBusinessConnect({
  initialName = "",
  initialPlaceId = "",
  initialRating = null,
  initialReviewCount = 0,
  initialMapsUrl = "",
  initialSyncedAt = "",
  initialAlertsEnabled = true,
}: {
  initialName?: string;
  initialPlaceId?: string;
  initialRating?: number | null;
  initialReviewCount?: number;
  initialMapsUrl?: string;
  initialSyncedAt?: string;
  initialAlertsEnabled?: boolean;
}) {
  const [query, setQuery] = useState(initialName || "");
  const [places, setPlaces] = useState<GooglePlaceResult[]>([]);
  const [connectedName, setConnectedName] = useState(initialName);
  const [connectedPlaceId, setConnectedPlaceId] = useState(initialPlaceId);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [reviewCount, setReviewCount] = useState(initialReviewCount || 0);
  const [mapsUrl, setMapsUrl] = useState(initialMapsUrl);
  const [syncedAt, setSyncedAt] = useState(initialSyncedAt);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(initialAlertsEnabled);
  const [savingAlerts, setSavingAlerts] = useState(false);

  async function toggleReviewAlerts(next: boolean) {
    if (savingAlerts) return;

    const previous = alertsEnabled;
    setAlertsEnabled(next); // optimistic
    setSavingAlerts(true);
    setError("");

    try {
      const res = await fetch("/api/google-business/review-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update review alerts.");
      setMessage(
        next
          ? "New Google review alerts are ON — we'll push you when a review comes in."
          : "New Google review alerts are OFF."
      );
    } catch (err: any) {
      setAlertsEnabled(previous); // revert on failure
      setError(err?.message || "Unable to update review alerts.");
    } finally {
      setSavingAlerts(false);
    }
  }

  const fastButtonBase =
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]";

  async function searchGoogleBusiness() {
    if (loading) return;

    setLoading(true);
    setMessage("");
    setError("");
    setPlaces([]);

    try {
      const res = await fetch("/api/google-business/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Google business search failed.");

      setPlaces(data.places || []);
      if (!data.places?.length) setMessage("No Google businesses found. Try adding your city and state.");
    } catch (err: any) {
      setError(err?.message || "Google business search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function connectGoogleBusiness(place: GooglePlaceResult) {
    if (syncing) return;

    setSyncing(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/google-business/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: place.placeId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to connect Google business.");

      setConnectedName(data.googlePlaceName || place.name);
      setConnectedPlaceId(data.googlePlaceId || place.placeId);
      setRating(data.googleRating ?? place.rating ?? null);
      setReviewCount(data.googleReviewCount ?? place.reviewCount ?? 0);
      setMapsUrl(data.googleMapsUrl || place.googleMapsUrl || "");
      setSyncedAt(new Date().toISOString());
      setMessage(`Google Business connected. Synced ${data.syncedReviews || 0} review(s).`);
      setPlaces([]);
    } catch (err: any) {
      setError(err?.message || "Unable to connect Google business.");
    } finally {
      setSyncing(false);
    }
  }

  async function syncGoogleReviews() {
    if (syncing) return;

    setSyncing(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/google-business/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to sync Google reviews.");

      setRating(data.googleRating ?? rating);
      setReviewCount(data.googleReviewCount ?? reviewCount);
      setSyncedAt(data.syncedAt || new Date().toISOString());
      setMessage(`Google reviews synced. Updated ${data.syncedReviews || 0} review(s).`);
    } catch (err: any) {
      setError(err?.message || "Unable to sync Google reviews.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-yellow-300">
            Google Business Profile
          </p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
            {connectedPlaceId ? "Google Connected" : "Connect Google Reviews"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
            Search for your Google Business Profile, connect it, and FLOW will display your rating and recent review snippets on your public profile.
          </p>
        </div>

        {connectedPlaceId && (
          <div className="rounded-2xl border border-yellow-300/40 bg-[var(--fl-surface-2)] px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-yellow-200">
              ★ {rating || "—"}
            </p>
            <p className="text-xs font-bold text-[var(--fl-muted)]">
              {reviewCount || 0} Google Reviews
            </p>
          </div>
        )}
      </div>

      {connectedPlaceId && (
        <div className="mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm text-[var(--fl-muted)]">
          <p className="font-semibold text-[var(--fl-text)]">{connectedName}</p>
          <p className="mt-1 break-all text-xs text-[var(--fl-faint)]">Place ID: {connectedPlaceId}</p>
          {syncedAt && <p className="mt-2 text-xs text-[var(--fl-muted)]">Last synced: {formatAppValue(new Date(syncedAt), {})}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <button
              type="button"
              onClick={syncGoogleReviews}
              disabled={syncing}
              className={`${fastButtonBase} bg-yellow-300 text-slate-950 hover:bg-yellow-200`}
            >
              {syncing && <FastSpinner />}
              {syncing ? "Syncing..." : "Sync Reviews"}
            </button>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className={`${fastButtonBase} border border-yellow-300/50 text-yellow-100 hover:bg-yellow-300 hover:text-slate-950`}
              >
                View on Google
              </a>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--fl-text)]">New review push alerts</p>
              <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
                Get a phone push the moment a new Google review comes in.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={alertsEnabled}
              aria-label="Toggle new Google review push alerts"
              onClick={() => toggleReviewAlerts(!alertsEnabled)}
              disabled={savingAlerts}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 [touch-action:manipulation] ${
                alertsEnabled ? "bg-emerald-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  alertsEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Example: On Point Home Inspections Halfway MD"
          className="min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-yellow-300"
        />
        <button
          type="button"
          onClick={searchGoogleBusiness}
          disabled={loading || !query.trim()}
          className={`${fastButtonBase} border border-yellow-300/50 text-yellow-100 hover:bg-yellow-300 hover:text-slate-950`}
        >
          {loading && <FastSpinner />}
          {loading ? "Searching..." : "Search Google"}
        </button>
      </div>

      {places.length > 0 && (
        <div className="mt-4 space-y-3">
          {places.map((place) => (
            <div key={place.placeId} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-[var(--fl-text)]">{place.name}</p>
                  <p className="mt-1 text-sm text-[var(--fl-muted)]">{place.address}</p>
                  <p className="mt-2 text-sm font-bold text-yellow-200">
                    ★ {place.rating || "—"} · {place.reviewCount || 0} reviews
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => connectGoogleBusiness(place)}
                  disabled={syncing}
                  className={`${fastButtonBase} bg-yellow-300 text-slate-950 hover:bg-yellow-200`}
                >
                  {syncing && <FastSpinner />}
                  {syncing ? "Connecting..." : "Connect"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {message && <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm font-bold text-emerald-300">{message}</p>}
      {error && <p className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">{error}</p>}
    </div>
  );
}
