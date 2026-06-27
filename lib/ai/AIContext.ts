import { createClient } from "../../utils/supabase/server";

export type AIInspectionContext = {
  inspectionId?: number | string;
  inspectorName?: string;
  companyName?: string;
  propertyAddress?: string;
  inspectionType?: string;
  yearBuilt?: number | null;
  propertyStyle?: string | null;
  previousFindings: string[];
  equipmentFound: string[];
};

export class AIContext {
  async load(inspectionId?: number | string): Promise<AIInspectionContext> {
    const context: AIInspectionContext = {
      inspectionId,
      previousFindings: [],
      equipmentFound: [],
    };

    if (!inspectionId) return context;

    const supabase = await createClient();

    const [{ data: inspection }, { data: findings }, { data: equipment }] =
      await Promise.all([
        supabase
          .from("inspections")
          .select("property_address, inspection_type, year_built, property_style")
          .eq("id", inspectionId)
          .maybeSingle(),
        supabase
          .from("findings")
          .select("title")
          .eq("inspection_id", inspectionId),
        supabase
          .from("equipment_inventory")
          .select("manufacturer,equipment_type")
          .eq("inspection_id", inspectionId),
      ]);

    if (inspection) {
      context.propertyAddress = inspection.property_address ?? undefined;
      context.inspectionType = inspection.inspection_type ?? undefined;
      context.yearBuilt = inspection.year_built ?? null;
      context.propertyStyle = inspection.property_style ?? null;
    }

    context.previousFindings =
      findings?.map((f:any)=>f.title).filter(Boolean) ?? [];

    context.equipmentFound =
      equipment?.map((e:any)=>
        [e.manufacturer,e.equipment_type].filter(Boolean).join(" ")
      ).filter(Boolean) ?? [];

    return context;
  }
}

export const aiContext = new AIContext();
