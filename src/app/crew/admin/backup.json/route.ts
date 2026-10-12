import { getSession } from "@/lib/auth";
import { fullBackup } from "@/lib/backup";
import { londonDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "admin") return new Response("Admins only.", { status: 403 });
  return new Response(JSON.stringify(await fullBackup(), null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="jcmr-backup-${londonDate()}.json"`,
      "cache-control": "no-store",
    },
  });
}
