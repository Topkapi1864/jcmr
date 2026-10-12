import { getAllSettings, setSetting, JUSTGIVING_URL } from "./settings";
import { nowIso } from "./time";

// §4.5. JustGiving sends `x-frame-options: SAMEORIGIN` (checked 12 Oct 2026),
// so the page cannot be framed. We show a big button and a fetched total.
// The total is read from the page's embedded data, cached for an hour, and
// an admin-typed override wins when present.

export type DonateTotal = {
  amount: number | null; // whole pounds
  target: number | null;
  count: number | null;
  fetchedAt: string | null;
  source: "override" | "fetched" | "cached" | "none";
};

export async function fetchJustGivingTotal(): Promise<{ amount: number; target: number | null; count: number | null } | null> {
  try {
    const res = await fetch(JUSTGIVING_URL, {
      headers: { "user-agent": "Mozilla/5.0 (JCMR site; total fetch)" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/donationSummary\\?":\{\\?"totalAmount\\?":(\d+(?:\.\d+)?)(?:,\\?"aggregatedDonationsCount\\?":(\d+))?/);
    if (!m) return null;
    const t = html.match(/\\?"targetAmount\\?":(\d+(?:\.\d+)?)/);
    return {
      amount: Math.round(parseFloat(m[1])),
      count: m[2] ? parseInt(m[2], 10) : null,
      target: t ? Math.round(parseFloat(t[1])) : null,
    };
  } catch {
    return null;
  }
}

export async function getDonateTotal(): Promise<DonateTotal> {
  const s = await getAllSettings();
  const override = s["donate.total_override"].replace(/[^\d.]/g, "");
  if (override) return { amount: Math.round(parseFloat(override)), target: null, count: null, fetchedAt: null, source: "override" };

  const cachedAt = s["donate.total_cached_at"];
  const cached = s["donate.total_cached"] ? (JSON.parse(s["donate.total_cached"]) as { amount: number; target: number | null; count: number | null }) : null;
  const fresh = cachedAt && Date.now() - Date.parse(cachedAt) < 60 * 60_000;
  if (cached && fresh) return { ...cached, fetchedAt: cachedAt, source: "cached" };

  const live = await fetchJustGivingTotal();
  if (live) {
    const at = nowIso();
    await setSetting("donate.total_cached", JSON.stringify(live));
    await setSetting("donate.total_cached_at", at);
    return { ...live, fetchedAt: at, source: "fetched" };
  }
  if (cached) return { ...cached, fetchedAt: cachedAt || null, source: "cached" };
  return { amount: null, target: null, count: null, fetchedAt: null, source: "none" };
}

export function fmtPounds(n: number | null): string {
  if (n === null) return "—";
  return "£" + n.toLocaleString("en-GB");
}

/** Does a URL permit framing? HEAD request, read the two headers. Cached per process for 10 minutes. */
const frameCache = new Map<string, { ok: boolean; at: number }>();
export async function frameable(url: string): Promise<boolean> {
  const hit = frameCache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ok;
  let ok = false;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 (JCMR site; frame check)" } });
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (res.headers.get("content-security-policy") || "").toLowerCase();
    const cspBlocks = /frame-ancestors\s+([^;]*)/.exec(csp);
    ok = !xfo && !(cspBlocks && !cspBlocks[1].includes("*"));
  } catch {
    ok = false;
  }
  frameCache.set(url, { ok, at: Date.now() });
  return ok;
}
