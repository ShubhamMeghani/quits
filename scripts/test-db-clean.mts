// Deletes leftover DB-test groups (name starts with "__test__") and all their rows.
// Env is loaded by `node --env-file-if-exists=.env.local` (package.json); nothing is printed but counts.
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("test:db:clean: SUPABASE_DB_URL is not set (expected in .env.local).");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => undefined, connect_timeout: 20 });
try {
  const rows = await sql`delete from public.groups where name like ${"\_\_test\_\_%"} returning id`;
  console.log(`test:db:clean: deleted ${rows.length} test group(s)`);
} finally {
  await sql.end();
}
