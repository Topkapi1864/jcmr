// In the browser: a picked picture shrunk to a JPEG data URL of at most `max` px
// on the long side, small enough to travel in a server action. HEIC from an
// iPhone is converted by the browser on the way in.
export async function shrinkImage(f: File, max = 1600, maxChars = 1_400_000): Promise<string> {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.85;
  let url = c.toDataURL("image/jpeg", q);
  while (url.length > maxChars && q > 0.4) url = c.toDataURL("image/jpeg", (q -= 0.1));
  return url;
}
