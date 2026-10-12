import Link from "next/link";

export default function NotFound() {
  return (
    <div className="holding">
      <div>
        <h1>Not here</h1>
        <p className="muted">
          That page doesn&rsquo;t exist. <Link href="/">Home</Link>
        </p>
      </div>
    </div>
  );
}
