import { Fragment, type ReactNode } from "react";

// A crew message as it was typed: blank lines make paragraphs, single line
// breaks stay, web addresses become links. Plain text in, React nodes out —
// nothing is injected as HTML, so whatever is typed is shown as typed.

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/g;

export function MessageBody({ text, className }: { text: string; className?: string }) {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i}>{withLinks(p)}</p>
      ))}
    </div>
  );
}

function withLinks(para: string): ReactNode[] {
  const out: ReactNode[] = [];
  para.split("\n").forEach((line, li) => {
    if (li > 0) out.push(<br key={`b${li}`} />);
    let last = 0;
    for (const m of line.matchAll(URL_RE)) {
      const start = m.index ?? 0;
      if (start > last) out.push(<Fragment key={`t${li}-${last}`}>{line.slice(last, start)}</Fragment>);
      out.push(
        <a key={`a${li}-${start}`} href={m[0]} target="_blank" rel="noopener">
          {m[0]}
        </a>,
      );
      last = start + m[0].length;
    }
    if (last < line.length) out.push(<Fragment key={`t${li}-${last}`}>{line.slice(last)}</Fragment>);
  });
  return out;
}
