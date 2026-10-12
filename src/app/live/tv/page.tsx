import { TvShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { livePayload } from "@/lib/live";
import { LiveView } from "@/components/live-view";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Live — TV");

export default async function LiveTvPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const initial = await livePayload();
  return (
    <TvShell>
      <LiveView initial={initial} tv />
    </TvShell>
  );
}
