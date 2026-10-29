import "server-only";
import { buildInsightContext, insightPeriod } from "../insight-context";
import { getRepository, withInsightsReadOnlyRepository } from "../repositories";

export async function getInsightContext(id: string = "yesterday", now = new Date()) {
  const period = insightPeriod(id, now);
  return withInsightsReadOnlyRepository(async () => {
    const repository=await getRepository();
    return buildInsightContext(repository,period,now.toISOString());
  });
}
