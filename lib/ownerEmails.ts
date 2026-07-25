export const OWNER_EMAILS = [
  "jeff@onpointhomeinspect.com",
  "jeffshockey90@gmail.com",
];

export function isOwnerEmail(email: unknown) {
  return OWNER_EMAILS.includes(String(email || "").trim().toLowerCase());
}
