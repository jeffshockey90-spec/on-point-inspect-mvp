"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HouseIntelligencePanel, {
  type HouseMemorySnapshot,
} from "./HouseIntelligencePanel";

export default function LiveHouseIntelligencePanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);
  const isIntersecting = useRef(false);
  const [active, setActive] = useState(false);
  const [memory, setMemory] = useState<HouseMemorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(document.visibilityState === "visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting.current = entry.isIntersecting;
        setActive(entry.isIntersecting && document.visibilityState === "visible");
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );

    const onVisibilityChange = () => {
      setActive(isIntersecting.current && document.visibilityState === "visible");
    };

    observer.observe(node);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const loadMemory = useCallback(async () => {
    if (!inspectionId || !active || inFlight.current) return;

    inFlight.current = true;
    setLoading(true);

    try {
      const res = await fetch("/api/ai/house-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId }),
      });

      if (!res.ok) return;

      const data = await res.json().catch(() => ({}));
      if (data?.memory) setMemory(data.memory);
    } catch {
      // Keep report interaction responsive if the AI endpoint is unavailable.
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [inspectionId, active]);

  useEffect(() => {
    if (!active) return;

    // House memory is derived from the inspection's findings — it only changes
    // when those do. Polling this PAID AI endpoint every 30s for the whole
    // session was a steady, needless AI-spend/battery drain. Load once when the
    // panel becomes active, refresh on an actual data-change event, and keep a
    // long (5-min) fallback poll as a safety net.
    loadMemory();
    const onChange = () => void loadMemory();
    window.addEventListener("opi:inspection-data-changed", onChange);
    window.addEventListener("opi:findings-changed", onChange);
    const interval = window.setInterval(loadMemory, 300000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("opi:inspection-data-changed", onChange);
      window.removeEventListener("opi:findings-changed", onChange);
    };
  }, [active, loadMemory]);

  return (
    <div ref={rootRef} style={{ contentVisibility: "auto", containIntrinsicSize: "500px" }}>
      <HouseIntelligencePanel
        memory={memory}
        loading={loading}
        onRefresh={loadMemory}
      />
    </div>
  );
}
