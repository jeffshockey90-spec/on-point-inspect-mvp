// SMS message templates. Kept short (1-2 segments) and always include an
// opt-out line for A2P 10DLC / TCPA compliance.

const OPT_OUT = "Reply STOP to opt out.";

type Ctx = {
  company: string;
  address: string;
  date?: string;
  time?: string;
  link?: string;
};

function line(company: string, message: string) {
  return `${company}: ${message} ${OPT_OUT}`;
}

export function smsConfirmation({ company, address, date, time }: Ctx) {
  const when = [date, time].filter(Boolean).join(" at ");
  return line(
    company,
    `Your home inspection at ${address}${when ? ` is confirmed for ${when}` : " is confirmed"}.`
  );
}

// Realtor/agent variant: the inspection belongs to their client, not to them.
export function smsConfirmationAgent({ company, address, date, time }: Ctx) {
  const when = [date, time].filter(Boolean).join(" at ");
  return line(
    company,
    `The inspection at ${address} for your client${when ? ` is confirmed for ${when}` : " is confirmed"}.`
  );
}

export function smsReminder({ company, address, date, time }: Ctx) {
  const when = [date, time].filter(Boolean).join(" at ");
  return line(
    company,
    `Reminder: your inspection at ${address}${when ? ` is ${when}` : " is coming up"}. See you there.`
  );
}

export function smsReportReadyClient({ company, address, link }: Ctx) {
  return line(
    company,
    `Your inspection report for ${address} is ready${link ? `: ${link}` : "."}`
  );
}

export function smsReportReadyAgent({ company, address, link }: Ctx) {
  return line(
    company,
    `The inspection report for ${address} is ready${link ? `: ${link}` : "."}`
  );
}
