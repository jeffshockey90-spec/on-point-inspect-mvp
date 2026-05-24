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

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
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
    ["Estimated Life Remaining", equipment.estimatedLifeRemaining],
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
    </div>
  );
}