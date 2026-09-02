// Optional social-media / content-use consent. Company-level release text +
// on/off live on `companies`; the per-inspection consent record lives on
// `inspections` (social_media_consent / _at / _name / _source). Client can grant
// or skip; it never blocks the inspection or report. See add-social-media-release.sql.

export { resolveInspectionByToken } from "./insuranceReferral";

// A robust plain-English default the inspector can edit in Settings. NOT legal
// advice — the Settings panel tells the owner to have a MD/PA/WV attorney review
// it. Written for property condition videos posted to social media with no
// personal/identifying info intentionally shown.
export const DEFAULT_SOCIAL_MEDIA_RELEASE = `Social Media & Content Release (Optional)

By agreeing below, I ("Client") voluntarily grant the inspection company and its owners, employees, and agents ("Company") permission to photograph and record video during the home inspection of the property, and to use, edit, reproduce, publish, and distribute that photo and video content on social media platforms (including Facebook, TikTok, Instagram, and YouTube) and in the Company's marketing and educational materials.

I understand and agree that:

1. Content will focus on the home and its systems and conditions for educational and promotional purposes. The Company will make reasonable efforts to exclude personal and identifying information — no property address, my name, other occupants' names, recognizable faces, or personal documents or belongings that identify me or my household will be intentionally shown.

2. If any identifying detail is incidentally captured, I authorize its use and waive any claim arising from that incidental inclusion. I may ask the Company to remove or edit a specific piece of content, and the Company will make reasonable efforts to honor the request for content within its control (content already shared or re-posted by others may not be fully removable).

3. This permission is granted without compensation, royalty, or payment of any kind. The Company is under no obligation to use any content and may edit, decline to use, or remove it at its discretion.

4. To the fullest extent permitted by law, I release and hold harmless the Company and its owners, employees, and agents from any and all claims, demands, or liability arising out of the capture, use, publication, or distribution of this content, including any claim based on rights of privacy or publicity, defamation, or similar rights.

5. I represent that I am the owner or an authorized occupant of the property with the authority to grant this permission.

6. This release is voluntary and optional. Declining does not affect my home inspection, my report, or any services I receive in any way.

7. This release is governed by the laws of the state in which the inspection is performed (Maryland, Pennsylvania, or West Virginia, as applicable).

I have read and understand this release and agree to its terms.`;
