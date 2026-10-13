"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { PROVIDERS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { nowIso } from "@/lib/time";

function bump() {
  revalidatePath("/");
  revalidatePath("/live");
  revalidatePath("/live/tv");
  revalidatePath("/crew/live");
}

export async function postStatus(form: FormData) {
  const s = await requireCrew();
  const text = String(form.get("text") ?? "").trim().slice(0, 200);
  if (!text) return;
  await ready();
  const mileRaw = String(form.get("mile") ?? "").trim();
  const mile = mileRaw === "" ? null : Math.max(0, Number(mileRaw) || 0);
  await db.insert(schema.liveStatus).values({ text, place: String(form.get("place") ?? "").trim().slice(0, 80), mile, postedAt: nowIso(), postedBy: s.name });
  bump();
  redirect("/crew/live?posted=1");
}

export async function addTrackerLink(form: FormData) {
  const s = await requireCrew();
  const url = String(form.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("That isn't a link");
  const provider = String(form.get("provider") ?? "other") as (typeof PROVIDERS)[number];
  await ready();
  await db.insert(schema.trackerLinks).values({
    riderId: Number(form.get("riderId")) || null,
    provider: PROVIDERS.includes(provider) ? provider : "other",
    url,
    label: String(form.get("label") ?? "").trim(),
    active: true,
    createdBy: s.name,
    createdAt: nowIso(),
  });
  bump();
  redirect("/crew/live?posted=1");
}

export async function toggleTrackerLink(form: FormData) {
  await requireCrew();
  await ready();
  await db.update(schema.trackerLinks).set({ active: form.get("active") === "1" }).where(eq(schema.trackerLinks.id, Number(form.get("id"))));
  bump();
  redirect("/crew/live");
}
