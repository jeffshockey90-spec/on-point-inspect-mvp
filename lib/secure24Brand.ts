// Shared, dependency-free brand + consent strings. Imported by BOTH the client
// card and the server opt-in route so the consent we LOG is byte-for-byte what
// the client actually agreed to. (No node/crypto imports here -- safe in the
// browser bundle.)
//
// If Secure 24 later confirms ADT authorized-dealer status, this is the one
// place to change the display name (e.g. "Secure 24, an ADT Authorized Dealer").
export const SECURE24_BRAND = "Secure 24";

export const SECURE24_HEADLINE = "Interested in home security?";

export const SECURE24_BLURB =
  `Your inspector has partnered with ${SECURE24_BRAND}, a home-security provider. ` +
  `If you'd like, they can reach out to talk about protecting your home — no obligation.`;

export const SECURE24_CONSENT_TEXT =
  `Yes, I'd like ${SECURE24_BRAND} to contact me about home security. ` +
  `I understand my name and contact information will be shared with ${SECURE24_BRAND}, ` +
  `and that they may call, text, or email me.`;
