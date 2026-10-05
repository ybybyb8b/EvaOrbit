/** Expected RPC refusals are actionable sync conflicts, not server failures. */
export function eventKitRpcConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P0001" || !("message" in error)) return null;
  switch (error.message) {
    case "Invalid EventKit logical link":
    case "Linked EO record is missing; manual resolution required":
      return { code: "eventkit_eo_missing", error: "EO 原记录已不存在或关联已失效；旧关联已保留，请先核查原记录。" };
    case "Ambiguous EventKit identity":
      return { code: "eventkit_identity_conflict", error: "Apple 对象存在多个可能关联；已暂停该对象，请核查关联。" };
    case "Reminder creation in progress; retry later":
      return { code: "eventkit_creation_pending", error: "Reminder 镜像正在创建，请稍后重试同步。" };
    default: return null;
  }
}
