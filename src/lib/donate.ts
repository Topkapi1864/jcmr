import { getAllSettings, setSetting, JUSTGIVING_URL } from "./settings";
import { nowIso } from "./time";

// §4.5. JustGiving sends `x-frame-options: SAMEORIGIN` (checked 12 Oct 2026),
// so the page cannot be framed. We show a big button and a fetched total.
// The total is read from the page's embedded data, cached for an hour, and
// an admin-typed override wins when present.
//
// The page is also served by JustGiving's public GraphQL endpoint (the same
// one the page itself calls, no key needed, checked 26 Oct 2026). That gives
// every gift with its date, which draws the bridge on the Give page. It is
// cached for an hour alongside the total; if the endpoint ever changes shape
// the page simply falls back to the total alone.

export const JUSTGIVING_GRAPHQL = "https://graphql.justgiving.com";
export const JUSTGIVING_SLUG = "page/simon-gary-sarahchannon-3";
/** The day the JustGiving page opened (its startDate). The timeline begins here. */
export const PAGE_OPENED = "2026-09-29";

export type DonateTotal = {
  amount: number | null; // whole pounds
  target: number | null;
  count: number | null;
  fetchedAt: string | null;
  source: "override" | "fetched" | "cached" | "none";
};

export type Donation = {
  at: string; // ISO instant
  amount: number | null; // whole pounds; null when the donor hid the amount
  name: string;
  message: string;
};

export type DonationFeed = {
  donations: Donation[]; // oldest first
  fetchedAt: string | null;
  source: "fetched" | "cached" | "none";
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

type GqlDonation = {
  creationDate: string;
  amount: { value: number } | null; // pence
  displayName: string | null;
  message: string | null;
};

/** Every gift on the page, oldest first, via the public GraphQL endpoint. Null on any failure. */
export async function fetchJustGivingDonations(): Promise<Donation[] | null> {
  const query = `query($after: String) { page(type: ONE_PAGE, slug: "${JUSTGIVING_SLUG}") {
    donations(first: 50, after: $after) { pageInfo { hasNextPage endCursor }
      nodes { creationDate amount { value } displayName message } } } }`;
  const out: Donation[] = [];
  let after: string | null = null;
  try {
    for (let page = 0; page < 20; page++) {
      const res = await fetch(JUSTGIVING_GRAPHQL, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (JCMR site; donations fetch)" },
        body: JSON.stringify({ query, variables: { after } }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { page?: { donations?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlDonation[] } } } };
      const d = json.data?.page?.donations;
      if (!d) return null;
      for (const n of d.nodes) {
        out.push({
          at: n.creationDate,
          amount: n.amount ? Math.round(n.amount.value / 100) : null,
          name: (n.displayName || "Anonymous").trim(),
          message: (n.message || "").trim(),
        });
      }
      if (!d.pageInfo.hasNextPage || !d.pageInfo.endCursor) break;
      after = d.pageInfo.endCursor;
    }
  } catch {
    return null;
  }
  out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return out;
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

/** The gift list, cached for an hour. Never throws; an empty list means the feed is unavailable. */
export async function getDonations(): Promise<DonationFeed> {
  const s = await getAllSettings();
  const cachedAt = s["donate.donations_cached_at"];
  const cached = s["donate.donations_cached"] ? (JSON.parse(s["donate.donations_cached"]) as Donation[]) : null;
  const fresh = cachedAt && Date.now() - Date.parse(cachedAt) < 60 * 60_000;
  if (cached && fresh) return { donations: cached, fetchedAt: cachedAt, source: "cached" };

  const live = await fetchJustGivingDonations();
  if (live) {
    const at = nowIso();
    await setSetting("donate.donations_cached", JSON.stringify(live));
    await setSetting("donate.donations_cached_at", at);
    return { donations: live, fetchedAt: at, source: "fetched" };
  }
  if (cached) return { donations: cached, fetchedAt: cachedAt || null, source: "cached" };
  return { donations: [], fetchedAt: null, source: "none" };
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
