import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getHealthRecord } from "../../../../lib/services/health";
import { HealthRecordDetailView } from "../../health-record-detail-view";

export const metadata: Metadata = {
  title: "Health Record",
};

export const dynamic = "force-dynamic";

export default async function HealthRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const record = await getHealthRecord(id);
  if (!record) notFound();

  return <HealthRecordDetailView initial={record} />;
}
