"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

// Every rider card shows the same number of lines of bio, so the four cards
// sit at one height. A bio that doesn't fit fades out at the bottom and gets a
// "Read more"; one that only just overflows is shown whole, because a button
// that reveals a single line is sillier than a card a line taller. The server
// renders every bio clamped (no jump on load); the fade and the button appear
// once the page has measured what overflows.

export function RiderBio({ html, name }: { html: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [over, setOver] = useState<boolean | null>(null); // null until measured
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const line = parseFloat(cs.lineHeight) || 24;
      const lines = parseFloat(cs.getPropertyValue("--bio-lines")) || 15;
      setOver(el.scrollHeight - lines * line > 1.5 * line);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamped = over !== false && !open;
  const first = name.split(/\s+/)[0];
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) {
      const card = ref.current?.closest(".rider-profile");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  };

  return (
    <>
      <div
        id={id}
        ref={ref}
        className="rider-profile-bio"
        data-clamped={clamped ? "" : undefined}
        data-fade={over && !open ? "" : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {over && (
        <button
          type="button"
          className="rider-bio-more"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? `Show less of ${first}’s bio` : `Read more of ${first}’s bio`}
          onClick={toggle}
        >
          {open ? "Show less ↑" : "Read more ↓"}
        </button>
      )}
    </>
  );
}
