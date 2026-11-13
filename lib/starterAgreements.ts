import { ORIENTATION_AGREEMENT_SERVICE_TYPE } from "./inspectorPricing";

// Built-in "starter" agreement templates an inspector can drop into their
// Agreement Library with one click (Settings → Agreements → "+ Home Orientation
// starter"). They are plain templates once added — fully editable — and carry the
// same {{MERGE_FIELDS}} as any other agreement (see lib/agreementTemplates.ts).
//
// The Home Orientation agreement is deliberately scoped as NOT a home inspection:
// a new-owner / possession walkthrough is an educational familiarization visit,
// not an inspection to any Standard of Practice, and this wording is the liability
// firewall that keeps the two services in separate lanes. Wording follows the
// platform's cautious-report rule — components are framed by typical service life
// plus a maintenance caveat, never a prediction that something WILL fail or a hard
// deadline.

export type StarterAgreement = {
  key: string;
  title: string;
  version: string;
  state: string; // "GENERAL" = any state
  service_type: string;
  body: string;
};

const HOME_ORIENTATION_BODY = `HOME ORIENTATION / NEW-OWNER WALKTHROUGH AGREEMENT

This Agreement is between {{CLIENT_NAME}} ("Client") and {{INSPECTOR_COMPANY}} ("Company") for a Home Orientation at:

Property: {{PROPERTY_ADDRESS}}
Date: {{INSPECTION_DATE}}
Fee: {{INSPECTION_FEE}}

1. WHAT THIS SERVICE IS. The Home Orientation is an educational, familiarization walkthrough of a home the Client owns or is taking possession of. Its purpose is to help the Client locate and operate the home's major systems and shutoffs (water, gas, and electrical), understand routine maintenance, and identify general safety items such as smoke and carbon-monoxide alarms. It is a point-in-time, visual, and non-invasive walkthrough performed for the Client's general understanding of the home.

2. WHAT THIS SERVICE IS NOT. This Home Orientation is NOT a home inspection. It is NOT performed to, and does NOT satisfy, any home-inspection Standard of Practice (such as InterNACHI, ASHI, or any state standard), and it does NOT satisfy any inspection contingency in a purchase contract. It does NOT produce a home-inspection report, does NOT identify or report defects, and is NOT a substitute for a professional home inspection. If the Client wants a home inspection, a separate inspection and inspection agreement are required.

3. SCOPE AND LIMITATIONS. The walkthrough is limited to readily accessible areas and to systems the Company can safely operate by their normal controls as a demonstration. The Company does not move furniture or stored items, dismantle any system or component, operate shut-off or de-energized equipment, or test any component to or beyond its limits. Conditions hidden by finishes, storage, weather, utilities that are off, or occupancy are outside the scope. Because the orientation is a brief familiarization and not an inspection, it is not designed to and will not discover latent, concealed, or future conditions.

4. CONDITION OF THE HOME; NO WARRANTY. Any discussion of a system or component is general and educational. Where service life is mentioned, it is described as a typical range together with ordinary maintenance, not as a prediction that a component will fail or a date by which it must be replaced. The Company makes NO warranty or guarantee, express or implied, regarding the home or any of its systems, components, or contents, and does not warrant their present or future condition, performance, or compliance with any code. The Client remains responsible for the condition of the property.

5. MAINTENANCE MATERIALS. Any maintenance calendar, shut-off location photos, checklists, or notes the Company provides are educational aids offered as-is, for the Client's convenience, and do not change the scope or the disclaimers above.

6. LIMITATION OF LIABILITY. The Company's liability arising out of or related to this Home Orientation, if any, is limited to the amount of the fee paid for the service. The Client agrees that this limitation is a fair allocation of risk given the educational, non-inspection nature of the service and its fee. Any claim must be brought within one year of the walkthrough date.

7. PAYMENT. The fee stated above is due as agreed.

8. ENTIRE AGREEMENT. This Agreement is the entire agreement between the parties regarding the Home Orientation and supersedes any prior understanding. If any provision is found unenforceable, the remaining provisions stay in effect.

Client: {{CLIENT_NAME}}
Company: {{INSPECTOR_COMPANY}}
Dated: {{SIGNED_DATE}}`;

export const HOME_ORIENTATION_AGREEMENT: StarterAgreement = {
  key: "home_orientation",
  title: "Home Orientation / New-Owner Walkthrough Agreement",
  version: "v1",
  state: "GENERAL",
  service_type: ORIENTATION_AGREEMENT_SERVICE_TYPE,
  body: HOME_ORIENTATION_BODY,
};

export const STARTER_AGREEMENTS: StarterAgreement[] = [HOME_ORIENTATION_AGREEMENT];
