-- Demo: one monthly "Flat rent" rule. The seeded rent expense is its latest occurrence (linked via
-- recurring_rule_id/recurring_occurrence) and next_due is in the future, so opening the demo
-- generates nothing and the exact target balances hold (R48). Replaces _demo_seed from …000700.

create or replace function public._demo_map_keys(p_ids jsonb, p_obj jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(p_ids->>k, v), '{}'::jsonb) from jsonb_each(p_obj) e(k, v);
$$;

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
  v_rule uuid;
  v_item jsonb;
  v_item_id uuid;
  v_pos int;
  v_ord int := 0;
  v_t jsonb;
  v_split jsonb;
  v_k text;
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

    if v_e ? 'recurring' and jsonb_typeof(v_e->'recurring') = 'object' then
      -- Map member keys to ids inside the template (payers and the split's keyed fields).
      v_t := v_e->'recurring'->'template';
      v_split := v_t->'split';
      foreach v_k in array array['amounts', 'basisPoints', 'shares', 'owed'] loop
        if v_split ? v_k then
          v_split := jsonb_set(v_split, array[v_k], public._demo_map_keys(v_ids, v_split->v_k));
        end if;
      end loop;
      if v_split ? 'participants' then
        v_split := jsonb_set(v_split, '{participants}',
          (select coalesce(jsonb_agg(v_ids->>p), '[]'::jsonb) from jsonb_array_elements_text(v_split->'participants') p));
      end if;
      v_t := v_t || jsonb_build_object('payers', public._demo_map_keys(v_ids, v_t->'payers'), 'split', v_split);
      insert into recurring_rules (group_id, template, frequency, anchor_date, next_due, end_date, active)
      values (p_group_id, v_t, v_e->'recurring'->>'frequency', (v_e->'recurring'->>'anchorDate')::date,
              (v_e->'recurring'->>'nextDue')::date, null, true)
      returning id into v_rule;
      update expenses set recurring_rule_id = v_rule, recurring_occurrence = (v_e->>'date')::date where id = v_exp;
    end if;
  end loop;

  for v_s in select * from jsonb_array_elements(p_seed->'settlements') loop
    insert into settlements (group_id, from_member_id, to_member_id, amount_minor, settled_on, method, note)
    values (p_group_id, (v_ids->>(v_s->>'from'))::uuid, (v_ids->>(v_s->>'to'))::uuid, (v_s->>'amountMinor')::bigint,
            (v_s->>'date')::date, v_s->>'method', v_s->>'note');
  end loop;
end;
$$;

revoke all on function public._demo_map_keys(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._demo_map_keys(jsonb, jsonb) to service_role;
revoke all on function public._demo_seed(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._demo_seed(uuid, jsonb) to service_role;
