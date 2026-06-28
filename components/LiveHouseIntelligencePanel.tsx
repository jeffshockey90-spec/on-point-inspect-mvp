"use client";

import { useCallback, useEffect, useState } from "react";
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

  const loadMemory = useCallback(async () => {
    if (!inspectionId) return;

    setLoading(true);

    try {
      const res = await fetch("/api/ai/house-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.memory) {
        setMemory(data.memory);
      }
    } catch (error) {
      console.error("Live House Intelligence load error:", error);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    loadMemory();

    const interval = window.setInterval(() => {
      loadMemory();
    }, 15000);

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
