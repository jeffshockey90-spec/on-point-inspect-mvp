"use client";

import { useEffect, useRef } from "react";

type PublicProfileAnalyticsTrackerProps = {
  companyId: string;
  profileSlug: string;
};

type PublicProfileEventType =
  | "profile_view"
  | "qr_scan"
  | "booking_click"
  | "sample_report_click"
  | "phone_click"
  | "email_click"
  | "website_click"
  | "review_click"
  | "facebook_click"
  | "share_click";

function sendAnalyticsEvent(payload: {
  companyId: string;
  profileSlug: string;
  eventType: PublicProfileEventType;
  sampleReportId?: string;
  metadata?: Record<string, any>;
}) {
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/public-profile-analytics", blob);
      return;
    }
  } catch {}

  fetch("/api/public-profile-analytics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {});
}

export default function PublicProfileAnalyticsTracker({
  companyId,
  profileSlug,
}: PublicProfileAnalyticsTrackerProps) {
  const didTrackView = useRef(false);

  useEffect(() => {
    if (!companyId || !profileSlug || didTrackView.current) return;

    didTrackView.current = true;

    const params = new URLSearchParams(window.location.search);
    const source =
      params.get("source") ||
      params.get("utm_source") ||
      params.get("ref") ||
      "";

    sendAnalyticsEvent({
      companyId,
      profileSlug,
      eventType: "profile_view",
      metadata: {
        source: source || "direct",
        path: window.location.pathname,
      },
    });

    if (source.toLowerCase() === "qr") {
      sendAnalyticsEvent({
        companyId,
        profileSlug,
        eventType: "qr_scan",
        metadata: {
          source: "qr",
          path: window.location.pathname,
        },
      });
    }
  }, [companyId, profileSlug]);

  useEffect(() => {
    if (!companyId || !profileSlug) return;

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const analyticsTarget = target.closest("[data-public-profile-event]");
      if (!(analyticsTarget instanceof HTMLElement)) return;

      const eventType = analyticsTarget.getAttribute(
        "data-public-profile-event",
      ) as PublicProfileEventType | null;

      if (!eventType) return;

      sendAnalyticsEvent({
        companyId,
        profileSlug,
        eventType,
        sampleReportId:
          analyticsTarget.getAttribute("data-sample-report-id") || undefined,
        metadata: {
          href:
            analyticsTarget instanceof HTMLAnchorElement
              ? analyticsTarget.href
              : analyticsTarget.getAttribute("href") || "",
          label: analyticsTarget.textContent?.trim().slice(0, 120) || "",
          path: window.location.pathname,
        },
      });
    }

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [companyId, profileSlug]);

  return null;
}
