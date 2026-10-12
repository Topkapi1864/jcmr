// Signed session cookie. Web Crypto only, so it runs in proxy.ts (edge) and
// in the Node runtime alike. No session table: the cookie is the session.

export const SESSION_COOKIE = "jcmr_session";
export const SESSION_DAYS = 30;

export type Session = {
  pid: number;
  name: string; // short name shown as "updated by"
  role: "admin" | "crew";
  exp: number; // unix seconds
};

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return "dev-only-secret-not-for-production";
  }
  return s;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(s: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64url(body))) as Session;
    if (typeof s.pid !== "number" || typeof s.exp !== "number") return null;
    if (s.exp * 1000 < Date.now()) return null;
    if (s.role !== "admin" && s.role !== "crew") return null;
    if ((s as { kind?: string }).kind) return null; // an unlock token is not a session
    return s;
  } catch {
    return null;
  }
}

// The sign-in is two steps: password, then "who are you?". Between the two a
// short-lived signed "unlock" cookie proves the password was given.
export const UNLOCK_COOKIE = "jcmr_unlock";

export async function signUnlock(): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ kind: "unlock", exp: Math.floor(Date.now() / 1000) + 600 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyUnlock(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64url(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return false;
    const s = JSON.parse(new TextDecoder().decode(unb64url(body))) as { kind?: string; exp?: number };
    return s.kind === "unlock" && typeof s.exp === "number" && s.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
