// Inviting an inspector creates an auth user, and the auth.users signup trigger
// auto-provisions a standalone company (+ owner membership) for them. This
// removes ONLY that auto-created company: the companies the NEW user was a
// member of, other than the inviting company, that have no other members left.
//
// It must never match companies by email: companies.email is just a contact
// address, so inviting e.g. info@othercompany.com used to delete that other
// tenant's company row.

type Db = { from: (t: string) => any };

export async function removeAutoProvisionedCompanies(
  admin: Db,
  newUserId: string,
  keepCompanyId: string | number,
): Promise<string[]> {
  const { data: memberships } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", newUserId);

  const candidateIds: string[] = Array.from(
    new Set<string>(
      (memberships || [])
        .map((m: any) => String(m?.company_id ?? ""))
        .filter((id: string) => id && id !== String(keepCompanyId)),
    ),
  );

  // Detach the new user from the auto-provisioned membership(s).
  await admin.from("company_users").delete().eq("user_id", newUserId);

  const deleted: string[] = [];
  for (const id of candidateIds) {
    const { count } = await admin
      .from("company_users")
      .select("user_id", { count: "exact", head: true })
      .eq("company_id", id);
    // Only delete a company nobody else belongs to.
    if (!count) {
      const { error } = await admin.from("companies").delete().eq("id", id);
      if (!error) deleted.push(id);
    }
  }
  return deleted;
}
