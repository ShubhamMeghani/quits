-- Phase 3: core schema (SPEC §4.1). All money columns are bigint minor units.
-- RLS is enabled on every table with no policies (R54): only the server's secret key
-- (service_role, which bypasses RLS) can read or write.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{22,64}$'),
  name text not null check (char_length(name) between 1 and 60),
  base_currency char(3) not null default 'INR' check (base_currency ~ '^[A-Z]{3}$'),
  default_split jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_demo_created_idx on public.groups (created_at) where is_demo;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  upi_id text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$'),
  display_order int not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, display_order)
);
create unique index members_group_name_uq on public.members (group_id, lower(btrim(name)));

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  template jsonb not null,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  anchor_date date not null,
  next_due date not null,
  end_date date,
  active boolean not null default true,
  created_by_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index recurring_rules_group_idx on public.recurring_rules (group_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  expense_id uuid,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  model text,
  extracted jsonb,
  merchant text,
  receipt_date date,
  currency char(3),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  service_minor bigint not null default 0 check (service_minor >= 0),
  tip_minor bigint not null default 0 check (tip_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  round_off_minor bigint not null default 0,
  printed_total_minor bigint not null default 0 check (printed_total_minor >= 0),
  diff_minor bigint not null default 0,
  created_at timestamptz not null default now()
);
create index receipts_group_idx on public.receipts (group_id);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  position int not null,
  name text not null check (char_length(name) between 1 and 100),
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  amount_minor bigint not null check (amount_minor >= 0),
  unique (receipt_id, position)
);

create table public.receipt_item_assignees (
  item_id uuid not null references public.receipt_items (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (item_id, member_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 100),
  category text not null check (category in (
    'Food & Drinks', 'Groceries', 'Rent', 'Utilities', 'Travel', 'Transport',
    'Entertainment', 'Shopping', 'Health', 'Education', 'Other')),
  notes text check (notes is null or char_length(notes) <= 500),
  expense_date date not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  fx_rate numeric(20, 10) not null check (fx_rate > 0),
  fx_rate_date date not null,
  fx_source text not null check (fx_source in ('identity', 'frankfurter', 'manual')),
  base_amount_minor bigint not null check (base_amount_minor >= 0),
  split_type text not null check (split_type in ('equal', 'exact', 'percent', 'shares', 'itemized')),
  receipt_id uuid references public.receipts (id) on delete set null,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  recurring_occurrence date,
  created_by_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (recurring_rule_id, recurring_occurrence)
);
create index expenses_group_date_idx on public.expenses (group_id, expense_date desc, created_at desc);

alter table public.receipts
  add constraint receipts_expense_fk foreign key (expense_id) references public.expenses (id) on delete set null;

create table public.expense_payers (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0),
  base_amount_minor bigint not null check (base_amount_minor >= 0),
  primary key (expense_id, member_id)
);

create table public.expense_splits (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete restrict,
  input_value numeric(20, 4),
  owed_minor bigint not null check (owed_minor >= 0),
  owed_base_minor bigint not null check (owed_base_minor >= 0),
  primary key (expense_id, member_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_member_id uuid not null references public.members (id) on delete restrict,
  to_member_id uuid not null references public.members (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  settled_on date not null,
  method text not null default 'other' check (method in ('upi', 'cash', 'other')),
  note text check (note is null or char_length(note) <= 200),
  created_by_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_member_id <> to_member_id)
);
create index settlements_group_idx on public.settlements (group_id, settled_on desc);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_member_id uuid references public.members (id) on delete set null,
  action text not null check (action in (
    'expense.created', 'expense.updated', 'expense.deleted', 'expense.restored',
    'settlement.created', 'settlement.updated', 'settlement.deleted', 'settlement.restored',
    'member.added', 'member.updated', 'member.archived', 'group.updated',
    'recurring.created', 'recurring.updated', 'recurring.deleted', 'recurring.generated',
    'receipt.finalized', 'demo.reset')),
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index activity_group_created_idx on public.activity (group_id, created_at desc);

create table public.fx_rates (
  rate_date date not null,
  base char(3) not null,
  quote char(3) not null,
  rate numeric(20, 10) not null check (rate > 0),
  source_date date not null,
  fetched_at timestamptz not null default now(),
  primary key (rate_date, base, quote)
);

create table public.rate_limits (
  bucket text not null,
  window_start date not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

-- R54: RLS on every table, no policies.
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_item_assignees enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.activity enable row level security;
alter table public.fx_rates enable row level security;
alter table public.rate_limits enable row level security;

-- Defence in depth: the browser roles get no table privileges at all.
revoke all on all tables in schema public from anon, authenticated;
