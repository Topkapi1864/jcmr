import { requireCrew } from "@/lib/auth";
import { asNight } from "@/lib/jobs";
import { crewMember } from "@/lib/people";
import { JobsList } from "@/components/jobs-list";

export const dynamic = "force-dynamic";

/** My own lists. */
export default async function MyJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const who = await crewMember(s.pid);
  if (!who) {
    return (
      <p className="muted">
        You are signed in as {s.name}, who is not on the crew list, so there is no job list to keep. An admin can add you under Crew → Admin → People.
      </p>
    );
  }
  return <JobsList s={s} who={who} night={asNight(sp.night)} sp={sp} />;
}
