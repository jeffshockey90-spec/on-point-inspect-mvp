import Link from "next/link";
import PublicSharePage from "../../share/[id]/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DemoReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;

  return (
    <div className="bg-[var(--fl-ground)] text-[var(--fl-text)]">
      <div className="print:hidden border-b border-fuchsia-500/30 bg-fuchsia-950/20 px-4 py-3 text-center text-sm font-bold text-fuchsia-200">
        <span>Demo Report Preview</span>
        <span className="mx-2 text-fuchsia-400">•</span>
        <Link href="/" className="text-[#14c8d2] underline underline-offset-4 hover:text-[var(--fl-text)]">
          FLOW
        </Link>
      </div>

      <PublicSharePage
        params={Promise.resolve({ id: resolvedParams.id })}
        searchParams={Promise.resolve({ role: "demo", email: "", defect_filter: "all" })}
      />
    </div>
  );
}
