// Company owners get RLS-level access to every inspection on their team
// (see supabase/add-company-owner-dispatch-access.sql), but individual
// routes/pages historically hardcoded ownership checks to inspector_id,
// blocking an owner from opening or editing a teammate's report at all.
// This resolves which column to scope an `inspections` query by: company
// owners match on company_id (any inspection on the team), everyone else
// matches their own inspector_id.
export async function resolveInspectionAccessFilter(supabase: any, userId: string) {
  // A user can have more than one company_users row (e.g. they own one
  // company and also inspect for another), so this can't assume a single
  // row and must not use maybeSingle(), which throws on more than one match.
  const { data: ownerRows } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .not("company_id", "is", null)
    .limit(1);

  const ownedCompanyId = ownerRows?.[0]?.company_id;

  if (ownedCompanyId) {
    return { column: "company_id" as const, value: ownedCompanyId };
  }

  return { column: "inspector_id" as const, value: userId };
}
