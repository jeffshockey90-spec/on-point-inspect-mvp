import { NextResponse } from "next/server";

type EmailType =
  | "inspection_confirmation"
  | "agreement_reminder"
  | "payment_reminder"
  | "report_published"
  | "review_request";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      emailType,
      clientName,
      propertyAddress,
      inspectionDate,
      inspectionTime,
      reportLink,
      inspectorName = "Jeff Shockey",
      companyName = "On Point Home Inspections",
      phone = "240-527-7172",
      website = "https://onpointhomeinspect.com",
    } = body;

    if (!emailType) {
      return NextResponse.json(
        { error: "Missing emailType" },
        { status: 400 }
      );
    }

    const name = clientName || "there";
    const address = propertyAddress || "the property";

    let subject = "";
    let message = "";

    switch (emailType as EmailType) {
      case "inspection_confirmation":
        subject = `Inspection Confirmed - ${address}`;
        message = `Hi ${name},

Your home inspection for ${address} has been confirmed.

Inspection Date: ${inspectionDate || "Scheduled date"}
Inspection Time: ${inspectionTime || "Scheduled time"}

Please make sure the inspection agreement is signed and payment is completed prior to the inspection.

I look forward to meeting you and helping you better understand the condition of the home.

Thank you,

${inspectorName}
${companyName}
${phone}
${website}`;
        break;

      case "agreement_reminder":
        subject = `Inspection Agreement Reminder - ${address}`;
        message = `Hi ${name},

This is a friendly reminder to please review and sign your inspection agreement prior to the inspection for ${address}.

The agreement must be completed before the inspection can take place.

Please let me know if you have any questions.

Thank you,

${inspectorName}
${companyName}
${phone}
${website}`;
        break;

      case "payment_reminder":
        subject = `Inspection Payment Reminder - ${address}`;
        message = `Hi ${name},

This is a friendly reminder that payment is due prior to the inspection for ${address}.

Once payment and the signed agreement are completed, everything will be ready for your scheduled inspection.

Please let me know if you have any questions.

Thank you,

${inspectorName}
${companyName}
${phone}
${website}`;
        break;

      case "report_published":
        subject = `Your Home Inspection Report Is Ready - ${address}`;
        message = `Hi ${name},

Your home inspection report for ${address} has been completed and is ready to view.

You can view your report here:
${reportLink || "[REPORT LINK]"}

While viewing your report, please remember the purpose of a home inspection is to identify visible defects and potential concerns at the time of the inspection. The inspection is intended to provide information about the current condition of the home and should not be interpreted as a pass or fail evaluation of the property.

Please let me know if you have any questions.

Thank you,

${inspectorName}
${companyName}
${phone}
${website}`;
        break;

      case "review_request":
        subject = `Thank You For Choosing ${companyName}`;
        message = `Hi ${name},

Thank you again for choosing ${companyName} for your home inspection at ${address}.

If you were happy with the inspection and report, I would greatly appreciate a Google review. Reviews help small local businesses like mine grow and help future clients feel confident when choosing an inspector.

You can leave a review here:
[GOOGLE REVIEW LINK]

Thank you again,

${inspectorName}
${companyName}
${phone}
${website}`;
        break;

      default:
        return NextResponse.json(
          { error: "Invalid emailType" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      subject,
      message,
    });
  } catch (error) {
    console.error("Email template error:", error);

    return NextResponse.json(
      { error: "Failed to generate email template" },
      { status: 500 }
    );
  }
}