export type NormalizedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  approximate?: boolean;
};

export type TrackableDetection = {
  id?: string;
  title: string;
  section?: string;
  severity?: string;
  confidence?: number;
  region?: NormalizedRegion | null;
  [key: string]: any;
};

export type LiveTrackedDetection<T extends TrackableDetection = TrackableDetection> = T & {
  trackId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  smoothedConfidence: number;
  pinned?: boolean;
  stale?: boolean;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clamp01(number > 1 ? number / 100 : number);
}

function cleanIdentity(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(possible|suspected|visible|observed|appeared|condition|issue)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(cleanIdentity(left).split(" ").filter((token) => token.length >= 3));
  const b = new Set(cleanIdentity(right).split(" ").filter((token) => token.length >= 3));
  if (!a.size || !b.size) return 0;

  let overlap = 0;
  a.forEach((token) => {
    if (b.has(token)) overlap += 1;
  });

  return overlap / Math.max(a.size, b.size);
}

function intersectionOverUnion(
  left?: NormalizedRegion | null,
  right?: NormalizedRegion | null,
) {
  if (!left || !right) return 0;

  const leftRight = left.x + left.width;
  const leftBottom = left.y + left.height;
  const rightRight = right.x + right.width;
  const rightBottom = right.y + right.height;

  const intersectionWidth = Math.max(
    0,
    Math.min(leftRight, rightRight) - Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(leftBottom, rightBottom) - Math.max(left.y, right.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union =
    left.width * left.height + right.width * right.height - intersection;

  return union > 0 ? intersection / union : 0;
}

function smoothRegion(
  previous?: NormalizedRegion | null,
  next?: NormalizedRegion | null,
  alpha = 0.58,
): NormalizedRegion | null {
  if (!next) return previous || null;
  if (!previous) return next;

  const blend = (a: number, b: number) => clamp01(a + (b - a) * alpha);

  return {
    ...next,
    x: blend(previous.x, next.x),
    y: blend(previous.y, next.y),
    width: blend(previous.width, next.width),
    height: blend(previous.height, next.height),
    approximate: Boolean(previous.approximate && next.approximate),
    label: next.label || previous.label,
  };
}

function createTrackId(detection: TrackableDetection, now: number, index: number) {
  const base = cleanIdentity(
    [detection.section, detection.title, detection.severity].filter(Boolean).join("-"),
  ).replace(/\s+/g, "-");

  return `${base || "detection"}-${now.toString(36)}-${index}`;
}

function matchScore(
  current: LiveTrackedDetection,
  incoming: TrackableDetection,
) {
  const titleScore = tokenSimilarity(current.title, incoming.title);
  const sectionScore =
    current.section && incoming.section && current.section === incoming.section ? 0.16 : 0;
  const regionScore = intersectionOverUnion(current.region, incoming.region);
  const explicitIdScore =
    current.id && incoming.id && String(current.id) === String(incoming.id) ? 1 : 0;

  return explicitIdScore || titleScore * 0.54 + regionScore * 0.36 + sectionScore;
}

export function mergeLiveDetections<T extends TrackableDetection>(
  current: LiveTrackedDetection<T>[],
  incoming: T[],
  options: {
    now?: number;
    staleAfterMs?: number;
    removeAfterMs?: number;
    maxTracks?: number;
  } = {},
): LiveTrackedDetection<T>[] {
  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? 12000;
  const removeAfterMs = options.removeAfterMs ?? 30000;
  const maxTracks = options.maxTracks ?? 8;
  const unmatched = new Set(current.map((_, index) => index));
  const merged: LiveTrackedDetection<T>[] = [];

  incoming.forEach((detection, incomingIndex) => {
    let bestIndex = -1;
    let bestScore = 0;

    unmatched.forEach((currentIndex) => {
      const score = matchScore(current[currentIndex], detection);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = currentIndex;
      }
    });

    const matched = bestIndex >= 0 && bestScore >= 0.34 ? current[bestIndex] : null;

    if (matched) {
      unmatched.delete(bestIndex);
      const nextConfidence = normalizeConfidence(detection.confidence);
      const repeatedBoost = Math.min(0.1, matched.seenCount * 0.012);
      const smoothedConfidence = clamp01(
        matched.smoothedConfidence * 0.45 + nextConfidence * 0.55 + repeatedBoost,
      );

      merged.push({
        ...matched,
        ...detection,
        trackId: matched.trackId,
        firstSeenAt: matched.firstSeenAt,
        lastSeenAt: now,
        seenCount: matched.seenCount + 1,
        smoothedConfidence,
        confidence: smoothedConfidence,
        region: smoothRegion(matched.region, detection.region),
        stale: false,
        pinned: matched.pinned,
      });
      return;
    }

    const confidence = normalizeConfidence(detection.confidence);
    merged.push({
      ...detection,
      trackId: createTrackId(detection, now, incomingIndex),
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
      smoothedConfidence: confidence,
      confidence,
      stale: false,
      pinned: false,
    });
  });

  unmatched.forEach((currentIndex) => {
    const track = current[currentIndex];
    const age = now - track.lastSeenAt;
    if (!track.pinned && age > removeAfterMs) return;

    merged.push({
      ...track,
      stale: age > staleAfterMs,
      confidence: track.pinned
        ? track.smoothedConfidence
        : Math.max(0.2, track.smoothedConfidence * Math.max(0.45, 1 - age / removeAfterMs)),
    });
  });

  return merged
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (a.stale !== b.stale) return a.stale ? 1 : -1;
      return b.lastSeenAt - a.lastSeenAt;
    })
    .slice(0, maxTracks);
}

export function toggleTrackedDetectionPin<T extends TrackableDetection>(
  tracks: LiveTrackedDetection<T>[],
  trackId: string,
) {
  return tracks.map((track) =>
    track.trackId === trackId ? { ...track, pinned: !track.pinned } : track,
  );
}
