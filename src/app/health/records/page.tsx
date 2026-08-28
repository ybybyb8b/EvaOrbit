import type { Metadata } from "next";

import { listHealthRecords } from "../../../lib/services/health";
import { HealthRecordsView } from "../health-records-view";

export const metadata: Metadata = {
  title: "Health Records",
};

export const dynamic = "force-dynamic";

export default async function HealthRecordsPage() {
  const records = await listHealthRecords({ limit: 100 });

  return <HealthRecordsView initial={records} />;
}
