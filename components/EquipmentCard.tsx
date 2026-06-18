type EquipmentCardProps = {
  equipment: {
    equipmentType?: string;
    manufacturer?: string;
    model?: string;
    serial?: string;
    manufactureYear?: string | number;
    estimatedAge?: string | number;
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

function getServiceLifeNote(equipment: EquipmentCardProps["equipment"]) {
  const condition = String(equipment.condition || "").toLowerCase();
  const remaining = String(equipment.estimatedLifeRemaining || "").toLowerCase();

  if (
    condition.includes("beyond") ||
    condition.includes("past") ||
    remaining.includes("beyond") ||
    remaining.includes("0-")
  ) {
    return "At or beyond typical service-life range";
  }

  if (
    condition.includes("near end") ||
    condition.includes("end of typical") ||
    remaining.includes("near")
  ) {
    return "Near typical service-life range";
  }

  if (equipment.estimatedAge || equipment.manufactureYear) {
    return "Service life varies";
  }

  return "";
}

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  const serviceLifeNote = getServiceLifeNote(equipment);

  const rows = [
    ["Equipment Type", equipment.equipmentType],
    ["Manufacturer", equipment.manufacturer],
    ["Model Number", equipment.model],
    ["Serial Number", equipment.serial],
    ["Manufacture Year", equipment.manufactureYear],
    ["Estimated Age", equipment.estimatedAge],
    ["Efficiency", equipment.efficiency],
    ["Capacity", equipment.capacity],
    ["Fuel Type", equipment.fuelType],
    ["Refrigerant", equipment.refrigerant],
    ["Condition", equipment.condition],
    ["Service Life Note", serviceLifeNote],
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
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-950 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm font-bold text-slate-400">
                {label}
              </span>

              <span className="text-slate-100">
                {String(value)}
              </span>
            </div>
          ))}
      </div>

      <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
        Service life information is a general industry estimate only. Actual service life can vary based on installation quality, maintenance history, operating conditions, environment, and usage.
      </p>
    </div>
  );
}
