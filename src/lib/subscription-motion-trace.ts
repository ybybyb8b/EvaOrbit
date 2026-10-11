type Frame = [raf: number, callback: number, left: number, painted: boolean, paintMs: number, touching: boolean];
type Trace = { node: HTMLElement; frames: Frame[]; events: [time: number, type: string, left: number][]; started: number; truncated: boolean };
let active: Trace | null = null;
export function subscriptionMotionTrace(node: HTMLElement) { return active?.node === node ? active : null; }
export function recordSubscriptionFrame(trace: Trace, raf: number, callback: number, left: number, painted: boolean, paintMs: number, touching: boolean) {
  if (trace.frames.length >= 20000) { trace.truncated = true; return; }
  trace.frames.push([raf - trace.started, callback - trace.started, left, painted, paintMs, touching]);
}
export function startSubscriptionMotionTrace(node: HTMLElement) {
  const trace: Trace = { node, frames: [], events: [], started: performance.now(), truncated: false };
  active = trace;
  const types = ["touchstart", "touchend", "touchcancel", "scroll", "scrollend"];
  const event = (event: Event) => {
    if (trace.events.length < 20000) trace.events.push([performance.now() - trace.started, event.type, node.scrollLeft]);
    else trace.truncated = true;
  };
  for (const type of types) node.addEventListener(type, event, { passive: true });
  return () => {
    if (active === trace) active = null;
    for (const type of types) node.removeEventListener(type, event);
    // No subscription names, amounts or image URLs are captured.
    return {
      version: "C-diagnostics-1", durationMs: performance.now() - trace.started,
      frameColumns: ["rafTimeMs", "callbackTimeMs", "scrollLeft", "painted", "paintDurationMs", "touching"],
      eventColumns: ["timeMs", "type", "scrollLeft"],
      frames: trace.frames, events: trace.events, truncated: trace.truncated,
    };
  };
}
