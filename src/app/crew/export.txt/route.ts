import { getSession } from "@/lib/auth";
import { listItems, weeklySummary } from "@/lib/items";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
  const text = weeklySummary(await listItems());
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
