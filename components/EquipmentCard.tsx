type EquipmentCardProps = {
  equipment: {
    equipmentType?: string;
    manufacturer?: string;
    model?: string;
    serial?: string;
    manufactureYear?: string | number;
    estimatedAge?: string | number;
    expectedServiceLife?: string;
    equipmentStatus?: string;
    efficiency?: string;
    estimatedSEER?: string;
    estimatedAFUE?: string;
    estimatedHeatingEfficiency?: string;
    capacity?: string;
    fuelType?: string;
    refrigerant?: string;
    condition?: string;
    estimatedLifeRemaining?: string;
    section?: string;
    severity?: string;
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
  const explicit = String(equipment.equipmentStatus || "").trim();
  if (isKnownEquipmentValue(explicit)) return explicit;

  const condition = String(equipment.condition || "").toLowerCase();
  const ageText = String(equipment.estimatedAge || "");
  const rangeText = String(equipment.expectedServiceLife || "");
  const ageNumber = Number(ageText.replace(/[^0-9.]/g, ""));
  const rangeNumbers = rangeText.match(/\d+/g) || [];
  const maxLife = rangeNumbers.length > 0 ? Number(rangeNumbers[rangeNumbers.length - 1]) : null;

  if (condition.includes("failed") || condition.includes("not operating") || condition.includes("repair")) {
    return "⚠ Service Recommended";
  }

  if (maxLife && Number.isFinite(ageNumber) && ageNumber >= maxLife - 2) {
    return "⚠ Near End of Typical Service Life";
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

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  const typicalRange = getTypicalIndustryRange(equipment.expectedServiceLife);
  const equipmentStatus = getEquipmentStatus(equipment);

  const rows = [
    ["Equipment Type", equipment.equipmentType],
    ["Manufacturer", equipment.manufacturer],
    ["Model Number", equipment.model],
    ["Serial Number", equipment.serial],
    ["Manufacture Year", equipment.manufactureYear],
    ["Estimated Age", equipment.estimatedAge],
    ["Typical Industry Range", typicalRange],
    ["Service Life", typicalRange ? "Industry estimate only" : ""],
    ["Estimated SEER", equipment.estimatedSEER],
    ["Estimated AFUE", equipment.estimatedAFUE],
    ["Heating Efficiency", equipment.estimatedHeatingEfficiency],
    ["Efficiency", equipment.efficiency],
    ["Capacity", equipment.capacity],
    ["Fuel Type", equipment.fuelType],
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
