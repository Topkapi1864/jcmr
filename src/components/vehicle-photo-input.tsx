"use client";

import { useState } from "react";

const MAX = 1280;

/** Pick or take a photo; it is shrunk in the browser to a ~200 KB JPEG and sent with the form. */
export function VehiclePhotoInput({ current }: { current?: string | null }) {
  const [data, setData] = useState("");
  const [msg, setMsg] = useState("");

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMsg("Shrinking…");
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      let q = 0.82;
      let url = c.toDataURL("image/jpeg", q);
      while (url.length > 900_000 && q > 0.4) url = c.toDataURL("image/jpeg", (q -= 0.12));
      setData(url);
      setMsg(`Ready — ${Math.round((url.length * 0.75) / 1024)} KB. Save to keep it.`);
    } catch {
      setMsg("Couldn't read that image — try a JPEG or PNG.");
    }
  }

  return (
    <div className="stack-sm">
      {(data || current) && <img className="veh-photo-preview" src={data || current!} alt="" />}
      <label className="field">
        <span>{current ? "Replace the photo" : "Photo of the vehicle"}</span>
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <input type="hidden" name="photo" value={data} />
      {msg && <p className="xs muted" style={{ margin: 0 }}>{msg}</p>}
      {current && !data && (
        <label className="check-row small">
          <input type="checkbox" name="removePhoto" /> Remove the photo
        </label>
      )}
    </div>
  );
}
