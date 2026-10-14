import { requireCrew } from "@/lib/auth";
import { loadRoutePlan } from "@/lib/plan-server";
import { RoutePlanner } from "@/components/route-planner";

export const dynamic = "force-dynamic";

export default async function CrewRoutePage() {
  const s = await requireCrew();
  const { profiles, saved, initial } = await loadRoutePlan();
  return <RoutePlanner profiles={profiles} initial={initial} saved={saved} me={s.name} isAdmin={s.role === "admin"} />;
}
