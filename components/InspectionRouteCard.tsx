"use client";

export default function InspectionRouteCard({
  propertyAddress,
  city,
  state,
  zip,
  officeAddress,
  distanceMiles,
  driveMinutes,
}: {
  propertyAddress: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  officeAddress?: string | null;
  distanceMiles?: number | null;
  driveMinutes?: number | null;
}) {
  const fullAddress = [propertyAddress, city, state, zip].filter(Boolean).join(", ");
  if (!fullAddress) return null;

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const embedSrc = !mapsKey
    ? ""
    : officeAddress
      ? `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${encodeURIComponent(
          officeAddress
        )}&destination=${encodeURIComponent(fullAddress)}`
      : `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(
          fullAddress
        )}`;

  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    fullAddress
  )}`;

  const hasDistance = Boolean(distanceMiles || driveMinutes);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#232b38] bg-[#10151e] shadow-xl">
      {embedSrc && (
        <iframe
          src={embedSrc}
          className="h-52 w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Property location map"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
            Property Location
          </p>
          <p className="mt-1 break-words text-sm text-[#8a93a3]">{fullAddress}</p>

          {hasDistance ? (
            <p className="mt-1 text-sm font-semibold text-teal-300">
              {distanceMiles ? `${distanceMiles} mi` : ""}
              {distanceMiles && driveMinutes ? " · " : ""}
              {driveMinutes ? `~${driveMinutes} min drive` : ""}
            </p>
          ) : officeAddress ? (
            <p className="mt-1 text-xs text-[#59626f]">Calculating drive distance...</p>
          ) : (
            <p className="mt-1 text-xs text-[#59626f]">
              Add a starting address in Settings to see drive distance here.
            </p>
          )}
        </div>

        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          data-fast-click="true"
          className="shrink-0 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 active:scale-[0.98]"
        >
          🚗 Start Drive
        </a>
      </div>
    </section>
  );
}
