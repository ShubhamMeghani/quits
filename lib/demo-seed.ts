// Demo seed (R48): realistic Indian student data, deterministic, no external calls.
// Final balances are exactly Aarav +₹4,000, Priya +₹3,000, Rohan +₹3,000, Sneha −₹6,000,
// Kabir −₹4,000, which gives greedy 4 payments and optimal 3.
import { addDays } from "./recurring";
import { allocateItemized, type ReceiptData } from "./receipt";
import { buildExpenseAmounts, type ExpenseAmounts, type SplitInput } from "./splits";

export const DEMO_GROUP = { name: "Flat 302 · HSR Layout", baseCurrency: "INR" } as const;

export const DEMO_MEMBERS = [
  { key: "aarav", name: "Aarav", upiId: "aarav@demo" },
  { key: "priya", name: "Priya", upiId: "priya@demo" },
  { key: "rohan", name: "Rohan", upiId: "rohan@demo" },
  { key: "sneha", name: "Sneha", upiId: "sneha@demo" },
  { key: "kabir", name: "Kabir", upiId: "kabir@demo" },
] as const;

export type DemoKey = (typeof DEMO_MEMBERS)[number]["key"];

export const DEMO_KEYS: readonly DemoKey[] = DEMO_MEMBERS.map((m) => m.key);

/** In paise. */
export const DEMO_TARGET_BALANCES: Record<DemoKey, number> = {
  aarav: 400000,
  priya: 300000,
  rohan: 300000,
  sneha: -600000,
  kabir: -400000,
};

type SeedReceipt = {
  data: ReceiptData;
  assignees: DemoKey[][]; // per item
};

type SeedExpense = {
  key: string;
  dayOffset: number; // relative to the seed day (negative = past)
  description: string;
  category: string;
  notes?: string;
  currency: string;
  amountMinor: number;
  fxRate: string;
  payers: Partial<Record<DemoKey, number>>;
  split: SplitInput | { type: "receipt" };
  receipt?: SeedReceipt;
  recurring?: "monthly";
};

const ALL: DemoKey[] = ["aarav", "priya", "rohan", "sneha", "kabir"];

const SHACK_RECEIPT: SeedReceipt = {
  data: {
    merchant: "Sunset Shack, Anjuna",
    date: null,
    currency: "INR",
    items: [
      { name: "Prawn curry rice", quantity: 1, amountMinor: 48000 },
      { name: "Fish thali", quantity: 1, amountMinor: 35000 },
      { name: "Veg thali", quantity: 1, amountMinor: 28000 },
      { name: "Chicken cafreal", quantity: 1, amountMinor: 42000 },
      { name: "Kokum soda", quantity: 3, amountMinor: 21000 },
      { name: "Bebinca", quantity: 1, amountMinor: 18000 },
    ],
    taxMinor: 9600, // CGST 2.5% + SGST 2.5%
    serviceMinor: 9600, // 5% service charge
    tipMinor: 0,
    discountMinor: 0,
    roundOffMinor: 0,
    totalMinor: 211200,
  },
  assignees: [["aarav", "priya"], ["rohan"], ["sneha"], ["kabir", "rohan"], ["aarav", "priya", "sneha"], ALL],
};

export const DEMO_EXPENSES: readonly SeedExpense[] = [
  {
    key: "rent",
    dayOffset: -40,
    description: "Flat rent (October)",
    category: "Rent",
    notes: "Bigger rooms pay 2 shares; everyone paid part of it to the landlord",
    currency: "INR",
    amountMinor: 3000000,
    fxRate: "1",
    payers: { aarav: 900000, priya: 850000, rohan: 550000, sneha: 350000, kabir: 350000 },
    split: { type: "shares", shares: { aarav: 2, priya: 2, rohan: 2, sneha: 1, kabir: 1 } },
    recurring: "monthly",
  },
  {
    key: "wifi",
    dayOffset: -38,
    description: "Wi-Fi (ACT Fibernet)",
    category: "Utilities",
    currency: "INR",
    amountMinor: 117900,
    fxRate: "1",
    payers: { priya: 117900 },
    split: { type: "equal", participants: ALL },
    recurring: "monthly",
  },
  {
    key: "swiggy-biryani",
    dayOffset: -35,
    description: "Swiggy — biryani night",
    category: "Food & Drinks",
    currency: "INR",
    amountMinor: 124000,
    fxRate: "1",
    payers: { priya: 124000 },
    split: { type: "equal", participants: ["aarav", "priya", "rohan", "sneha"] },
  },
  {
    key: "electricity",
    dayOffset: -30,
    description: "Electricity bill (BESCOM)",
    category: "Utilities",
    notes: "Split by AC usage",
    currency: "INR",
    amountMinor: 234000,
    fxRate: "1",
    payers: { rohan: 234000 },
    split: { type: "exact", amounts: { aarav: 75530, priya: 32570, rohan: 64270, sneha: 35970, kabir: 25660 } },
  },
  {
    key: "zepto",
    dayOffset: -27,
    description: "Zepto groceries",
    category: "Groceries",
    currency: "INR",
    amountMinor: 186000,
    fxRate: "1",
    payers: { aarav: 186000 },
    split: { type: "equal", participants: ALL },
  },
  {
    key: "goa-train",
    dayOffset: -22,
    description: "Goa trip — train tickets (Bengaluru → Madgaon)",
    category: "Travel",
    currency: "INR",
    amountMinor: 645000,
    fxRate: "1",
    payers: { aarav: 645000 },
    split: { type: "equal", participants: ALL },
  },
  {
    key: "swiggy-pizza",
    dayOffset: -21,
    description: "Swiggy — pizza",
    category: "Food & Drinks",
    currency: "INR",
    amountMinor: 89700,
    fxRate: "1",
    payers: { sneha: 89700 },
    split: { type: "equal", participants: ["priya", "sneha", "kabir"] },
  },
  {
    key: "goa-hostel",
    dayOffset: -20,
    description: "Goa trip — hostel, 3 nights",
    category: "Travel",
    notes: "Rohan and Priya paid at check-in",
    currency: "INR",
    amountMinor: 900000,
    fxRate: "1",
    payers: { rohan: 600000, priya: 300000 },
    split: { type: "equal", participants: ALL },
  },
  {
    key: "goa-scooter",
    dayOffset: -19,
    description: "Goa trip — scooter rental",
    category: "Transport",
    notes: "Sneha and Kabir shared one scooter",
    currency: "INR",
    amountMinor: 240000,
    fxRate: "1",
    payers: { priya: 240000 },
    split: { type: "percent", basisPoints: { aarav: 2500, priya: 2500, rohan: 2500, sneha: 1250, kabir: 1250 } },
  },
  {
    key: "goa-shack",
    dayOffset: -18,
    description: "Goa trip — beach shack dinner",
    category: "Food & Drinks",
    currency: "INR",
    amountMinor: 211200,
    fxRate: "1",
    payers: { rohan: 211200 },
    split: { type: "receipt" },
    receipt: SHACK_RECEIPT,
  },
  {
    key: "movie",
    dayOffset: -14,
    description: "Movie night (PVR)",
    category: "Entertainment",
    currency: "INR",
    amountMinor: 105000,
    fxRate: "1",
    payers: { priya: 105000 },
    split: { type: "equal", participants: ["priya", "rohan", "sneha"] },
  },
  {
    key: "ai-subscription",
    dayOffset: -12,
    description: "AI study tool subscription (shared)",
    category: "Education",
    notes: "Billed in USD",
    currency: "USD",
    amountMinor: 2000,
    fxRate: "95.98",
    payers: { aarav: 2000 },
    split: { type: "equal", participants: ["aarav", "priya", "rohan", "sneha"] },
  },
  {
    key: "swiggy-maggi",
    dayOffset: -9,
    description: "Swiggy — late-night Maggi & chai",
    category: "Food & Drinks",
    currency: "INR",
    amountMinor: 42000,
    fxRate: "1",
    payers: { kabir: 42000 },
    split: { type: "equal", participants: ["rohan", "kabir"] },
  },
  {
    key: "blinkit",
    dayOffset: -6,
    description: "Blinkit groceries",
    category: "Groceries",
    currency: "INR",
    amountMinor: 213000,
    fxRate: "1",
    payers: { rohan: 213000 },
    split: { type: "equal", participants: ALL },
  },
  {
    key: "swiggy-breakfast",
    dayOffset: -3,
    description: "Swiggy — Sunday breakfast",
    category: "Food & Drinks",
    currency: "INR",
    amountMinor: 63000,
    fxRate: "1",
    payers: { aarav: 63000 },
    split: { type: "equal", participants: ["aarav", "rohan", "kabir"] },
  },
];

export const DEMO_SETTLEMENTS: readonly {
  dayOffset: number;
  from: DemoKey;
  to: DemoKey;
  amountMinor: number;
  method: "upi" | "cash" | "other";
  note: string;
}[] = [{ dayOffset: -5, from: "kabir", to: "aarav", amountMinor: 150000, method: "upi", note: "Rent share, part 1" }];

export type DemoSeedExpense = {
  key: string;
  date: string;
  description: string;
  category: string;
  notes: string | null;
  currency: string;
  fxRate: string;
  fxRateDate: string;
  fxSource: "identity" | "manual";
  splitType: "equal" | "exact" | "percent" | "shares" | "itemized";
  amounts: ExpenseAmounts;
  receipt: (SeedReceipt & { itemShares: Record<string, number> }) | null;
  recurring: "monthly" | null;
};

export type DemoSeed = {
  group: typeof DEMO_GROUP;
  members: typeof DEMO_MEMBERS;
  expenses: DemoSeedExpense[];
  settlements: { date: string; from: DemoKey; to: DemoKey; amountMinor: number; method: "upi" | "cash" | "other"; note: string }[];
};

/** Resolves dates relative to `today` and computes every stored amount (member ids = keys). */
export function buildDemoSeed(today: string): DemoSeed {
  const expenses = DEMO_EXPENSES.map((e): DemoSeedExpense => {
    const date = addDays(today, e.dayOffset);
    let split: SplitInput;
    let receipt: DemoSeedExpense["receipt"] = null;
    if (e.split.type === "receipt") {
      const r = e.receipt!;
      const res = allocateItemized(
        r.data.items.map((it, i) => ({ amountMinor: it.amountMinor, assignees: r.assignees[i] })),
        r.data.totalMinor,
        DEMO_KEYS,
      );
      if (!res.ok) throw new Error(`demo seed: receipt ${e.key} invalid`);
      split = { type: "itemized", owed: res.owed };
      receipt = { ...r, data: { ...r.data, date }, itemShares: res.itemShares };
    } else {
      split = e.split;
    }
    const amounts = buildExpenseAmounts({
      amountMinor: e.amountMinor,
      currency: e.currency,
      baseCurrency: DEMO_GROUP.baseCurrency,
      rate: e.fxRate,
      payers: e.payers as Record<string, number>,
      split,
      memberOrder: DEMO_KEYS,
    });
    if (!amounts.ok) throw new Error(`demo seed: expense ${e.key} invalid (${amounts.error.code})`);
    return {
      key: e.key,
      date,
      description: e.description,
      category: e.category,
      notes: e.notes ?? null,
      currency: e.currency,
      fxRate: e.fxRate,
      fxRateDate: date,
      fxSource: e.currency === DEMO_GROUP.baseCurrency ? "identity" : "manual",
      splitType: split.type,
      amounts: amounts.value,
      receipt,
      recurring: e.recurring ?? null,
    };
  });
  const settlements = DEMO_SETTLEMENTS.map((s) => ({ ...s, date: addDays(today, s.dayOffset) }));
  return { group: DEMO_GROUP, members: DEMO_MEMBERS, expenses, settlements };
}
