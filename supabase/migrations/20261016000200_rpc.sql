-- Phase 3: atomic write functions (R8, R11, R14, R23, R55).
-- Each function runs in one transaction. It re-checks group ownership of every referenced id
-- (NOT_FOUND) and the per-expense invariants (INVARIANT_VIOLATION) before committing.
-- Errors: raise exception with message 'NOT_FOUND' | 'INVARIANT_VIOLATION' | 'BASE_CURRENCY_LOCKED'.

create or replace function public._assert_members(p_group_id uuid, p_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_missing int;
begin
  select count(*) into v_missing
  from unnest(p_ids) as x(id)
  where x.id is not null
    and not exists (select 1 from members m where m.id = x.id and m.group_id = p_group_id);
  if v_missing > 0 then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public._log_activity(p_group_id uuid, p_entity_type text, p_entity_id uuid, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_activity is null then
    return;
  end if;
  perform public._assert_members(p_group_id, array[nullif(p_activity->>'actor_member_id', '')::uuid]);
  insert into activity (group_id, actor_member_id, action, entity_type, entity_id, summary, details)
  values (
    p_group_id,
    nullif(p_activity->>'actor_member_id', '')::uuid,
    p_activity->>'action',
    p_entity_type,
    p_entity_id,
    p_activity->>'summary',
    p_activity->'details'
  );
end;
$$;

create or replace function public._check_expense_invariants(p_expense_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  e record;
  v_pay bigint;
  v_pay_base bigint;
  v_owe bigint;
  v_owe_base bigint;
begin
  select amount_minor, base_amount_minor into e from expenses where id = p_expense_id;
  select coalesce(sum(amount_minor), 0), coalesce(sum(base_amount_minor), 0) into v_pay, v_pay_base
    from expense_payers where expense_id = p_expense_id;
  select coalesce(sum(owed_minor), 0), coalesce(sum(owed_base_minor), 0) into v_owe, v_owe_base
    from expense_splits where expense_id = p_expense_id;
  if v_pay <> e.amount_minor or v_owe <> e.amount_minor
     or v_pay_base <> e.base_amount_minor or v_owe_base <> e.base_amount_minor then
    raise exception 'INVARIANT_VIOLATION' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public._write_expense_rows(p_group_id uuid, p_expense_id uuid, p_payers jsonb, p_splits jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform public._assert_members(
    p_group_id,
    array(select (x->>'member_id')::uuid from jsonb_array_elements(p_payers) x
          union all
          select (x->>'member_id')::uuid from jsonb_array_elements(p_splits) x)
  );
  delete from expense_payers where expense_id = p_expense_id;
  delete from expense_splits where expense_id = p_expense_id;
  insert into expense_payers (expense_id, member_id, amount_minor, base_amount_minor)
  select p_expense_id, (x->>'member_id')::uuid, (x->>'amount_minor')::bigint, (x->>'base_amount_minor')::bigint
  from jsonb_array_elements(p_payers) x;
  insert into expense_splits (expense_id, member_id, input_value, owed_minor, owed_base_minor)
  select p_expense_id, (x->>'member_id')::uuid, nullif(x->>'input_value', '')::numeric,
         (x->>'owed_minor')::bigint, (x->>'owed_base_minor')::bigint
  from jsonb_array_elements(p_splits) x;
  perform public._check_expense_invariants(p_expense_id);
end;
$$;

-- Creates a group and its members (display_order = array order). Returns the group id.
create or replace function public.create_group(p_token text, p_name text, p_base_currency text, p_member_names text[])
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into groups (share_token, name, base_currency) values (p_token, btrim(p_name), p_base_currency)
  returning id into v_id;
  insert into members (group_id, name, display_order)
  select v_id, btrim(n), ord::int from unnest(p_member_names) with ordinality as t(n, ord);
  return v_id;
end;
$$;

create or replace function public.add_member(p_group_id uuid, p_name text, p_upi_id text, p_activity jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_order int;
begin
  perform 1 from groups where id = p_group_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(max(display_order), 0) + 1 into v_order from members where group_id = p_group_id;
  insert into members (group_id, name, upi_id, display_order)
  values (p_group_id, btrim(p_name), nullif(btrim(p_upi_id), ''), v_order)
  returning id into v_id;
  perform public._log_activity(p_group_id, 'member', v_id, p_activity);
  return v_id;
end;
$$;

create or replace function public.update_member(p_group_id uuid, p_member_id uuid, p_name text, p_upi_id text, p_archived boolean, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  update members
     set name = btrim(p_name),
         upi_id = nullif(btrim(p_upi_id), ''),
         archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_member_id and group_id = p_group_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._log_activity(p_group_id, 'member', p_member_id, p_activity);
end;
$$;

create or replace function public.update_group_settings(p_group_id uuid, p_name text, p_base_currency text, p_default_split jsonb, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_current text;
begin
  select base_currency into v_current from groups where id = p_group_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_base_currency <> v_current
     and exists (select 1 from expenses where group_id = p_group_id) then
    raise exception 'BASE_CURRENCY_LOCKED' using errcode = 'P0001';
  end if;
  update groups
     set name = btrim(p_name), base_currency = p_base_currency, default_split = p_default_split, updated_at = now()
   where id = p_group_id;
  perform public._log_activity(p_group_id, 'group', p_group_id, p_activity);
end;
$$;

create or replace function public.create_expense(p_group_id uuid, p_expense jsonb, p_payers jsonb, p_splits jsonb, p_activity jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform 1 from groups where id = p_group_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._assert_members(p_group_id, array[nullif(p_expense->>'created_by_member_id', '')::uuid]);
  insert into expenses (
    group_id, description, category, notes, expense_date, currency, amount_minor, fx_rate, fx_rate_date,
    fx_source, base_amount_minor, split_type, receipt_id, recurring_rule_id, recurring_occurrence, created_by_member_id
  ) values (
    p_group_id,
    btrim(p_expense->>'description'),
    p_expense->>'category',
    nullif(p_expense->>'notes', ''),
    (p_expense->>'expense_date')::date,
    p_expense->>'currency',
    (p_expense->>'amount_minor')::bigint,
    (p_expense->>'fx_rate')::numeric,
    (p_expense->>'fx_rate_date')::date,
    p_expense->>'fx_source',
    (p_expense->>'base_amount_minor')::bigint,
    p_expense->>'split_type',
    nullif(p_expense->>'receipt_id', '')::uuid,
    nullif(p_expense->>'recurring_rule_id', '')::uuid,
    nullif(p_expense->>'recurring_occurrence', '')::date,
    nullif(p_expense->>'created_by_member_id', '')::uuid
  ) returning id into v_id;
  perform public._write_expense_rows(p_group_id, v_id, p_payers, p_splits);
  perform public._log_activity(p_group_id, 'expense', v_id, p_activity);
  return v_id;
end;
$$;

create or replace function public.update_expense(p_group_id uuid, p_expense_id uuid, p_expense jsonb, p_payers jsonb, p_splits jsonb, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- Last write wins (no version check; SPEC §8).
  update expenses set
    description = btrim(p_expense->>'description'),
    category = p_expense->>'category',
    notes = nullif(p_expense->>'notes', ''),
    expense_date = (p_expense->>'expense_date')::date,
    currency = p_expense->>'currency',
    amount_minor = (p_expense->>'amount_minor')::bigint,
    fx_rate = (p_expense->>'fx_rate')::numeric,
    fx_rate_date = (p_expense->>'fx_rate_date')::date,
    fx_source = p_expense->>'fx_source',
    base_amount_minor = (p_expense->>'base_amount_minor')::bigint,
    split_type = p_expense->>'split_type',
    updated_at = now()
  where id = p_expense_id and group_id = p_group_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._write_expense_rows(p_group_id, p_expense_id, p_payers, p_splits);
  perform public._log_activity(p_group_id, 'expense', p_expense_id, p_activity);
end;
$$;

create or replace function public.set_expense_deleted(p_group_id uuid, p_expense_id uuid, p_deleted boolean, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  update expenses
     set deleted_at = case when p_deleted then now() else null end, updated_at = now()
   where id = p_expense_id and group_id = p_group_id
     and (deleted_at is null) = p_deleted;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._log_activity(p_group_id, 'expense', p_expense_id, p_activity);
end;
$$;

create or replace function public.create_settlement(p_group_id uuid, p_settlement jsonb, p_activity jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform 1 from groups where id = p_group_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._assert_members(p_group_id, array[
    (p_settlement->>'from_member_id')::uuid,
    (p_settlement->>'to_member_id')::uuid,
    nullif(p_settlement->>'created_by_member_id', '')::uuid
  ]);
  insert into settlements (group_id, from_member_id, to_member_id, amount_minor, settled_on, method, note, created_by_member_id)
  values (
    p_group_id,
    (p_settlement->>'from_member_id')::uuid,
    (p_settlement->>'to_member_id')::uuid,
    (p_settlement->>'amount_minor')::bigint,
    (p_settlement->>'settled_on')::date,
    coalesce(p_settlement->>'method', 'other'),
    nullif(p_settlement->>'note', ''),
    nullif(p_settlement->>'created_by_member_id', '')::uuid
  ) returning id into v_id;
  perform public._log_activity(p_group_id, 'settlement', v_id, p_activity);
  return v_id;
end;
$$;

create or replace function public.set_settlement_deleted(p_group_id uuid, p_settlement_id uuid, p_deleted boolean, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  update settlements
     set deleted_at = case when p_deleted then now() else null end
   where id = p_settlement_id and group_id = p_group_id
     and (deleted_at is null) = p_deleted;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._log_activity(p_group_id, 'settlement', p_settlement_id, p_activity);
end;
$$;

-- Only the server (service_role, via the secret key) may call these functions.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('_assert_members', '_log_activity', '_check_expense_invariants', '_write_expense_rows',
                        'create_group', 'add_member', 'update_member', 'update_group_settings', 'create_expense',
                        'update_expense', 'set_expense_deleted', 'create_settlement', 'set_settlement_deleted')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;
