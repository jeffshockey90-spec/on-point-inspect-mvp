export type ManufacturerInfo = {
  name: string;
  aliases: string[];
  serialHints: string[];
  commonEquipment: string[];
  notes: string;
};

const MANUFACTURERS: ManufacturerInfo[] = [
  {
    name: "Carrier",
    aliases: ["carrier","bryant","payne","bdp"],
    serialHints: ["WWYY","YYWW","carrier"],
    commonEquipment: ["Furnace","Air Conditioner","Heat Pump","Air Handler"],
    notes: "Carrier family brands often share serial/date patterns."
  },
  {
    name: "Trane",
    aliases: ["trane","american standard"],
    serialHints: ["trane","american standard"],
    commonEquipment: ["Furnace","Air Conditioner","Heat Pump","Air Handler"],
    notes: "American Standard shares many Trane manufacturing patterns."
  },
  {
    name: "Goodman",
    aliases: ["goodman","amana","daikin"],
    serialHints: ["goodman","amana","daikin"],
    commonEquipment: ["Furnace","Air Conditioner","Heat Pump"],
    notes: "Daikin family brands frequently share components."
  },
  {
    name: "Rheem",
    aliases: ["rheem","ruud"],
    serialHints: ["rheem","ruud"],
    commonEquipment: ["Furnace","Water Heater","Air Conditioner","Heat Pump"],
    notes: "Ruud equipment commonly uses Rheem manufacturing conventions."
  },
  {
    name: "Lennox",
    aliases: ["lennox","armstrong","ducane"],
    serialHints: ["lennox"],
    commonEquipment: ["Furnace","Air Conditioner","Heat Pump"],
    notes: "Lennox family equipment."
  }
];

export class ManufacturerDatabase {
  find(value?: string) {
    const search = String(value || "").toLowerCase().trim();
    if (!search) return null;

    return (
      MANUFACTURERS.find(m =>
        m.name.toLowerCase() === search ||
        m.aliases.some(a => search.includes(a))
      ) || null
    );
  }

  all() {
    return MANUFACTURERS;
  }
}

export const manufacturerDatabase = new ManufacturerDatabase();
