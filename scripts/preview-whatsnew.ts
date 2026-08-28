import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildWhatsNewEmail } from "../lib/emailTemplates/whatsNewEmail";

function loadEnv() {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const out = process.argv[2] || "whatsnew-preview.html";

(async () => {
  const { data } = await sb
    .from("changelog_entries")
    .select("title, body")
    .order("published_at", { ascending: false })
    .limit(5);
  const entries = (data || []).map((e: any) => ({ title: String(e.title || ""), body: String(e.body || "") }));
  const html = buildWhatsNewEmail("Dusty", entries);
  fs.writeFileSync(out, html);
  console.log("Wrote", out, "with", entries.length, "entries");
})();
