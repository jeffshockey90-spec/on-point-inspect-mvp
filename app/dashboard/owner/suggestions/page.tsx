import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import OwnerSuggestions from "./OwnerSuggestions";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OwnerSuggestionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = String(user.email || "").toLowerCase();
  if (!OWNER_EMAILS.includes(email)) redirect("/");

  return <OwnerSuggestions />;
}
