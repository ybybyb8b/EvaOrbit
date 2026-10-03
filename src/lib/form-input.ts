export function uniqueInputValues(values: readonly string[]) {
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseInputTags(value: string) {
  return uniqueInputValues(value.split(/[,，\n]/));
}

export function matchInputValues(values: readonly string[], query: string) {
  const key = query.trim().toLocaleLowerCase();
  return uniqueInputValues(values).filter(value => value.toLocaleLowerCase().includes(key));
}
