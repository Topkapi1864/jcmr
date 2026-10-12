import { client, ready } from "@/db/client";

const TABLES = ["settings", "people", "riders", "content", "assets", "route_days", "route_stops", "tracker_links", "live_status", "items", "item_notes", "item_events", "links", "audit"];

/** Every table as JSON — the nightly export and the admin download are the same thing. */
export async function fullBackup(): Promise<Record<string, unknown[]>> {
  await ready();
  const out: Record<string, unknown[]> = { _exported_at: [new Date().toISOString()] };
  for (const t of TABLES) {
    const r = await client.execute(`SELECT * FROM ${t}`);
    out[t] = r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  }
  return out;
}
