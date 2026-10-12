import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { MIGRATIONS } from "./migrations";
import fs from "node:fs";
import path from "node:path";

// One database, one driver. Locally DATABASE_URL defaults to a file under
// ./data; in production it is a Turso libsql:// URL plus DATABASE_AUTH_TOKEN.

const globalForDb = globalThis as unknown as {
  __jcmrClient?: Client;
  __jcmrDb?: ReturnType<typeof drizzle<typeof schema>>;
  __jcmrReady?: Promise<void>;
};

function makeClient(): Client {
  const url = process.env.DATABASE_URL || "file:./data/jcmr.db";
  if (url.startsWith("file:")) {
    const file = url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  return createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
}

export const client: Client = globalForDb.__jcmrClient ?? (globalForDb.__jcmrClient = makeClient());

export const db = globalForDb.__jcmrDb ?? (globalForDb.__jcmrDb = drizzle(client, { schema }));

/** Ensures the tables exist. Cheap after the first call; safe to await anywhere. */
export function ready(): Promise<void> {
  if (!globalForDb.__jcmrReady) {
    globalForDb.__jcmrReady = (async () => {
      for (const sql of MIGRATIONS) await client.execute(sql);
    })().catch((e) => {
      globalForDb.__jcmrReady = undefined;
      throw e;
    });
  }
  return globalForDb.__jcmrReady;
}

export { schema };
