"use client";

import { useRef, useState } from "react";

// Pick a picture from the phone (or take one); it is shrunk in the browser to a
// JPEG of at most 1600 px on the long side and sent with the form as a data URL.
const MAX = 1600;

export function MessagePhotoInput({ current }: { current?: string | null }) {
  const [data, setData] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMsg("Getting the picture ready…");
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      let q = 0.85;
      let url = c.toDataURL("image/jpeg", q);
      while (url.length > 1_400_000 && q > 0.4) url = c.toDataURL("image/jpeg", (q -= 0.1));
      setData(url);
      setMsg("");
    } catch {
      setData("");
      setMsg("Couldn't read that picture. Try a JPEG or PNG.");
    }
  }

  function clear() {
    setData("");
    setMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const preview = data || current;
  return (
    <div className="stack-sm">
      {preview && <img className="message-photo-preview" src={preview} alt="" />}
      <label className="field">
        <span>{current ? "Change the picture" : preview ? "The picture" : "Add a picture (optional)"}</span>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <input type="hidden" name="photo" value={data} />
      {msg && (
        <p className="xs muted" style={{ margin: 0 }}>
          {msg}
        </p>
      )}
      {data && (
        <div>
          <button type="button" className="btn btn-sm" onClick={clear}>
            {current ? "Keep the old picture" : "Take the picture off"}
          </button>
        </div>
      )}
      {current && !data && (
        <label className="check-row small">
          <input type="checkbox" name="removePhoto" /> Remove the picture
        </label>
      )}
    </div>
  );
}
