// The CDN in front of the site (Vercel's). A response sent with a
// `Vercel-Cache-Tag` header and an `s-maxage` is kept by the CDN under that
// tag, and can be cleared again by tag from inside a request.

/** The header that files a cached response under these tags. */
export const cdnTagHeader = (...tags: string[]): Record<string, string> => ({ "Vercel-Cache-Tag": tags.join(",") });

type RequestContext = { purge?: { dangerouslyDeleteByTag?: (tag: string | string[]) => Promise<unknown> } };

/**
 * Deletes everything the CDN holds under these tags, so the next request for
 * any of it comes back to the site. This is what `dangerouslyDeleteByTag` in
 * the `@vercel/functions` package does (it reads the same per-request object
 * Vercel provides); it is done by hand here to spare the site that package and
 * the two dozen it brings with it. Off Vercel (local runs, tests) there is no
 * such object and this does nothing. It never throws: failing to clear a cache
 * must not undo the change that asked for it.
 */
export async function clearCdnTags(tags: string[]): Promise<void> {
  if (!tags.length) return;
  try {
    const holder = (globalThis as unknown as Record<symbol, { get?: () => RequestContext | undefined } | undefined>)[Symbol.for("@vercel/request-context")];
    await holder?.get?.()?.purge?.dangerouslyDeleteByTag?.(tags);
  } catch (e) {
    console.warn("cdn: could not clear", tags.join(", "), e);
  }
}
