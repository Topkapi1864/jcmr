import { seedAll } from "@/lib/seed-data";

// One-off: GET /api/seed?key=$BACKUP_KEY[&items=1] fills a fresh database on the
// host without needing the database token on a laptop. Idempotent.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = process.env.BACKUP_KEY;
  const url = new URL(req.url);
  const given = url.searchParams.get("key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key || given !== key) return new Response("Not found", { status: 404 });
  const lines = await seedAll(url.searchParams.get("items") === "1", () => {});
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
