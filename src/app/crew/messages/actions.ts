"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { journal, requireCrew } from "@/lib/auth";
import { getMessage, messageSummary, pinMessage, postMessage, removeMessage, updateMessage } from "@/lib/messages";

// Posting goes straight to the public site, so the pages that show the board
// are revalidated and every change is journaled.
function bump() {
  revalidatePath("/");
  revalidatePath("/live");
  revalidatePath("/crew/messages", "layout");
}

export async function postMessageAction(form: FormData) {
  const s = await requireCrew();
  const id = await postMessage(s, String(form.get("body") ?? ""));
  if (id === null) redirect("/crew/messages?empty=1");
  const m = await getMessage(id);
  await journal(s.name, `messages: posted #${id} "${messageSummary(m?.body ?? "")}"`);
  bump();
  redirect("/crew/messages?posted=1");
}

export async function updateMessageAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const ok = await updateMessage(s, id, String(form.get("body") ?? ""));
  if (!ok) redirect(`/crew/messages/${id}?denied=1`);
  await journal(s.name, `messages: edited #${id}`);
  bump();
  redirect("/crew/messages?saved=1");
}

export async function removeMessageAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const m = await getMessage(id);
  const ok = await removeMessage(s, id);
  if (!ok) redirect(`/crew/messages/${id}?denied=1`);
  await journal(s.name, `messages: removed #${id} "${messageSummary(m?.body ?? "")}"`);
  bump();
  redirect("/crew/messages?removed=1");
}

export async function pinMessageAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const pinned = form.get("pinned") === "1";
  const ok = await pinMessage(s, id, pinned);
  if (!ok) redirect(`/crew/messages/${id}?denied=1`);
  await journal(s.name, `messages: ${pinned ? "pinned" : "unpinned"} #${id}`);
  bump();
  redirect(`/crew/messages?${pinned ? "pinned" : "unpinned"}=1`);
}
