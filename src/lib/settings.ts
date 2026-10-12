import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";

export const SETTING_KEYS = [
  "site.public_live",
  "site.strapline",
  "route.start_label",
  "tracker.mode",
  "tracker.primary_rider",
  "donate.total_override",
  "donate.total_cached",
  "donate.total_cached_at",
  "donate.embed_verdict",
  "read_door.token_hash",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  "site.public_live": "false",
  "site.strapline": "Four of us, 240 miles, from where she died to where she rests.",
  "route.start_label": "Barnes, London",
  "tracker.mode": "single",
  "tracker.primary_rider": "",
  "donate.total_override": "",
  "donate.total_cached": "",
  "donate.total_cached_at": "",
  "donate.embed_verdict": "",
  "read_door.token_hash": "",
};

export async function getSetting(key: SettingKey): Promise<string> {
  await ready();
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  await ready();
  const rows = await db.select().from(schema.settings).all();
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value ?? "";
  return out;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await ready();
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/** The dark switch. The environment variable wins when set. */
export async function isPublicLive(): Promise<boolean> {
  const env = process.env.PUBLIC_LIVE;
  if (env === "true") return true;
  if (env === "false") return false;
  return (await getSetting("site.public_live")) === "true";
}

export { JUSTGIVING_URL } from "./constants";
