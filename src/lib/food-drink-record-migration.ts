/** One-time normalization for database upgrades and older backup imports. */
export function migrateFoodDrinkRecord(table: string, source: Record<string, unknown>) {
  const row = { ...source };
  const value = (key: string) => typeof row[key] === "string" ? (row[key] as string).trim() : "";
  if (table === "food_logs") {
    const description = value("description"), portion = value("portion"), notes = value("notes");
    if ("description" in row || "portion" in row || "notes" in row) row.description = [description, portion && portion !== description ? `份量说明：${portion}` : "", notes && notes !== description && notes !== portion ? notes : ""].filter(Boolean).join("\n\n");
    delete row.portion; delete row.notes; delete row.calendar_time_enabled;
  }
  if (table === "drink_logs") {
    const notes = value("notes"), brand = value("brand");
    if ("notes" in row || "brand" in row || "volume_ml" in row || "caffeine_mg" in row) row.notes = [notes, brand ? `品牌：${brand}` : "", row.volume_ml != null ? `原记录容量：${row.volume_ml} ml` : "", row.caffeine_mg != null ? `原记录咖啡因：${row.caffeine_mg} mg` : ""].filter(Boolean).join("\n\n");
    delete row.brand; delete row.volume_ml; delete row.caffeine_mg;
  }
  return row;
}
