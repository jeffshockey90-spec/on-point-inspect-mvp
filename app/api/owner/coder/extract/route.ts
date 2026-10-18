import { NextResponse } from "next/server";
import { requireOwnerUser } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pulls readable text out of a doc the owner attached in the coder chat (PDF or
// plain text) so Claude can actually read it, not just see a filename. Images
// are handled separately by the chat's vision model; .docx isn't supported yet.
function clean(t: string) {
  return String(t || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const url = String(body?.url || "");
  const name = String(body?.name || "document");
  // Only read files we uploaded to our own storage.
  if (!/^https?:\/\//.test(url) || !url.includes("/storage/v1/object/")) {
    return NextResponse.json({ error: "Unsupported file." }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ text: "" });
    const type = String(res.headers.get("content-type") || "").toLowerCase();
    const lowerName = name.toLowerCase();

    if (type.includes("pdf") || lowerName.endsWith(".pdf")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const result = await pdfParse(buffer);
        const text = clean(result?.text || "");
        if (text.replace(/\s/g, "").length < 20) {
          return NextResponse.json({ text: "", note: "This PDF looks like a scanned image — I couldn't read text from it." });
        }
        return NextResponse.json({ text: text.slice(0, 15000) });
      } catch {
        return NextResponse.json({ text: "", note: "I couldn't read that PDF." });
      }
    }

    if (type.startsWith("text/") || /\.(txt|md|csv|log)$/.test(lowerName)) {
      const text = clean(await res.text());
      return NextResponse.json({ text: text.slice(0, 15000) });
    }

    // .docx and other formats: not readable yet.
    return NextResponse.json({ text: "", note: "I can see that file is attached, but I can only read PDFs, text files, and images right now." });
  } catch (e: any) {
    return NextResponse.json({ text: "", note: "I couldn't open that file." });
  }
}
