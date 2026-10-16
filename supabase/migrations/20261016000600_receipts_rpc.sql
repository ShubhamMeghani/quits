-- Phase 5: receipt drafts, finalize (R33–R36) and the daily scan limit (R30).
-- The receipt image is never stored (D-2); only extracted/edited values are.

-- Atomic per-bucket counter for the current IST day; returns the new count.
create or replace function public.bump_rate_limit(p_bucket text, p_day date)
returns int
language sql
set search_path = public
as $$
  insert into rate_limits (bucket, window_start, count) values (p_bucket, p_day, 1)
  on conflict (bucket, window_start) do update set count = rate_limits.count + 1
  returning count;
$$;

-- Creates (p_receipt_id null) or replaces a draft receipt with its items and assignees.
create or replace function public.save_receipt_draft(p_group_id uuid, p_receipt_id uuid, p_receipt jsonb, p_items jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_receipt_id;
  v_item jsonb;
  v_item_id uuid;
  v_pos int;
begin
  perform 1 from groups where id = p_group_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._assert_members(
    p_group_id,
    array(select a::uuid from jsonb_array_elements(p_items) x, jsonb_array_elements_text(x->'assignees') a)
  );
  if v_id is null then
    insert into receipts (group_id, status) values (p_group_id, 'draft') returning id into v_id;
  else
    perform 1 from receipts where id = v_id and group_id = p_group_id and status = 'draft' for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  update receipts set
    model = coalesce(p_receipt->>'model', model),
    extracted = coalesce(p_receipt->'extracted', extracted),
    merchant = nullif(p_receipt->>'merchant', ''),
    receipt_date = nullif(p_receipt->>'receipt_date', '')::date,
    currency = p_receipt->>'currency',
    tax_minor = (p_receipt->>'tax_minor')::bigint,
    service_minor = (p_receipt->>'service_minor')::bigint,
    tip_minor = (p_receipt->>'tip_minor')::bigint,
    discount_minor = (p_receipt->>'discount_minor')::bigint,
    round_off_minor = (p_receipt->>'round_off_minor')::bigint,
    printed_total_minor = (p_receipt->>'printed_total_minor')::bigint,
    diff_minor = (p_receipt->>'diff_minor')::bigint
  where id = v_id;
  delete from receipt_items where receipt_id = v_id;
  for v_item, v_pos in select x, ord::int from jsonb_array_elements(p_items) with ordinality t(x, ord) loop
    insert into receipt_items (receipt_id, position, name, quantity, amount_minor)
    values (v_id, v_pos, btrim(v_item->>'name'), (v_item->>'quantity')::numeric, (v_item->>'amount_minor')::bigint)
    returning id into v_item_id;
    insert into receipt_item_assignees (item_id, member_id)
    select distinct v_item_id, a::uuid from jsonb_array_elements_text(v_item->'assignees') a;
  end loop;
  return v_id;
end;
$$;

-- Saves the final receipt values and creates the itemized expense in one transaction (R35).
create or replace function public.finalize_receipt(
  p_group_id uuid, p_receipt_id uuid, p_receipt jsonb, p_items jsonb,
  p_expense jsonb, p_payers jsonb, p_splits jsonb, p_activity jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_expense uuid;
begin
  perform public.save_receipt_draft(p_group_id, p_receipt_id, p_receipt, p_items);
  v_expense := public.create_expense(
    p_group_id,
    p_expense || jsonb_build_object('receipt_id', p_receipt_id, 'split_type', 'itemized'),
    p_payers, p_splits, null);
  update receipts set status = 'finalized', expense_id = v_expense where id = p_receipt_id;
  perform public._log_activity(p_group_id, 'expense', v_expense, p_activity);
  return v_expense;
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('bump_rate_limit', 'save_receipt_draft', 'finalize_receipt')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;
