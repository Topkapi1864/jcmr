"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { captionPhotoAction, removePhotoAction } from "@/app/crew/stops/actions";

type Photo = { id: number; url: string; caption: string; addedBy: string; when: string };

/** The pictures on a stop: tap to open full size, caption and remove in place. */
export function SpotPhotos({ photos }: { photos: Photo[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [captions, setCaptions] = useState<Record<number, string>>(() => Object.fromEntries(photos.map((p) => [p.id, p.caption])));
  const [saved, setSaved] = useState<number | null>(null);

  if (!photos.length) return <p className="small muted">No pictures yet.</p>;
  return (
    <ul className="spot-photo-grid">
      {photos.map((p) => (
        <li key={p.id} className="spot-photo">
          <a href={p.url} target="_blank" rel="noopener">
            <img src={p.url} alt={p.caption} loading="lazy" />
          </a>
          <input
            type="text"
            value={captions[p.id] ?? ""}
            maxLength={200}
            placeholder="Caption"
            onChange={(e) => setCaptions((c) => ({ ...c, [p.id]: e.target.value }))}
            onBlur={async () => {
              if ((captions[p.id] ?? "") === p.caption) return;
              await captionPhotoAction(p.id, captions[p.id] ?? "");
              setSaved(p.id);
              start(() => router.refresh());
            }}
          />
          <span className="xs muted">
            {p.addedBy}, {p.when}
            {saved === p.id ? " · caption saved" : ""}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-quiet btn-danger"
            onClick={async () => {
              if (!confirm("Remove this picture?")) return;
              await removePhotoAction(p.id);
              start(() => router.refresh());
            }}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
