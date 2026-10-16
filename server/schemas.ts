// zod schemas for every server input (R55). No server-only imports, so forms can share them.
import { z } from "zod";
import { isSupportedCurrency } from "@/lib/currency";
import { CATEGORIES } from "@/lib/splits";
import { TOKEN_RE } from "@/server/token";
import { AppError } from "@/server/errors";

export const tokenSchema = z.string().regex(TOKEN_RE);
export const idSchema = z.uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");
export const currencySchema = z.string().refine(isSupportedCurrency, "Unsupported currency");
export const memberNameSchema = z.string().trim().min(1, "Enter a name").max(30, "Name is too long (max 30)");
export const upiIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, "Invalid UPI ID");

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Enter a group name").max(60),
  baseCurrency: currencySchema,
  memberNames: z
    .array(memberNameSchema)
    .min(2, "Add at least 2 people")
    .max(50)
    .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length, "Names must be different"),
});

const weightsRecord = z.record(idSchema, z.number().int().min(0));

export const splitSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("equal"), participants: z.array(idSchema).min(1) }),
  z.object({ type: z.literal("exact"), amounts: weightsRecord }),
  z.object({ type: z.literal("percent"), basisPoints: z.record(idSchema, z.number().int().min(0).max(10000)) }),
  z.object({ type: z.literal("shares"), shares: z.record(idSchema, z.number().int().min(0).max(1000)) }),
]);

export const defaultSplitSchema = z.object({
  type: z.enum(["equal", "percent", "shares"]),
  participants: z.array(idSchema).min(1),
  weights: z.record(idSchema, z.number().int().min(0)),
});

export const groupSettingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseCurrency: currencySchema,
  defaultSplit: defaultSplitSchema.nullable(),
});

export const expenseInputSchema = z.object({
  description: z.string().trim().min(1, "Enter a description").max(100),
  category: z.enum(CATEGORIES).default("Other"),
  notes: z.string().trim().max(500).nullish(),
  expenseDate: dateSchema,
  currency: currencySchema,
  amountMinor: z.number().int().positive("Amount must be more than 0"),
  payers: weightsRecord,
  split: splitSchema,
  manualRate: z.string().trim().nullish(),
});

export const settlementInputSchema = z.object({
  fromMemberId: idSchema,
  toMemberId: idSchema,
  amountMinor: z.number().int().positive(),
  settledOn: dateSchema,
  method: z.enum(["upi", "cash", "other"]).default("other"),
  note: z.string().trim().max(200).nullish(),
});

export const memberInputSchema = z.object({
  name: memberNameSchema,
  upiId: z.union([upiIdSchema, z.literal("")]).nullish(),
  /** Set only from a decoded UPI QR (R60). */
  upiName: z.string().trim().max(100).nullish(),
});

export type CreateGroupInput = z.input<typeof createGroupSchema>;
export type ExpenseInput = z.input<typeof expenseInputSchema>;
export type SettlementInput = z.input<typeof settlementInputSchema>;
export type MemberInput = z.input<typeof memberInputSchema>;
export type GroupSettingsInput = z.input<typeof groupSettingsSchema>;
export type DefaultSplit = z.infer<typeof defaultSplitSchema>;

/** Parses input or throws a VALIDATION AppError with field messages. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
  throw new AppError("VALIDATION", 400, r.error.issues[0]?.message ?? "Invalid input", fields);
}
