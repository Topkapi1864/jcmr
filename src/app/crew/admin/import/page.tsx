import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <Link href="/crew/admin" className="small">
        ← Admin
      </Link>
      <h1>Import items from CSV</h1>
      <p className="muted small">
        Header row required: <code>title,area,owner,due,status,waiting_on,note,last_touched,source</code>. Owner must match a short name on the
        people list. Re-running is safe: a row with the same title and owner updates the item rather than duplicating it. <code>last_touched</code>{" "}
        (YYYY-MM-DD) sets the item&rsquo;s age so the stale view is honest from day one.
      </p>
      <ImportForm />
    </div>
  );
}
