// Cloudflare Email Worker for support@flowinspect.app
// -----------------------------------------------------
// Deploy this as an Email Worker in Cloudflare, then point the
// support@flowinspect.app Email Routing rule at it. On every inbound message
// it streams the raw MIME to FLOW, which parses it, stores it, and pushes you.
//
// Required Worker variable (Settings -> Variables):
//   INBOUND_EMAIL_SECRET  — must match the same env var in Vercel
// Optional:
//   FLOW_INBOUND_URL      — defaults to the production endpoint below

export default {
  async email(message, env) {
    const url = env.FLOW_INBOUND_URL || "https://app.flowinspect.app/api/inbound/email";
    const secret = env.INBOUND_EMAIL_SECRET || "";

    // Read the full raw RFC822 message.
    const raw = await new Response(message.raw).arrayBuffer();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "message/rfc822",
          "X-Inbound-Secret": secret,
        },
        body: raw,
      });

      // Only ask the sender to retry on a real server-side failure. A 2xx
      // (stored or filtered-as-noise) or a 4xx (bad secret — retrying won't
      // help) is accepted so we never bounce a client's genuine reply.
      if (res.status >= 500) {
        message.setReject("Temporary processing error, please retry");
      }
    } catch {
      // FLOW unreachable — reject so the sending server retries later rather
      // than silently dropping the reply.
      message.setReject("Temporary processing error, please retry");
    }

    // Optional: also keep a human-readable copy in your Gmail. Verify the
    // address as a Cloudflare Email Routing destination first, then uncomment:
    // await message.forward("jeffshockey3@gmail.com");
  },
};
