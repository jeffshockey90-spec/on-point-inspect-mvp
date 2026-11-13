import { ORIENTATION_AGREEMENT_SERVICE_TYPE } from "./inspectorPricing";

// Built-in "starter" agreement templates an inspector can drop into their
// Agreement Library with one click (Settings → Agreements → "+ Home Orientation
// starter"). They are plain templates once added — fully editable — and carry the
// same {{MERGE_FIELDS}} as any other agreement (see lib/agreementTemplates.ts).
//
// The Home Orientation agreement is deliberately scoped as NOT a home inspection:
// a new-owner / possession walkthrough is an educational familiarization visit,
// not an inspection to any Standard of Practice, and this wording is the liability
// firewall that keeps the two services in separate lanes. It also makes clear it
// is NOT a reinspection and does not verify previously recommended repairs — so an
// existing client's prior inspection + report stand untouched. Wording follows the
// platform's cautious-report rule (service life framed as general information, not
// a prediction of remaining life or a date a component will fail).

export type StarterAgreement = {
  key: string;
  title: string;
  version: string;
  state: string; // "GENERAL" = any state
  service_type: string;
  body: string;
};

const HOME_ORIENTATION_BODY = `HOME ORIENTATION / NEW-OWNER WALKTHROUGH AGREEMENT

Inspection Company: {{INSPECTOR_COMPANY}}
Client: {{CLIENT_NAME}}
Property Address: {{PROPERTY_ADDRESS}}
Service Date: {{INSPECTION_DATE}}
Service Fee: {{INSPECTION_FEE}}

1. Purpose of Service
The Company agrees to provide a Home Orientation / New-Owner Walkthrough intended to familiarize the Client with the home's major systems, equipment, shutoff locations, general operation, routine maintenance, and basic safety considerations.
This service is educational and informational in nature. It consists of a limited, visual, non-invasive walkthrough of readily accessible portions of the property.

2. Not a Home Inspection
The Client acknowledges and agrees that this service:
• Is not a home inspection or reinspection.
• Is not performed under InterNACHI, ASHI, or any state home inspection Standard of Practice.
• Does not constitute a comprehensive evaluation of the property's condition.
• Does not include systematic defect identification, testing, or diagnosis.
• Does not include a formal home inspection report.
• Does not provide certification of the condition, safety, or proper operation of any component.
The Company may discuss previously documented inspection findings for educational purposes. Such discussions do not constitute verification of repairs or an update to the original inspection report.
Any previous home inspection performed by the Company remains subject to its original agreement, scope, limitations, and report.

3. Scope of Orientation
Depending on the property's systems and accessibility, the walkthrough may include:
• Location of the main water shutoff and individual plumbing shutoffs.
• Location and general operation of the electrical panel and disconnects.
• General operation of heating and cooling equipment and thermostats.
• Location and replacement of accessible HVAC filters.
• Water heater controls and routine maintenance.
• Basic operation of accessible sump pumps and other installed equipment.
• General information regarding smoke and carbon monoxide alarms.
• Exterior drainage, gutters, and seasonal maintenance considerations.
• Responses to Client questions concerning general homeownership and maintenance.
The Company determines which systems can be safely demonstrated.

4. Limitations and Exclusions
The orientation is limited to readily accessible areas and equipment.
The Company will not dismantle equipment, move personal belongings, perform destructive testing, operate unsafe equipment, or conduct specialized inspections or testing.
The service is not intended to discover concealed defects, latent conditions, code violations, or future failures.
The Company may decline to operate any equipment when operation could present a safety risk or cause damage.

5. Property Condition and No Warranty
The Client understands that equipment and components may fail without warning, regardless of apparent condition or age.
Any discussion of expected service life represents general educational information and is not a prediction of actual remaining life.
The Company makes no warranty or guarantee, express or implied, regarding the condition, performance, safety, or remaining useful life of the property or its systems.
The Client remains responsible for maintaining the property and obtaining qualified professional evaluations or repairs when necessary.

6. Educational Materials
The Company may provide photographs, maintenance schedules, shutoff locations, or general orientation notes.
These materials are educational references only and do not constitute an inspection report, certification, or warranty.
No formal written report is included unless separately agreed upon in writing.

7. Limitation of Liability
To the fullest extent permitted by applicable law, the Company's liability arising solely from the Home Orientation service shall not exceed the fee paid for this service.
Any claim arising from this Agreement must be brought within one year of the service date, to the extent permitted by applicable law.
These limitations do not apply where prohibited by law and do not modify the terms or obligations of any separate home inspection agreement.

8. Payment
The Client agrees to pay the service fee according to the Company's payment terms.
Payment is due before the scheduled service unless otherwise agreed upon in writing.

9. Entire Agreement
This Agreement represents the entire understanding between the parties concerning the Home Orientation service.
It does not replace, modify, or supersede any prior home inspection agreement.
Any changes must be agreed upon in writing by both parties.

10. Client Acknowledgment
By signing below, the Client acknowledges that:
• The service is an educational homeowner orientation, not a home inspection.
• The Company is not conducting a reinspection or verifying previously recommended repairs.
• The service has limitations and does not establish the condition or safety of the property.
• The Client has read and understands the terms of this Agreement.
Electronic signatures shall have the same effect as handwritten signatures to the extent permitted by applicable law.

Client Signature: __________________________    Date: {{SIGNED_DATE}}
Company Representative: __________________________    Date: __________________`;

export const HOME_ORIENTATION_AGREEMENT: StarterAgreement = {
  key: "home_orientation",
  title: "Home Orientation / New-Owner Walkthrough Agreement",
  version: "v1",
  state: "GENERAL",
  service_type: ORIENTATION_AGREEMENT_SERVICE_TYPE,
  body: HOME_ORIENTATION_BODY,
};

export const STARTER_AGREEMENTS: StarterAgreement[] = [HOME_ORIENTATION_AGREEMENT];
