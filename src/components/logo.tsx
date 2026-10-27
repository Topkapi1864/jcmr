// The JCMR identity (design handoff, turn 3): the wheel mark, the stacked
// lockup and the badge. Colours come from tokens via currentColor / CSS vars.

export function Wheel({ size = 40, onDark = false, spokes = 8, title = "" }: { size?: number; onDark?: boolean; spokes?: 8 | 4 | 0; title?: string }) {
  const ring = onDark ? "var(--duck-egg)" : "var(--duck-egg-deep)";
  const ink = onDark ? "var(--cream)" : "var(--navy)";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-label={title || undefined} aria-hidden={title ? undefined : true} style={{ display: "block", flex: "none" }}>
      <circle cx="32" cy="32" r="25" fill="none" stroke={ring} strokeWidth={spokes ? 5 : 7} />
      {spokes >= 4 && (
        <>
          <line x1="32" y1="12" x2="32" y2="52" stroke={ink} strokeWidth="2" />
          <line x1="12" y1="32" x2="52" y2="32" stroke={ink} strokeWidth="2" />
        </>
      )}
      {spokes === 8 && (
        <>
          <line x1="17.9" y1="17.9" x2="46.1" y2="46.1" stroke={ink} strokeWidth="1.8" />
          <line x1="46.1" y1="17.9" x2="17.9" y2="46.1" stroke={ink} strokeWidth="1.8" />
        </>
      )}
      <circle cx="32" cy="32" r={spokes ? 4.5 : 6} fill={ink} />
      {spokes === 8 && <circle cx="32" cy="7" r="3.5" fill={ink} />}
    </svg>
  );
}

// Wheel, "JCMR" and the ride's name, in px for each size. `stacked` puts the
// name on two lines ("Janet Channon" over "Memorial Ride"), which is how the
// public header carries the bigger lockup without widening it.
const LOCKUP_SIZES = { sm: [28, 17, 6.5], md: [36, 21, 7.5], lg: [44, 24, 8.5], xl: [50, 28, 10] } as const;

export function Lockup({ onDark = false, size = "md", stacked = false }: { onDark?: boolean; size?: keyof typeof LOCKUP_SIZES; stacked?: boolean }) {
  const [wheel, word, name] = LOCKUP_SIZES[size];
  return (
    <span className="lockup" style={{ display: "inline-flex", alignItems: "center", gap: size === "xl" ? 12 : 10 }}>
      <Wheel size={wheel} onDark={onDark} />
      <span>
        <span className="lockup-word" style={{ fontSize: word }}>
          JCMR
        </span>
        {stacked ? (
          <span className="lockup-name lockup-name-stacked" style={{ fontSize: name }}>
            <span>Janet Channon</span>
            <span>Memorial Ride</span>
          </span>
        ) : (
          <span className="lockup-name" style={{ fontSize: name }}>
            Janet Channon Memorial Ride
          </span>
        )}
      </span>
    </span>
  );
}

export function Badge({ size = 116, className }: { size?: number; className?: string }) {
  const id = "ring" + size;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-label="JCMR badge" className={className} style={{ display: "block" }}>
      <circle cx="100" cy="100" r="97" fill="var(--navy)" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="var(--duck-egg)" strokeWidth="1.5" />
      <path id={id} d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" fill="none" />
      <text className="badge-ring">
        <textPath href={`#${id}`}>JANET CHANNON MEMORIAL RIDE · LONDON TO YEADON · 2026 ·</textPath>
      </text>
      <circle cx="100" cy="84" r="21" fill="none" stroke="var(--duck-egg)" strokeWidth="4.5" />
      <line x1="100" y1="67" x2="100" y2="101" stroke="var(--cream)" strokeWidth="1.6" />
      <line x1="83" y1="84" x2="117" y2="84" stroke="var(--cream)" strokeWidth="1.6" />
      <line x1="88" y1="72" x2="112" y2="96" stroke="var(--cream)" strokeWidth="1.6" />
      <line x1="112" y1="72" x2="88" y2="96" stroke="var(--cream)" strokeWidth="1.6" />
      <circle cx="100" cy="84" r="3.6" fill="var(--cream)" />
      <circle cx="100" cy="63" r="2.8" fill="var(--cream)" />
      <text x="100" y="135" className="badge-word" textAnchor="middle">
        JCMR
      </text>
      <text x="100" y="151" className="badge-miles" textAnchor="middle">
        240 MILES
      </text>
    </svg>
  );
}
