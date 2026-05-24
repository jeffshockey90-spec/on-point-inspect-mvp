import { redirect } from "next/navigation";

export default async function ReportSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;

  redirect(`/reports/${resolvedParams.id}`);
}