import { fullBackup } from "@/lib/backup";

// The nightly export: a scheduled job (GitHub Actions, see README) fetches this
// with the BACKUP_KEY and keeps the JSON. Also usable by hand.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = process.env.BACKUP_KEY;
  const given = new URL(req.url).searchParams.get("key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key || given !== key) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(await fullBackup()), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
