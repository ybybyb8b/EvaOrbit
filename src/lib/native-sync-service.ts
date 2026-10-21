import "server-only";

import { createSupabaseServerClient } from "./supabase/server";
import { HttpError } from "./errors";
import { parseNewTracker, parseTrackerPatch, parseNewTrackerField, parseNewTrackerEntry, parseTrackerEntryPatch, ValidationError } from "./validation";
import { trackerFromRow, trackerFieldFromRow, trackerEntryFromRow } from "./tracker-rows";
import { validatedTrackerValues } from "./tracker-values";
import type { TrackerMutation, TrackerSyncRequest, TrackerSyncResponse } from "./tracker-local-contract";

export async function synchronizeNativeTrackers(userId: string, request: TrackerSyncRequest): Promise<TrackerSyncResponse> {
  if (request.accountId !== userId) throw new HttpError("同步账户与当前登录账户不同，请重新登录", 409);
  const client = await createSupabaseServerClient();
  const operations = [];
  for (const mutation of request.mutations) {
    let input: Record<string, unknown> = {};
    let validationError: string | undefined;
    try {
      if (mutation.operation !== "delete") {
        if (mutation.resourceType === "tracker") {
          if (mutation.payload.archived !== undefined || mutation.payload.statsConfig !== undefined) throw new ValidationError("PoC 请在 Web 管理归档与统计设置");
          input = mutation.operation === "create" ? parseNewTracker(mutation.payload) : parseTrackerPatch(mutation.payload);
        } else {
          const trackerId = mutation.payload.trackerId;
          const { data: parent, error } = await client.from("trackers").select("*,tracker_fields(*)").eq("id", trackerId).maybeSingle();
          if (error) throw error;
          if (!parent) throw new ValidationError("所属 Tracker 已删除");
          if (mutation.resourceType === "tracker_field") {
            input = parseNewTrackerField(mutation.payload);
            if (mutation.operation !== "create" || !["number", "text"].includes(String(input.type))) throw new ValidationError("PoC 仅支持新增数值或文本属性，其他配置请在 Web 管理");
          } else {
            input = mutation.operation === "create" ? parseNewTrackerEntry(mutation.payload) : parseTrackerEntryPatch(mutation.payload);
            if (input.values !== undefined) input.values = validatedTrackerValues(parent.tracker_fields.map(trackerFieldFromRow), input.values as Record<string, unknown>, parent.quick_capture_enabled, mutation.operation === "update");
          }
        }
      }
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      validationError = error.message;
    }
    // Fingerprint the original request, not time-dependent normalization.
    // A receipt takes precedence over a later validation/schema failure.
    operations.push({ request: mutation satisfies TrackerMutation, input, validationError });
  }
  const { data, error } = await client.rpc("tracker_sync_v2", { p_account: userId, p_operations: operations });
  if (error) throw new HttpError(error.code === "PGRST202" ? "Tracker 同步迁移尚未应用，已保留本地数据" : "Tracker 同步暂时失败，已保留本地数据", 503);
  const response = data as TrackerSyncResponse;
  if (response.protocolVersion !== 2 || response.accountId !== userId || response.snapshot?.complete !== true) throw new HttpError("同步响应不完整，已保留本地数据", 502);
  const mappers = { tracker: trackerFromRow, tracker_field: trackerFieldFromRow, tracker_entry: trackerEntryFromRow };
  return { ...response, snapshot: { ...response.snapshot, records: response.snapshot.records.map(record => ({ ...record, payload: { ...mappers[record.resourceType](record.payload) } })) } };
}
