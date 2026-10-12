import { getSession } from "@/lib/auth";
import { itemsCsv, listItems } from "@/lib/items";
import { londonDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "admin") return new Response("Admins only.", { status: 403 });
  return new Response(itemsCsv(await listItems()), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="jcmr-board-${londonDate()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
