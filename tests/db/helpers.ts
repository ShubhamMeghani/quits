import postgres from "postgres";

/** DB tests run only when the local env provides a database (never in CI). */
export const hasDb = Boolean(process.env.SUPABASE_DB_URL && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

export const TEST_PREFIX = "__test__";

export function sqlClient() {
  return postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1, onnotice: () => undefined, connect_timeout: 20 });
}

export type Sql = ReturnType<typeof sqlClient>;

/** Deletes the given test groups (cascades to all their rows). */
export async function deleteGroups(sql: Sql, tokens: string[]) {
  if (tokens.length === 0) return;
  await sql`delete from public.groups where share_token in ${sql(tokens)} and name like ${TEST_PREFIX + "%"}`;
}
