// Delete one of the signed-in inspector's saved quotes (its booking link stops working).

import { NextResponse } from "next/server";
import { getAdminClient, getSessionUser, unauthorized } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const { error } = await getAdminClient()
    .from("saved_quotes")
    .delete()
    .eq("id", id)
    .eq("inspector_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
