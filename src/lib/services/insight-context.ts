import "server-only";
import { buildInsightContext, insightPeriod } from "../insight-context";
import { getRepository, withInsightsReadOnlyRepository } from "../repositories";

export async function getInsightContext(id: string = "yesterday", now = new Date()) {
  const period = insightPeriod(id, now);
  return withInsightsReadOnlyRepository(async () => {
    const repository=await getRepository();
    const reports=await repository.listInsightReports({periodType:"daily",before:period.date});
    return buildInsightContext(repository,period,now.toISOString(),reports.filter(report=>report.currentVersion>report.hiddenThroughVersion).map(report=>({id:report.id,periodStart:report.periodStart,currentVersion:report.currentVersion})));
  });
}
