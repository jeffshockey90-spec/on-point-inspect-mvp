type EquipmentCardProps = {
  equipment: {
    equipmentType?: string;
    manufacturer?: string;
    model?: string;
    serial?: string;
    manufactureYear?: string | number;
    estimatedAge?: string | number;
    expectedServiceLife?: string;
    efficiency?: string;
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

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  const typicalRange = getTypicalIndustryRange(equipment.expectedServiceLife);

  const rows = [
    ["Equipment Type", equipment.equipmentType],
    ["Manufacturer", equipment.manufacturer],
    ["Model Number", equipment.model],
    ["Serial Number", equipment.serial],
    ["Manufacture Year", equipment.manufactureYear],
    ["Estimated Age", equipment.estimatedAge],
    ["Typical Industry Range", typicalRange],
    ["Service Life", typicalRange ? "Industry estimate only" : ""],
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
