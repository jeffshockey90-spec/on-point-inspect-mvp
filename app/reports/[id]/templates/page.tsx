import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";

import AITemplateGenerator from "./AITemplateGenerator";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

export default async function FindingTemplatesPage({
  params,
}: PageProps) {
  const { id } = await params;

  const supabase =
    await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection } =
    await supabase
      .from("inspections")
      .select("*")
      .eq("id", id)
      .eq("inspector_id", user.id)
      .single();

  if (!inspection) redirect("/reports");

  const { data: templates } =
    await supabase
      .from("finding_templates")
      .select("*")
      .eq("inspector_id", user.id)
      .order("created_at", {
        ascending: false,
      });

  async function createTemplate(
    formData: FormData
  ) {
    "use server";

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(
      formData.get("inspection_id") || ""
    );

    await supabase
      .from("finding_templates")
      .insert({
        inspector_id: user.id,

        title: String(
          formData.get("title") || ""
        ),

        section: String(
          formData.get("section") ||
            "Inspection Details"
        ),

        severity: String(
          formData.get("severity") ||
            "Recommended Repair"
        ),

        observation: String(
          formData.get("observation") || ""
        ),

        implication: String(
          formData.get("implication") || ""
        ),

        recommendation: String(
          formData.get("recommendation") ||
            ""
        ),
      });

    revalidatePath(
      `/reports/${inspectionId}/templates`
    );
  }

  async function insertTemplate(
    formData: FormData
  ) {
    "use server";

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(
      formData.get("inspection_id") || ""
    );

    const templateId = String(
      formData.get("template_id") || ""
    );

    const { data: template } =
      await supabase
        .from("finding_templates")
        .select("*")
        .eq("id", templateId)
        .eq("inspector_id", user.id)
        .single();

    if (!template) return;

    await supabase
      .from("findings")
      .insert({
        inspection_id: inspectionId,

        title:
          template.title ||
          "Untitled Finding",

        section:
          template.section ||
          "Inspection Details",

        severity:
          template.severity ||
          "Recommended Repair",

        observation:
          template.observation || "",

        implication:
          template.implication || "",

        recommendation:
          template.recommendation || "",
      });

    revalidatePath(
      `/reports/${inspectionId}`
    );

    redirect(`/reports/${inspectionId}`);
  }

  async function deleteTemplate(
    formData: FormData
  ) {
    "use server";

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(
      formData.get("inspection_id") || ""
    );

    const templateId = String(
      formData.get("template_id") || ""
    );

    await supabase
      .from("finding_templates")
      .delete()
      .eq("id", templateId)
      .eq("inspector_id", user.id);

    revalidatePath(
      `/reports/${inspectionId}/templates`
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-teal-400">
              Favorite Findings / Templates
            </h1>

            <p className="mt-2 text-slate-400">
              Type a quick note, let AI
              expand it, save reusable
              findings, and insert them
              directly into reports.
            </p>
          </div>

          <Link
            href={`/reports/${inspection.id}`}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
          >
            Back to Report
          </Link>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6">
          <h2 className="mb-5 text-2xl font-black text-teal-300">
            Create New Template
          </h2>

          <form
            action={createTemplate}
            className="space-y-4"
          >
            <input
              type="hidden"
              name="inspection_id"
              value={inspection.id}
            />

            <AITemplateGenerator />

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-400">
                Title
              </label>

              <input
                name="title"
                required
                placeholder="Example: Missing GFCI Protection"
                className="w-full rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <select
                name="section"
                className="rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
              >
                <option>
                  Exterior
                </option>

                <option>
                  Roof
                </option>

                <option>
                  Basement,
                  Foundation,
                  Crawlspace &
                  Structure
                </option>

                <option>
                  Heating
                </option>

                <option>
                  Cooling
                </option>

                <option>
                  Plumbing
                </option>

                <option>
                  Electrical
                </option>

                <option>
                  Attic,
                  Insulation &
                  Ventilation
                </option>

                <option>
                  Doors,
                  Windows &
                  Interior
                </option>

                <option>
                  Built-in
                  Appliances
                </option>

                <option>
                  Garage
                </option>
              </select>

              <select
                name="severity"
                className="rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
              >
                <option>
                  Safety / Major
                  Concern
                </option>

                <option>
                  Recommended
                  Repair
                </option>

                <option>
                  Maintenance /
                  Monitor
                </option>

                <option>
                  Informational
                </option>
              </select>
            </div>

            <textarea
              name="observation"
              placeholder="Observation"
              rows={5}
              className="w-full rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
            />

            <textarea
              name="implication"
              placeholder="Implication"
              rows={5}
              className="w-full rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
            />

            <textarea
              name="recommendation"
              placeholder="Recommendation"
              rows={5}
              className="w-full rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-xl bg-teal-500 px-6 py-3 font-black text-slate-950 hover:bg-teal-400"
              >
                Save Template
              </button>

              <Link
                href={`/reports/${inspection.id}`}
                className="rounded-xl border border-slate-600 px-6 py-3 font-bold text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black text-teal-300">
            Saved Templates
          </h2>

          {(templates || []).length ===
            0 && (
            <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-6 text-slate-400">
              No saved templates yet.
            </div>
          )}

          {(templates || []).map(
            (template: any) => (
              <div
                key={template.id}
                className="rounded-2xl border border-slate-700 bg-[#0f172a] p-6"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase text-slate-400">
                      {
                        template.section
                      }
                    </p>

                    <h3 className="mt-1 text-2xl font-black text-white">
                      {template.title}
                    </h3>

                    <p className="mt-2 inline-block rounded-full bg-teal-700 px-3 py-1 text-sm font-bold text-white">
                      {
                        template.severity
                      }
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form
                      action={
                        insertTemplate
                      }
                    >
                      <input
                        type="hidden"
                        name="inspection_id"
                        value={
                          inspection.id
                        }
                      />

                      <input
                        type="hidden"
                        name="template_id"
                        value={
                          template.id
                        }
                      />

                      <button
                        type="submit"
                        className="rounded-xl bg-green-500 px-5 py-3 font-black text-slate-950 hover:bg-green-400"
                      >
                        Insert Into
                        Report
                      </button>
                    </form>

                    <form
                      action={
                        deleteTemplate
                      }
                    >
                      <input
                        type="hidden"
                        name="inspection_id"
                        value={
                          inspection.id
                        }
                      />

                      <input
                        type="hidden"
                        name="template_id"
                        value={
                          template.id
                        }
                      />

                      <button
                        type="submit"
                        className="rounded-xl border border-red-500 px-5 py-3 font-bold text-red-300 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                {template.observation && (
                  <TextBlock
                    title="Observation"
                    value={
                      template.observation
                    }
                  />
                )}

                {template.implication && (
                  <TextBlock
                    title="Implication"
                    value={
                      template.implication
                    }
                  />
                )}

                {template.recommendation && (
                  <TextBlock
                    title="Recommendation"
                    value={
                      template.recommendation
                    }
                  />
                )}
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}

function TextBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="mb-4">
      <h4 className="mb-1 font-black text-teal-300">
        {title}
      </h4>

      <p className="whitespace-pre-wrap leading-7 text-slate-300">
        {value}
      </p>
    </div>
  );
}