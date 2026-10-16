-- Phase 6: recurring rules (R44–R46, Should) and demo mode (R47–R49).

-- ---------- Recurring ----------

create or replace function public.create_recurring_rule(p_group_id uuid, p_rule jsonb, p_activity jsonb)
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
  perform public._assert_members(p_group_id, array[nullif(p_rule->>'created_by_member_id', '')::uuid]);
  insert into recurring_rules (group_id, template, frequency, anchor_date, next_due, end_date, active, created_by_member_id)
  values (
    p_group_id, p_rule->'template', p_rule->>'frequency', (p_rule->>'anchor_date')::date, (p_rule->>'next_due')::date,
    nullif(p_rule->>'end_date', '')::date, true, nullif(p_rule->>'created_by_member_id', '')::uuid)
  returning id into v_id;
  perform public._log_activity(p_group_id, 'recurring', v_id, p_activity);
  return v_id;
end;
$$;

-- Pause/resume (p_delete = false) or delete (p_delete = true) a rule. Generated expenses stay.
create or replace function public.update_recurring_rule(p_group_id uuid, p_rule_id uuid, p_active boolean, p_delete boolean, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_delete then
    delete from recurring_rules where id = p_rule_id and group_id = p_group_id;
  else
    update recurring_rules set active = p_active where id = p_rule_id and group_id = p_group_id;
  end if;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._log_activity(p_group_id, 'recurring', p_rule_id, p_activity);
end;
$$;

-- Creates one occurrence (idempotent via unique (recurring_rule_id, recurring_occurrence)) and
-- advances next_due. Returns the new expense id, or null if that occurrence already existed.
create or replace function public.generate_recurring(
  p_group_id uuid, p_rule_id uuid, p_occurrence date, p_next_due date,
  p_expense jsonb, p_payers jsonb, p_splits jsonb, p_activity jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_expense uuid;
begin
  perform 1 from recurring_rules where id = p_rule_id and group_id = p_group_id and active for update;
  if not found then
    return null;
  end if;
  if not exists (select 1 from expenses where recurring_rule_id = p_rule_id and recurring_occurrence = p_occurrence) then
    v_expense := public.create_expense(
      p_group_id,
      p_expense || jsonb_build_object('recurring_rule_id', p_rule_id, 'recurring_occurrence', p_occurrence),
      p_payers, p_splits, null);
    perform public._log_activity(p_group_id, 'expense', v_expense, p_activity);
  end if;
  update recurring_rules set next_due = greatest(next_due, p_next_due) where id = p_rule_id;
  return v_expense;
end;
$$;

-- ---------- Demo ----------

-- Inserts the seed (computed in lib/demo-seed.ts; member keys instead of ids) into a group.
create or replace function public._demo_seed(p_group_id uuid, p_seed jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_ids jsonb := '{}'::jsonb;
  v_m jsonb;
  v_e jsonb;
  v_s jsonb;
  v_id uuid;
  v_exp uuid;
  v_rec uuid;
  v_item jsonb;
  v_item_id uuid;
  v_pos int;
  v_ord int := 0;
begin
  for v_m in select * from jsonb_array_elements(p_seed->'members') loop
    v_ord := v_ord + 1;
    insert into members (group_id, name, upi_id, display_order)
    values (p_group_id, v_m->>'name', v_m->>'upiId', v_ord)
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(v_m->>'key', v_id);
  end loop;

  for v_e in select * from jsonb_array_elements(p_seed->'expenses') loop
    insert into expenses (group_id, description, category, notes, expense_date, currency, amount_minor, fx_rate,
                          fx_rate_date, fx_source, base_amount_minor, split_type)
    values (p_group_id, v_e->>'description', v_e->>'category', nullif(v_e->>'notes', ''), (v_e->>'date')::date,
            v_e->>'currency', (v_e->>'amountMinor')::bigint, (v_e->>'fxRate')::numeric, (v_e->>'fxRateDate')::date,
            v_e->>'fxSource', (v_e->>'baseAmountMinor')::bigint, v_e->>'splitType')
    returning id into v_exp;
    insert into expense_payers (expense_id, member_id, amount_minor, base_amount_minor)
    select v_exp, (v_ids->>(p->>'memberId'))::uuid, (p->>'amountMinor')::bigint, (p->>'baseAmountMinor')::bigint
    from jsonb_array_elements(v_e->'payers') p;
    insert into expense_splits (expense_id, member_id, input_value, owed_minor, owed_base_minor)
    select v_exp, (v_ids->>(s->>'memberId'))::uuid, nullif(s->>'inputValue', '')::numeric, (s->>'owedMinor')::bigint,
           (s->>'owedBaseMinor')::bigint
    from jsonb_array_elements(v_e->'splits') s;
    perform public._check_expense_invariants(v_exp);

    if v_e ? 'receipt' and jsonb_typeof(v_e->'receipt') = 'object' then
      insert into receipts (group_id, expense_id, status, model, merchant, receipt_date, currency, tax_minor, service_minor,
                            tip_minor, discount_minor, round_off_minor, printed_total_minor, diff_minor)
      values (p_group_id, v_exp, 'finalized', 'demo seed', v_e->'receipt'->>'merchant', (v_e->>'date')::date, v_e->>'currency',
              (v_e->'receipt'->>'taxMinor')::bigint, (v_e->'receipt'->>'serviceMinor')::bigint, (v_e->'receipt'->>'tipMinor')::bigint,
              (v_e->'receipt'->>'discountMinor')::bigint, (v_e->'receipt'->>'roundOffMinor')::bigint,
              (v_e->'receipt'->>'totalMinor')::bigint, (v_e->'receipt'->>'diffMinor')::bigint)
      returning id into v_rec;
      update expenses set receipt_id = v_rec where id = v_exp;
      for v_item, v_pos in select x, ord::int from jsonb_array_elements(v_e->'receipt'->'items') with ordinality t(x, ord) loop
        insert into receipt_items (receipt_id, position, name, quantity, amount_minor)
        values (v_rec, v_pos, v_item->>'name', (v_item->>'quantity')::numeric, (v_item->>'amountMinor')::bigint)
        returning id into v_item_id;
        insert into receipt_item_assignees (item_id, member_id)
        select v_item_id, (v_ids->>a)::uuid from jsonb_array_elements_text(v_item->'assignees') a;
      end loop;
    end if;
  end loop;

  for v_s in select * from jsonb_array_elements(p_seed->'settlements') loop
    insert into settlements (group_id, from_member_id, to_member_id, amount_minor, settled_on, method, note)
    values (p_group_id, (v_ids->>(v_s->>'from'))::uuid, (v_ids->>(v_s->>'to'))::uuid, (v_s->>'amountMinor')::bigint,
            (v_s->>'date')::date, v_s->>'method', v_s->>'note');
  end loop;
end;
$$;

-- R47: delete demo groups older than 7 days, then create a fresh seeded demo group.
create or replace function public.demo_create(p_token text, p_seed jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  delete from groups where is_demo and created_at < now() - interval '7 days';
  insert into groups (share_token, name, base_currency, is_demo)
  values (p_token, p_seed->'group'->>'name', p_seed->'group'->>'baseCurrency', true)
  returning id into v_id;
  perform public._demo_seed(v_id, p_seed);
  insert into activity (group_id, actor_member_id, action, entity_type, entity_id, summary)
  values (v_id, null, 'demo.reset', 'group', v_id, 'Demo data loaded');
  return v_id;
end;
$$;

-- R49: atomically wipe and re-seed a demo group under the same token. Non-demo groups → NOT_FOUND.
create or replace function public.demo_reset(p_group_id uuid, p_seed jsonb, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform 1 from groups where id = p_group_id and is_demo for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from activity where group_id = p_group_id;
  delete from receipts where group_id = p_group_id;
  delete from expenses where group_id = p_group_id;
  delete from settlements where group_id = p_group_id;
  delete from recurring_rules where group_id = p_group_id;
  delete from members where group_id = p_group_id;
  update groups set default_split = null, name = p_seed->'group'->>'name', updated_at = now() where id = p_group_id;
  perform public._demo_seed(p_group_id, p_seed);
  insert into activity (group_id, actor_member_id, action, entity_type, entity_id, summary)
  values (p_group_id, null, 'demo.reset', 'group', p_group_id, coalesce(p_activity->>'summary', 'Demo reset'));
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_recurring_rule', 'update_recurring_rule', 'generate_recurring', '_demo_seed', 'demo_create', 'demo_reset')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;
