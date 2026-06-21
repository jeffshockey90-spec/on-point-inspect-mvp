type EquipmentCardProps = {
  equipment: {
    equipmentType?: string;
    equipment_type?: string;
    manufacturer?: string;
    model?: string;
    serial?: string;
    manufactureYear?: string | number;
    manufacture_year?: string | number;
    estimatedAge?: string | number;
    estimated_age?: string | number;
    expectedServiceLife?: string;
    expected_service_life?: string;
    equipmentStatus?: string;
    equipment_status?: string;
    efficiency?: string;
    estimatedSEER?: string;
    estimated_seer?: string;
    estimatedAFUE?: string;
    estimated_afue?: string;
    estimatedHeatingEfficiency?: string;
    estimated_heating_efficiency?: string;
    capacity?: string;
    fuelType?: string;
    fuel_type?: string;
    refrigerant?: string;
    condition?: string;
    estimatedLifeRemaining?: string;
    estimated_life_remaining?: string;
    section?: string;
    severity?: string;
    image_url?: string;
    imageUrl?: string;
    public_url?: string;
    publicUrl?: string;
    photo_url?: string;
    photoUrl?: string;
    signed_image_url?: string;
    signedImageUrl?: string;
    thumbnail_url?: string;
    thumbnailUrl?: string;
    signed_thumbnail_url?: string;
    signedThumbnailUrl?: string;
    thumbnail_public_url?: string;
    thumbnailPublicUrl?: string;
    video_url?: string;
    videoUrl?: string;
    signed_video_url?: string;
    signedVideoUrl?: string;
    media_url?: string;
    mediaUrl?: string;
    file_path?: string;
    thumbnail_path?: string;
    media_type?: string;
    mime_type?: string;
    content_type?: string;
    is_video?: boolean;
  };
};

function isKnownEquipmentValue(value: any) {
  const clean = String(value ?? "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "unable to confirm",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(lower);
}

function firstKnown(...values: any[]) {
  for (const value of values) {
    if (isKnownEquipmentValue(value)) return String(value).trim();
  }

  return "";
}

function getTypicalIndustryRange(value: any) {
  const clean = String(value || "").trim();
  if (!isKnownEquipmentValue(clean)) return "";

  const rangeMatch = clean.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return `${rangeMatch[1]}–${rangeMatch[2]} years`;
  }

  const numberMatch = clean.match(/\d+/);
  if (!numberMatch) return clean;

  const upper = Number(numberMatch[0]);
  if (!Number.isFinite(upper) || upper <= 0) return clean;

  const lower = Math.max(1, upper - 5);
  return `${lower}–${upper} years`;
}

function getEquipmentConditionNote(value: any) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (!isKnownEquipmentValue(clean)) return "";

  if (
    lower.includes("remaining") ||
    lower.includes("service life") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  return clean;
}

function getEquipmentStatus(equipment: EquipmentCardProps["equipment"]) {
  const explicit = firstKnown(equipment.equipmentStatus, equipment.equipment_status);
  const condition = String(equipment.condition || "").toLowerCase();
  const severity = String(equipment.severity || "").toLowerCase();
  const ageText = String(firstKnown(equipment.estimatedAge, equipment.estimated_age));
  const rangeText = String(
    firstKnown(equipment.expectedServiceLife, equipment.expected_service_life)
  );
  const ageNumber = Number(ageText.replace(/[^0-9.]/g, ""));
  const rangeNumbers = rangeText.match(/\d+/g) || [];
  const maxLife =
    rangeNumbers.length > 0 ? Number(rangeNumbers[rangeNumbers.length - 1]) : null;

  if (
    condition.includes("older equipment") ||
    condition.includes("monitor") ||
    condition.includes("budget") ||
    condition.includes("near upper") ||
    condition.includes("beyond typical") ||
    condition.includes("end of typical") ||
    condition.includes("failed") ||
    condition.includes("not operating") ||
    condition.includes("repair") ||
    severity.includes("major") ||
    severity.includes("safety")
  ) {
    return "⚠ Service Recommended";
  }

  if (maxLife && Number.isFinite(ageNumber) && ageNumber >= maxLife - 2) {
    return "⚠ Service Recommended";
  }

  if (isKnownEquipmentValue(explicit)) {
    const lowerExplicit = explicit.toLowerCase();

    if (
      lowerExplicit.includes("no specific") ||
      lowerExplicit.includes("operating normally")
    ) {
      return "✓ Operating Normally";
    }

    return explicit;
  }

  return "✓ Operating Normally";
}

function getStatusClass(value: string) {
  const clean = value.toLowerCase();

  if (clean.includes("operating normally") || clean.includes("no specific")) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }

  if (clean.includes("service") || clean.includes("safety")) {
    return "border-orange-500/50 bg-orange-500/10 text-orange-300";
  }

  if (clean.includes("near end") || clean.includes("monitor")) {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
}

function getEquipmentImageUrl(equipment: EquipmentCardProps["equipment"]) {
  return firstKnown(
    equipment.signed_thumbnail_url,
    equipment.signedThumbnailUrl,
    equipment.thumbnail_url,
    equipment.thumbnailUrl,
    equipment.thumbnail_public_url,
    equipment.thumbnailPublicUrl,
    equipment.signed_image_url,
    equipment.signedImageUrl,
    equipment.image_url,
    equipment.imageUrl,
    equipment.public_url,
    equipment.publicUrl,
    equipment.photo_url,
    equipment.photoUrl,
    equipment.media_url,
    equipment.mediaUrl
  );
}

function getEquipmentVideoUrl(equipment: EquipmentCardProps["equipment"]) {
  return firstKnown(
    equipment.signed_video_url,
    equipment.signedVideoUrl,
    equipment.video_url,
    equipment.videoUrl,
    equipment.media_url,
    equipment.mediaUrl
  );
}

function isVideoMedia(equipment: EquipmentCardProps["equipment"]) {
  const videoUrl = getEquipmentVideoUrl(equipment).toLowerCase();
  const imageUrl = getEquipmentImageUrl(equipment).toLowerCase();
  const filePath = String(equipment.file_path || "").toLowerCase();
  const mediaType = String(
    equipment.media_type || equipment.mime_type || equipment.content_type || ""
  ).toLowerCase();

  return (
    Boolean(equipment.is_video) ||
    mediaType.startsWith("video/") ||
    filePath.match(/\.(mp4|mov|m4v|webm|avi|quicktime)$/) !== null ||
    videoUrl.match(/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/) !== null ||
    imageUrl.match(/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/) !== null
  );
}

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  const typicalRange = getTypicalIndustryRange(
    firstKnown(equipment.expectedServiceLife, equipment.expected_service_life)
  );
  const equipmentStatus = getEquipmentStatus(equipment);
  const imageUrl = getEquipmentImageUrl(equipment);
  const videoUrl = getEquipmentVideoUrl(equipment) || imageUrl;
  const isVideo = isVideoMedia(equipment);

  const rows = [
    ["Equipment Type", firstKnown(equipment.equipmentType, equipment.equipment_type)],
    ["Manufacturer", equipment.manufacturer],
    ["Model Number", equipment.model],
    ["Serial Number", equipment.serial],
    ["Manufacture Year", firstKnown(equipment.manufactureYear, equipment.manufacture_year)],
    ["Estimated Age", firstKnown(equipment.estimatedAge, equipment.estimated_age)],
    ["Typical Industry Range", typicalRange],
    ["Service Life", typicalRange ? "Industry estimate only" : ""],
    ["Estimated SEER", firstKnown(equipment.estimatedSEER, equipment.estimated_seer)],
    ["Estimated AFUE", firstKnown(equipment.estimatedAFUE, equipment.estimated_afue)],
    [
      "Heating Efficiency",
      firstKnown(equipment.estimatedHeatingEfficiency, equipment.estimated_heating_efficiency),
    ],
    ["Efficiency", equipment.efficiency],
    ["Capacity", equipment.capacity],
    ["Fuel Type", firstKnown(equipment.fuelType, equipment.fuel_type)],
    ["Refrigerant", equipment.refrigerant],
    ["Condition", getEquipmentConditionNote(equipment.condition)],
    ["Report Section", equipment.section],
    ["Severity", equipment.severity],
  ];

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="mb-4 text-xl font-bold text-teal-400">
        Equipment Details
      </h2>

      {(imageUrl || videoUrl) && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-700 bg-black">
          {isVideo && videoUrl ? (
            <video
              src={videoUrl}
              poster={imageUrl && imageUrl !== videoUrl ? imageUrl : undefined}
              controls
              playsInline
              preload="metadata"
              className="max-h-72 w-full bg-black object-contain"
            />
          ) : (
            <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
              <img
                src={imageUrl}
                alt={firstKnown(equipment.equipmentType, equipment.equipment_type) || "Equipment"}
                loading="lazy"
                decoding="async"
                className="max-h-72 w-full bg-black object-contain"
              />
            </a>
          )}
        </div>
      )}

      {isKnownEquipmentValue(equipmentStatus) && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-black ${getStatusClass(equipmentStatus)}`}>
          <span className="mr-2 text-xs uppercase tracking-wide opacity-80">
            Equipment Status
          </span>
          {equipmentStatus}
        </div>
      )}

      <div className="space-y-3">
        {rows
          .filter(([, value]) => isKnownEquipmentValue(value))
          .map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 rounded-xl border border-slate-700 bg-slate-950 p-3 sm:grid-cols-[170px_1fr] sm:items-center"
            >
              <span className="text-sm font-bold text-slate-400">
                {label}
              </span>

              <span className="text-left font-semibold text-slate-100 sm:text-right">
                {String(value)}
              </span>
            </div>
          ))}
      </div>

      {typicalRange && (
        <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
          Service-life information is a general industry estimate only. Actual service life can vary based on installation quality, maintenance history, operating conditions, environment, and usage. This should not be treated as a prediction or guarantee of remaining equipment life.
        </p>
      )}
    </div>
  );
}
