"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { journal, requireCrew } from "@/lib/auth";
import { getMessage, messageSummary, pinMessage, postMessage, removeMessage, updateMessage, type MessageLite } from "@/lib/messages";
import { fmtVideoLength, fmtVideoSize } from "@/lib/video-rules";

// Posting goes straight to the public site, so the pages that show the board
// are revalidated and every change is journaled.
function bump() {
  revalidatePath("/");
  revalidatePath("/live");
  revalidatePath("/crew/messages", "layout");
}

/** For the journal: what a message carries besides its words, and what stands for it when it has none. */
function carries(m: MessageLite | undefined) {
  const video = m?.video ? `a video (${fmtVideoLength(m.video.seconds)}, ${fmtVideoSize(m.video.bytes)})` : "";
  const what = [m?.hasPhoto ? "a picture" : "", video].filter(Boolean).join(" and ");
  return { withWhat: what ? ` with ${what}` : "", wordless: m?.video ? (m.hasPhoto ? "(a picture and a video)" : "(a video)") : "(a picture)" };
}

export async function postMessageAction(form: FormData) {
  const s = await requireCrew();
  let id: number | null;
  try {
    id = await postMessage(s, String(form.get("body") ?? ""), String(form.get("photo") ?? ""), String(form.get("video") ?? ""));
  } catch (e) {
    redirect(`/crew/messages?${String(e).includes("bad video") ? "badvideo" : "badphoto"}=1`);
  }
  if (id === null) redirect("/crew/messages?empty=1");
  const m = await getMessage(id);
  const c = carries(m);
  await journal(s.name, `messages: posted #${id}${c.withWhat} "${messageSummary(m?.body ?? "", 60, c.wordless)}"`);
  bump();
  redirect("/crew/messages?posted=1");
}

export async function updateMessageAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const newPhoto = String(form.get("photo") ?? "");
  const photo = form.get("removePhoto") === "on" ? null : newPhoto ? newPhoto : undefined;
  // A newly sent video replaces the one there; the tick box takes it off; otherwise it is left as it is.
  const newVideo = String(form.get("video") ?? "");
  const video = newVideo ? newVideo : form.get("removeVideo") === "on" ? null : undefined;
  let r: Awaited<ReturnType<typeof updateMessage>>;
  try {
    r = await updateMessage(s, id, String(form.get("body") ?? ""), photo, video);
  } catch {
    redirect(`/crew/messages/${id}?badphoto=1`);
  }
  if (r === "denied") redirect(`/crew/messages/${id}?denied=1`);
  if (r === "empty") redirect(`/crew/messages/${id}?empty=1`);
  if (r === "bad-video") redirect(`/crew/messages/${id}?badvideo=1`);
  await journal(s.name, `messages: edited #${id}${photo === null ? " (picture removed)" : photo ? " (new picture)" : ""}${video === null ? " (video removed)" : video ? " (new video)" : ""}`);
  bump();
  redirect("/crew/messages?saved=1");
}

export async function removeMessageAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const m = await getMessage(id);
  const ok = await removeMessage(s, id);
  if (!ok) redirect(`/crew/messages/${id}?denied=1`);
  await journal(s.name, `messages: removed #${id} "${messageSummary(m?.body ?? "", 60, carries(m).wordless)}"${m?.video ? " (its video deleted)" : ""}`);
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
