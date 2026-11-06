// Minimum latency for enumeration-sensitive responses: the "account exists"
// path does a Redis write plus a Resend call, so the "unknown" path waits too.
export const RESPONSE_FLOOR_MS = Number(process.env.AUTH_RESPONSE_FLOOR_MS ?? 1000)

export async function padTo(startedAt, floorMs) {
  const wait = floorMs - (Date.now() - startedAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}
