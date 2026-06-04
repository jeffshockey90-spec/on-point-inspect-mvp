import { supabase } from "./supabaseClient";

export async function getCompanyId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No logged in user.");
  }

  const { data, error } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (error || !data?.company_id) {
    throw new Error(
      "No company is linked to this account."
    );
  }

  return data.company_id;
}