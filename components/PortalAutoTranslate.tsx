"use client";

import { useEffect, useState } from "react";
import UiAutoTranslate from "./UiAutoTranslate";

// Drop-in translator for the client/realtor portals. Resolves the language for
// the inspection's company (or an explicit lang) from the API, then applies the
// UI-chrome dictionary. No-op for English. Keeps the portals in the client's
// language without threading anything through the (large) portal pages.
export default function PortalAutoTranslate({
  inspectionId,
  lang,
}: {
  inspectionId?: string | number | null;
  lang?: string | null;
}) {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams();
    if (lang) qs.set("lang", lang);
    if (inspectionId != null && inspectionId !== "") {
      qs.set("inspectionId", String(inspectionId));
    }
    if (!qs.toString()) return;

    fetch(`/api/ui-translations?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.map) setMap(d.map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [inspectionId, lang]);

  if (!map || !Object.keys(map).length) return null;
  return <UiAutoTranslate map={map} />;
}
