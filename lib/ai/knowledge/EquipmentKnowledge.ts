export type EquipmentKnowledgeRecord = {
  manufacturer: string;
  model: string;
  equipmentType: string;
  fuelType?: string;
  refrigerant?: string;
  capacity?: string;
  efficiency?: string;
  notes?: string;
};

const RECORDS: EquipmentKnowledgeRecord[] = [];

export class EquipmentKnowledge {
  find(manufacturer?: string, model?: string) {
    const m = String(manufacturer || "").toLowerCase().trim();
    const mod = String(model || "").toLowerCase().trim();

    return (
      RECORDS.find(
        r =>
          r.manufacturer.toLowerCase() === m &&
          r.model.toLowerCase() === mod
      ) || null
    );
  }

  add(record: EquipmentKnowledgeRecord) {
    const existing = this.find(record.manufacturer, record.model);
    if (existing) return existing;

    RECORDS.push(record);
    return record;
  }

  all() {
    return RECORDS;
  }

  mergeVerified(record: EquipmentKnowledgeRecord) {
    const existing = this.find(record.manufacturer, record.model);

    if (!existing) {
      RECORDS.push(record);
      return record;
    }

    return Object.assign(existing, {
      ...existing,
      ...record,
    });
  }
}

export const equipmentKnowledge = new EquipmentKnowledge();
