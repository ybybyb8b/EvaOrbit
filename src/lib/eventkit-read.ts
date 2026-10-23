export class EventKitReadTimeout extends Error {
  constructor(label: string) {
    super(`Timed out waiting for ${label}. Sync stopped; completed changes were kept. No write was retried.`);
    this.name = "EventKitReadTimeout";
  }
}

// Only wrap reads (or completion notifications), never an Apple/EO write.
// A late read result settles this promise only; it cannot resume reconciliation.
export function eventKitRead<T>(read: Promise<T>, label: string, timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new EventKitReadTimeout(label)), timeoutMs);
    read.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
