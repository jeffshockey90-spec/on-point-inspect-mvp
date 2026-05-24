import { supabase } from "./supabaseClient";

export async function getCompanyId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn("No logged in user found. Falling back to company 1.");
    return 1;
  }

  const { data, error } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    console.warn("No company found for user. Falling back to company 1.");
    return 1;
  }

  return data.company_id;
}