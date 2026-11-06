import "server-only";
import { headers } from "next/headers";

/** The site's own address for tracking pings, from the request's host: https://…/api/track/ */
export async function trackUrlBase(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "the-site";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/track/`;
}
