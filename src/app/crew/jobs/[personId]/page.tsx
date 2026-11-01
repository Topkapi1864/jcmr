import { notFound } from "next/navigation";
import { requireCrew } from "@/lib/auth";
import { asNight } from "@/lib/jobs";
import { crewMember } from "@/lib/people";
import { JobsList } from "@/components/jobs-list";

export const dynamic = "force-dynamic";

/** Someone's lists — anyone can look; only they or an admin can change them. */
export default async function PersonJobsPage({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const { personId } = await params;
  const sp = await searchParams;
  const who = await crewMember(Number(personId));
  if (!who) notFound();
  return <JobsList s={s} who={who} night={asNight(sp.night)} sp={sp} />;
}
