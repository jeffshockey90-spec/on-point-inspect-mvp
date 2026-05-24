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
    condition?: string;
    estimatedLifeRemaining?: string;
    section?: string;
  };
};

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">
            {equipment.manufacturer || "Unknown"}{" "}
            {equipment.equipmentType || "Equipment"}
          </h3>
          <p className="text-sm text-slate-400">
            Section: {equipment.section || "Not assigned"}
          </p>
        </div>

        <span className="rounded-full bg-teal-500/15 px-3 py-1 text-xs font-semibold text-teal-300">
          AI Equipment
        </span>
      </div>

      <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <Info label="Model" value={equipment.model} />
        <Info label="Serial" value={equipment.serial} />
        <Info label="Manufacture Year" value={equipment.manufactureYear} />
        <Info label="Estimated Age" value={equipment.estimatedAge} />
        <Info label="Efficiency" value={equipment.efficiency} />
        <Info label="Capacity" value={equipment.capacity} />
        <Info label="Fuel Type" value={equipment.fuelType} />
        <Info label="Life Remaining" value={equipment.estimatedLifeRemaining} />
      </div>

      {equipment.condition && (
        <div className="mt-4 rounded-xl bg-slate-800 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Condition
          </p>
          <p className="mt-1 text-sm text-slate-100">{equipment.condition}</p>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) {
  return (
    <div className="rounded-xl bg-slate-800 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-medium text-white">{value || "Unknown"}</p>
    </div>
  );
}