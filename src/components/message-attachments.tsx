"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { BoardVideo } from "@/lib/video-rules";
import { MessagePhotoInput } from "./message-photo-input";
import { MessageVideoInput } from "./message-video-input";

// What goes with the words of a board message, and the button that posts it:
// the picture picker, the video picker and the submit button together, so the
// button can wait while a video is still being made ready or sent. It sits
// inside the message form (Crew → Messages, and a message's own page).

export function MessageAttachments({ currentPhoto, currentVideo, hint, submit, submitting }: { currentPhoto?: string | null; currentVideo?: BoardVideo | null; hint?: ReactNode; submit: string; submitting: string }) {
  const [videoBusy, setVideoBusy] = useState(false);
  return (
    <>
      <MessagePhotoInput current={currentPhoto} />
      <MessageVideoInput current={currentVideo} onBusy={setVideoBusy} />
      {hint && (
        <p className="xs muted" style={{ margin: 0 }}>
          {hint}
        </p>
      )}
      <SubmitButton label={submit} sending={submitting} waiting={videoBusy} />
    </>
  );
}

function SubmitButton({ label, sending, waiting }: { label: string; sending: string; waiting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" style={{ width: "100%" }} disabled={waiting || pending}>
      {pending ? sending : waiting ? "Waiting for the video…" : label}
    </button>
  );
}
