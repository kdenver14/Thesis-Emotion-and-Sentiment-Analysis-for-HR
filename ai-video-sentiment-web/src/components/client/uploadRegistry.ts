// Uploads run in the browser tab and keep going during in-app navigation.
// The session page's Cancel uses this to stop one that is still sending, so
// no video lands in storage after its session was deleted.
const active = new Map<string, AbortController>();

export function trackUpload(sessionId: string, controller: AbortController): void {
  active.set(sessionId, controller);
}

export function untrackUpload(sessionId: string): void {
  active.delete(sessionId);
}

export function abortUpload(sessionId: string): void {
  active.get(sessionId)?.abort();
  active.delete(sessionId);
}
