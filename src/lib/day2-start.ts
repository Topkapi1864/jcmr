import "server-only";
import { client, ready } from "@/db/client";
import { nowIso } from "./time";

// Sunday 15 November 2026, on Gary's word that morning (06:24): Day 2 leaves The Link
// Hotel at 07:30, not 07:00.
//
// The start time is the crew's own: it is in the saved plan (settings "route.plan"), and
// the times saved with that plan sit on the Day 2 route_stops rows (the Live page reads
// those). This moves both by 30 minutes, once, the first time the site runs with this
// file. After that the plan is the crew's again: Crew → Route can set any start, and this
// never runs a second time (the mark below).
//
// It only moves a Day 2 that still starts at 07:00. A plan the crew has already moved
// is left as they saved it. Everything is written in one transaction, and every write
// looks for the mark first, so two requests at once cannot move the day twice.

const MARK = "route.day2_start_0730";
const FROM = "07:00";
const TO = "07:30";
const SHIFT_MIN = 30;

let settled = false;

const HM = /^(\d{2}):(\d{2})$/;

/** "10:19" → "10:49". Anything that is not HH:MM comes back null. */
export function shiftHm(hm: string, byMin: number): string | null {
  const m = HM.exec(hm);
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]) + byMin;
  if (t < 0 || t >= 24 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export async function applyDay2Start(): Promise<void> {
  if (settled) return;
  try {
    await ready();
    const done = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [MARK] });
    if (done.rows.length) {
      settled = true;
      return;
    }
    const at = nowIso();
    const unmarked = "NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)";
    const stmts: { sql: string; args: (string | number)[] }[] = [];

    // The saved plan, if there is one. With none, the plan is the default, which now says 07:30.
    const planRow = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'route.plan'", args: [] });
    const raw = planRow.rows.length ? String(planRow.rows[0].value ?? "") : "";
    let was: string = FROM;
    let hadPlan = false;
    if (raw) {
      const j = JSON.parse(raw) as { plan?: { days?: Record<string, { start?: string }> }; savedBy?: string; savedAt?: string };
      const d2 = j.plan?.days?.["2"];
      if (d2 && typeof d2.start === "string") {
        hadPlan = true;
        was = d2.start;
        if (was === FROM) {
          d2.start = TO;
          // A new savedAt, so a crew phone holding an older unsaved draft opens on this plan and not on its draft.
          const next = JSON.stringify({ ...j, savedBy: `${j.savedBy ?? "the crew"}; Day 2 start moved to ${TO} on Gary's word`, savedAt: at });
          stmts.push({ sql: `UPDATE settings SET value = ? WHERE key = 'route.plan' AND value = ? AND ${unmarked}`, args: [next, raw, MARK] });
        }
      }
    }

    let moved = 0;
    if (was === FROM) {
      const rows = await client.execute({
        sql: "SELECT s.id AS id, s.planned_time AS t FROM route_stops s JOIN route_days d ON d.id = s.day_id WHERE d.day = 2 AND s.planned_time IS NOT NULL",
        args: [],
      });
      for (const r of rows.rows) {
        const old = String(r.t ?? "");
        const to = shiftHm(old, SHIFT_MIN);
        if (!to) continue;
        stmts.push({ sql: `UPDATE route_stops SET planned_time = ? WHERE id = ? AND planned_time = ? AND ${unmarked}`, args: [to, Number(r.id), old, MARK] });
        moved++;
      }
    }

    const said =
      was === FROM
        ? `Day 2 start ${FROM} → ${TO} on Gary's word of 15 Nov: ${hadPlan ? "the saved plan" : "the default plan (none saved)"}, and ${moved} Day 2 planned time${moved === 1 ? "" : "s"} moved ${SHIFT_MIN} minutes`
        : `Day 2 start left at ${was} as the crew saved it (the move to ${TO} on Gary's word of 15 Nov was for a ${FROM} start)`;
    stmts.push({ sql: `INSERT INTO audit (actor, at, action) SELECT ?, ?, ? WHERE ${unmarked}`, args: ["route", at, said, MARK] });
    stmts.push({ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING", args: [MARK, at] });
    await client.batch(stmts, "write");
    settled = true;
  } catch (e) {
    // Never take a page down over this; the next request tries again.
    console.error("day 2 start move failed", e);
  }
}
