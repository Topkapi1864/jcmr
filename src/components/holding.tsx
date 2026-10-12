import { Badge } from "./logo";

// The dark state (§3.3): a title and one line. No names, no route, no link.
export function Holding() {
  return (
    <div className="holding" data-shell="holding">
      <div className="stack" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Badge size={140} />
        <h1 style={{ marginTop: 24 }}>The Janet Channon Memorial Ride</h1>
        <p className="muted" style={{ marginTop: 0 }}>14–15 November 2026. More soon.</p>
      </div>
    </div>
  );
}
