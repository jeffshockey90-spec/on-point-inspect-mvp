import { SupabaseClient } from "@supabase/supabase-js";

type LinkArgs = {
  supabase: SupabaseClient;
  inspectionId: number | string;
  inspectorId: string;
  realtorName?: string | null;
  realtorEmail?: string | null;
  selectedRealtorContactId?: string | null;
};

function clean(value?: string | null) {
  return String(value || "").trim();
}

function cleanEmail(value?: string | null) {
  return clean(value).toLowerCase();
}

export async function linkRealtorToInspection({
  supabase,
  inspectionId,
  inspectorId,
  realtorName,
  realtorEmail,
  selectedRealtorContactId,
}: LinkArgs) {
  try {
    let realtorContactId = clean(selectedRealtorContactId) || null;

    if (!realtorContactId && cleanEmail(realtorEmail)) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("inspector_id", inspectorId)
        .ilike("email", cleanEmail(realtorEmail))
        .in("type", ["realtor", "agent", "transaction_coordinator", "transaction coordinator"])
        .maybeSingle();

      if (!error && data?.id) realtorContactId = data.id;
    }

    if (!realtorContactId && clean(realtorName)) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("inspector_id", inspectorId)
        .ilike("name", clean(realtorName))
        .in("type", ["realtor", "agent", "transaction_coordinator", "transaction coordinator"])
        .maybeSingle();

      if (!error && data?.id) realtorContactId = data.id;
    }

    if (!realtorContactId) return null;

    const { error: updateError } = await supabase
      .from("inspections")
      .update({ realtor_contact_id: realtorContactId })
      .eq("id", inspectionId)
      .eq("inspector_id", inspectorId);

    if (updateError) {
      console.error("Realtor referral link update failed:", updateError);
      return null;
    }

    return realtorContactId;
  } catch (error) {
    console.error("Realtor referral link failed:", error);
    return null;
  }
}
