// CLI: npm run db:seed [-- --items]
import { client } from "./client";
import { seedAll } from "../lib/seed-data";

seedAll(process.argv.includes("--items"))
  .then(() => client.close())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
