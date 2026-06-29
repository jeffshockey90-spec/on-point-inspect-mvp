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
  const [memory, setMemory] = useState<HouseMemorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const loadMemory = useCallback(async () => {
    if (!inspectionId || inFlight.current) return;

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

      if (data?.memory) {
        setMemory(data.memory);
      }
    } catch {
      // Quiet fail so this does not spam the console or break the report page.
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    loadMemory();

    const interval = window.setInterval(loadMemory, 30000);

    return () => window.clearInterval(interval);
  }, [loadMemory]);

  return (
    <HouseIntelligencePanel
      memory={memory}
      loading={loading}
      onRefresh={loadMemory}
    />
  );
}