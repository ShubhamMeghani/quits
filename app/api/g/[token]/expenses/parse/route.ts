// R61–R65: type-to-add. Returns a form prefill; never saves anything.
import { connection } from "next/server";
import { parseExpenseText } from "@/server/nl";

export const maxDuration = 30;

export async function POST(request: Request, ctx: RouteContext<"/api/g/[token]/expenses/parse">) {
  await connection();
  const { token } = await ctx.params;
  return parseExpenseText(request, token);
}
