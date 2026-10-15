import { connection } from "next/server";
import { db } from "@/server/db";

// R57: keep-alive endpoint. Runs one trivial query, returns no data.
export async function GET() {
  await connection();
  try {
    const { error } = await db().from("_health").select("id").limit(1);
    if (error) throw error;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("health: database query failed");
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
