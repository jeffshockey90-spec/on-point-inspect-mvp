import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import OwnerSupportChat from "./OwnerSupportChat";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OwnerSupportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = String(user.email || "").toLowerCase();
  if (!OWNER_EMAILS.includes(email)) redirect("/");

  return <OwnerSupportChat />;
}
