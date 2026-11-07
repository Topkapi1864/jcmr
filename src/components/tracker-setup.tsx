import { CopyText } from "./copy-text";
import { clearMine, newAddress } from "@/app/crew/track/actions";
import { possessive } from "@/lib/util";

/** The card that gets one phone posting to the site: the person's address and the OwnTracks steps. */
export function TrackerSetup({ url, name, personId, isSelf, sp }: { url: string; name: string; personId: number; isSelf: boolean; sp: Record<string, string | undefined> }) {
  const whose = isSelf ? "your" : possessive(name);
  return (
    <section className="card stack-sm" id="setup">
      <h2>{isSelf ? "Your phone" : `${possessive(name)} phone`}</h2>
      {sp.reset && <p className="notice">New address made. The old one no longer works — update the app.</p>}
      {sp.cleared && <p className="notice">Positions cleared.</p>}
      <p className="small muted" style={{ margin: 0 }}>
        The phone runs the free <b>OwnTracks</b> app, which posts its position to this address about once a minute, in the background with the screen locked. Keep the address to {isSelf ? "yourself" : name} — anyone who has it can post as {isSelf ? "you" : name}.
      </p>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <code className="track-url" style={{ flex: "1 1 16rem" }}>
          {url}
        </code>
        <CopyText text={url} label="Copy address" />
      </div>
      <ol className="track-steps small">
        <li>
          Install <b>OwnTracks</b> from the App Store or Google Play (the icon is a white arrow on blue).
        </li>
        <li>
          Open it and allow location <b>Always</b> (iPhone: Allow While Using, then change it to Always in Settings → OwnTracks → Location; keep Precise on). Allow it to run in the background and turn off any battery saver for it.
        </li>
        <li>
          In the app go to <b>Settings</b> (iPhone: the Settings tab; Android: the menu, then Preferences → Connection). Set <b>Mode</b> to <b>HTTP</b>.
        </li>
        <li>
          Paste the address above into <b>URL</b>. Leave user, password and the identification blank — the address is the key. If it asks for a <b>Tracker ID</b>, two letters of {whose} name will do.
        </li>
        <li>
          Set the reporting mode to <b>Move</b>: on iPhone tap the arrow button on the map until it says Move; on Android it is Preferences → Reporting → Mode. Move posts about once a minute; Significant only posts every few hundred metres.
        </li>
        <li>
          Tap <b>publish now</b> (the up arrow) once. Within a minute {isSelf ? "you" : name} should appear on the map below.
        </li>
      </ol>
      <p className="xs muted" style={{ margin: 0 }}>
        Battery: about a third of a charge over a riding day, so carry a power bank. No signal: the app queues fixes and sends them when the signal comes back. Any other tracking app that can post to a URL (Traccar Client, GPSLogger) works with the same address.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <form action={clearMine}>
          <input type="hidden" name="personId" value={personId} />
          <button className="btn btn-sm" type="submit">
            Clear {whose} positions
          </button>
        </form>
        <form action={newAddress}>
          <input type="hidden" name="personId" value={personId} />
          <button className="btn btn-sm" type="submit">
            New address
          </button>
        </form>
      </div>
    </section>
  );
}
