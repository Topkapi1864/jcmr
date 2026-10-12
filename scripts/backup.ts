// npm run backup — writes backups/jcmr-<date>.json from whatever DATABASE_URL points at.
import fs from "node:fs";
import { fullBackup } from "../src/lib/backup";
import { client } from "../src/db/client";
const dir = "backups";
fs.mkdirSync(dir, { recursive: true });
const file = `${dir}/jcmr-${new Date().toISOString().slice(0, 10)}.json`;
fullBackup().then((b) => { fs.writeFileSync(file, JSON.stringify(b)); console.log("wrote", file); client.close(); });
