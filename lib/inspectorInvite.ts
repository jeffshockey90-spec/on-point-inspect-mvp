// Team-invite helpers shared by the invite and resend-invite routes.

/** "active" once the invited inspector has signed in at least once. */
export function inviteStatusFor(authUser: { last_sign_in_at?: string | null } | null | undefined) {
  return authUser?.last_sign_in_at ? "active" : "pending";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildInspectorInviteEmail(input: {
  name: string;
  companyName: string;
  actionLink: string;
  reminder?: boolean;
}) {
  const name = input.name || "there";
  const lead = input.reminder
    ? `${input.companyName} is waiting for you on FLOW. Set your password to get started:`
    : `${input.companyName} added you as an inspector on FLOW. Set your password to get started:`;
  return {
    subject: input.reminder
      ? `Reminder: finish joining ${input.companyName} on FLOW`
      : `You've been added to ${input.companyName} on FLOW`,
    html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
              <p>Hi ${escapeHtml(name)},</p>
              <p>${escapeHtml(lead)}</p>
              <p style="margin:24px 0;">
                <a href="${escapeHtml(input.actionLink)}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
                  Set Your Password
                </a>
              </p>
              <p style="font-size:12px;color:#64748b;">FLOW</p>
            </div>
          `,
    text: `Hi ${name},\n\n${lead}\n${input.actionLink}\n\nFLOW`,
  };
}
