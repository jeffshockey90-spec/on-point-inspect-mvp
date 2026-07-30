import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// Exact AcroForm field names from the real IRS Form W-9 (Rev. March 2024),
// confirmed by loading assets/forms/fw9-template.pdf with pdf-lib and
// listing every field, then cross-referencing each field's on-page
// position against the form's actual label text (also extracted from the
// PDF, not guessed) to know what each one means. See git history for the
// inspection scripts if this ever needs re-verifying against a future
// IRS revision.
const FIELDS = {
  name: "topmostSubform[0].Page1[0].f1_01[0]",
  businessName: "topmostSubform[0].Page1[0].f1_02[0]",
  individual: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]",
  cCorp: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[1]",
  sCorp: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]",
  partnership: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[3]",
  trust: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[4]",
  llc: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]",
  llcTaxClass: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]",
  other: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[6]",
  otherDescription: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]",
  line3b: "topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_2[0]",
  exemptPayeeCode: "topmostSubform[0].Page1[0].f1_05[0]",
  fatcaCode: "topmostSubform[0].Page1[0].f1_06[0]",
  address: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]",
  cityStateZip: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]",
  accountNumbers: "topmostSubform[0].Page1[0].f1_10[0]",
  ssn1: "topmostSubform[0].Page1[0].f1_11[0]",
  ssn2: "topmostSubform[0].Page1[0].f1_12[0]",
  ssn3: "topmostSubform[0].Page1[0].f1_13[0]",
  ein1: "topmostSubform[0].Page1[0].f1_14[0]",
  ein2: "topmostSubform[0].Page1[0].f1_15[0]",
} as const;

const CLASSIFICATIONS = [
  "individual",
  "c_corp",
  "s_corp",
  "partnership",
  "trust",
  "llc",
  "other",
] as const;

type Classification = (typeof CLASSIFICATIONS)[number];

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function digitsOnly(value: any) {
  return String(value ?? "").replace(/\D/g, "");
}

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

function safePathPart(value: any, fallback: string) {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || fallback;
}

export async function POST(req: Request) {
  try {
    const userClient = await createUserClient();

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: companyUser } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!companyUser?.company_id) {
      return NextResponse.json({ error: "No company found for this account." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const nameOnReturn = cleanText(body.name);
    const businessName = cleanText(body.businessName);
    const classification = cleanText(body.classification) as Classification;
    const llcTaxClass = cleanText(body.llcTaxClass).toUpperCase().slice(0, 1);
    const otherDescription = cleanText(body.otherDescription);
    const line3b = Boolean(body.line3b);
    const exemptPayeeCode = cleanText(body.exemptPayeeCode);
    const fatcaCode = cleanText(body.fatcaCode);
    const address = cleanText(body.address);
    const cityStateZip = cleanText(body.cityStateZip);
    const accountNumbers = cleanText(body.accountNumbers);
    const tinType = cleanText(body.tinType);
    const ssn = digitsOnly(body.ssn);
    const ein = digitsOnly(body.ein);
    const signatureName = cleanText(body.signatureName);
    const certifyAccuracy = Boolean(body.certifyAccuracy);

    const errors: string[] = [];

    if (!nameOnReturn) errors.push("Name is required.");
    if (!CLASSIFICATIONS.includes(classification)) errors.push("Federal tax classification is required.");
    if (classification === "llc" && !["C", "S", "P"].includes(llcTaxClass)) {
      errors.push("LLC tax classification must be C, S, or P.");
    }
    if (classification === "other" && !otherDescription) {
      errors.push("Please describe the entity type for \"Other\".");
    }
    if (!address) errors.push("Address is required.");
    if (!cityStateZip) errors.push("City, state, and ZIP are required.");

    if (tinType === "ssn") {
      if (ssn.length !== 9) errors.push("SSN must be 9 digits.");
    } else if (tinType === "ein") {
      if (ein.length !== 9) errors.push("EIN must be 9 digits.");
    } else {
      errors.push("Select whether you're providing an SSN or an EIN.");
    }

    if (!signatureName) errors.push("Type your full legal name to sign.");
    if (!certifyAccuracy) errors.push("You must certify the form is accurate to continue.");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    const templatePath = path.join(process.cwd(), "assets", "forms", "fw9-template.pdf");
    const templateBytes = fs.readFileSync(templatePath);

    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    form.getTextField(FIELDS.name).setText(nameOnReturn);
    if (businessName) form.getTextField(FIELDS.businessName).setText(businessName);

    const classificationFieldMap: Record<Classification, string> = {
      individual: FIELDS.individual,
      c_corp: FIELDS.cCorp,
      s_corp: FIELDS.sCorp,
      partnership: FIELDS.partnership,
      trust: FIELDS.trust,
      llc: FIELDS.llc,
      other: FIELDS.other,
    };

    form.getCheckBox(classificationFieldMap[classification]).check();

    if (classification === "llc") {
      form.getTextField(FIELDS.llcTaxClass).setText(llcTaxClass);
    }

    if (classification === "other") {
      form.getTextField(FIELDS.otherDescription).setText(otherDescription);
    }

    if (line3b) form.getCheckBox(FIELDS.line3b).check();
    if (exemptPayeeCode) form.getTextField(FIELDS.exemptPayeeCode).setText(exemptPayeeCode);
    if (fatcaCode) form.getTextField(FIELDS.fatcaCode).setText(fatcaCode);

    form.getTextField(FIELDS.address).setText(address);
    form.getTextField(FIELDS.cityStateZip).setText(cityStateZip);
    if (accountNumbers) form.getTextField(FIELDS.accountNumbers).setText(accountNumbers);

    if (tinType === "ssn") {
      form.getTextField(FIELDS.ssn1).setText(ssn.slice(0, 3));
      form.getTextField(FIELDS.ssn2).setText(ssn.slice(3, 5));
      form.getTextField(FIELDS.ssn3).setText(ssn.slice(5, 9));
    } else {
      form.getTextField(FIELDS.ein1).setText(ein.slice(0, 2));
      form.getTextField(FIELDS.ein2).setText(ein.slice(2, 9));
    }

    // The IRS W-9's AcroForm has no fillable signature/date fields (it's
    // meant to be signed by hand) - drawn directly on the page instead, at
    // the "Signature of U.S. person" / "Date" line positions confirmed by
    // extracting that page's actual text coordinates with pdfjs-dist.
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const page = pdfDoc.getPage(0);
    const today = new Date();
    const dateText = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    page.drawText(signatureName, {
      x: 150,
      y: 196,
      size: 11,
      font,
      color: rgb(0.05, 0.05, 0.15),
    });

    page.drawText(dateText, {
      x: 425,
      y: 196,
      size: 10,
      font,
      color: rgb(0.05, 0.05, 0.15),
    });

    form.flatten();

    const filledBytes = await pdfDoc.save();

    const cleanCompanyId = safePathPart(companyUser.company_id, "company");
    const filePath = `${cleanCompanyId}/documents/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.pdf`;

    const { error: uploadError } = await admin.storage
      .from("company-documents")
      .upload(filePath, Buffer.from(filledBytes), {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || "Could not save the generated W9." },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    const { error: updateError } = await admin
      .from("companies")
      .update({ w9_document_url: filePath, w9_document_uploaded_at: now })
      .eq("id", companyUser.company_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await admin.from("w9_documents").insert({
      company_id: companyUser.company_id,
      storage_path: filePath,
      uploaded_by: user.id,
    });

    const { data: signedUrlData } = await admin.storage
      .from("company-documents")
      .createSignedUrl(filePath, 300);

    return NextResponse.json({
      success: true,
      path: filePath,
      uploadedAt: now,
      viewUrl: signedUrlData?.signedUrl || null,
    });
  } catch (error: any) {
    console.error("Fill W9 error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to generate W9." },
      { status: 500 }
    );
  }
}
