// Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL.
// The env is loaded by `node --env-file-if-exists=.env.local` (package.json);
// the URL is passed straight to the CLI and never printed.
import { spawnSync } from "node:child_process";
import path from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("db:push: SUPABASE_DB_URL is not set. Add the Session pooler connection string to .env.local.");
  process.exit(1);
}

const cli = path.join("node_modules", "supabase", "dist", "supabase.js");
const result = spawnSync(process.execPath, [cli, "db", "push", "--db-url", url, "--include-all", "--skip-vault"], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
