import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildWhatsNewEmail } from "../lib/emailTemplates/whatsNewEmail";
import { buildOwnerPlainEmail } from "../lib/emailTemplates/ownerPlainEmail";

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

const outDir = process.argv[2] || ".";

const missYou =
  `Hi Dusty,\n\n` +
  `I noticed it's been a little while since your last inspection in FLOW, and I wanted to reach out personally. Whether things got busy, you ran into a snag, or FLOW just hadn't clicked into your workflow yet — I'd genuinely love to help you get back up and running.\n\n` +
  `Here's what FLOW does for you on every single job:\n` +
  `• Build your report right from the field on your phone, and finish it in minutes\n` +
  `• Let the AI draft your finding write-ups so you're not typing the same things over and over\n` +
  `• Send the client a clean, branded report — with agreements and payment in the same flow\n` +
  `• Keep scheduling, pricing, quotes, and delivery all in one place\n\n` +
  `If anything's been getting in your way, reply straight to this email and I'll help you personally. No bots, that's actually me.\n\n` +
  `Ready whenever you are:\n\n` +
  `Jeff Shockey\nFounder, FLOW\nflowinspect.app`;

(async () => {
  const { data } = await sb
    .from("changelog_entries")
    .select("title, body")
    .order("published_at", { ascending: false })
    .limit(5);
  const entries = (data || []).map((e: any) => ({ title: String(e.title || ""), body: String(e.body || "") }));

  fs.writeFileSync(`${outDir}/email-whatsnew.html`, buildWhatsNewEmail("Dusty", entries));
  fs.writeFileSync(`${outDir}/email-plain-missyou.html`, buildOwnerPlainEmail(missYou));
  console.log("Wrote email-whatsnew.html and email-plain-missyou.html to", outDir);
})();
