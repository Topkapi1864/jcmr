import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { KIT_CATEGORIES, KIT_CATEGORY_LABELS, KIT_STORAGE, KIT_STORAGE_LABELS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { canEditRider, catalogue, itemsForRider, ridersWithPeople } from "@/lib/kit";
import { KitSheet } from "@/components/kit-sheet";

export const dynamic = "force-dynamic";

export default async function RiderKitPage({ params }: { params: Promise<{ riderId: string }> }) {
  const s = await requireCrew();
  const { riderId } = await params;
  await ready();
  const rider = await db.select().from(schema.riders).where(eq(schema.riders.id, Number(riderId))).get();
  if (!rider) notFound();
  const editable = canEditRider(s, rider);
  const items = await itemsForRider(rider.id);
  const cat = await catalogue();
  const onList = new Set(items.map((i) => i.name.toLowerCase()));
  const notYet = cat.filter((x) => !onList.has(x.name.toLowerCase())).length;
  const riders = await ridersWithPeople();
  const mine = rider.personId === s.pid;

  const labels = {
    categories: KIT_CATEGORIES.map((k) => ({ value: k, label: KIT_CATEGORY_LABELS[k] })),
    storage: KIT_STORAGE.map((k) => ({ value: k, label: k ? KIT_STORAGE_LABELS[k] : "— not decided" })),
  };

  return (
    <div className="stack">
      <div className="row-between">
        <Link href="/crew/kit" className="small">
          ← Kit
        </Link>
        <nav className="seg" aria-label="Riders">
          {riders.map((r) => (
            <Link key={r.id} href={`/crew/kit/${r.id}`} aria-current={r.id === rider.id ? "page" : undefined}>
              {r.displayName.split(" ")[0]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{mine ? "My kit" : `${rider.displayName}’s kit`}</h2>
        {editable && (
          <Link className="btn btn-sm" href="/crew/kit/suggested">
            Browse the suggested list{notYet ? ` (${notYet} not on ${mine ? "yours" : "this list"})` : ""}
          </Link>
        )}
      </div>
      {!editable && <p className="muted small">This is {rider.displayName}&rsquo;s list — only they (or an admin) can change it.</p>}
      <KitSheet riderId={rider.id} initial={items} editable={editable} labels={labels} />
    </div>
  );
}
