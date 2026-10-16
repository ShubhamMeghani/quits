-- R60 (SPEC v0.5): the payee name decoded from a member's own UPI QR (`pn`), used as `pn` in links.
alter table public.members
  add column upi_name text check (upi_name is null or char_length(upi_name) between 1 and 100);

drop function if exists public.update_member(uuid, uuid, text, text, boolean, jsonb);

create or replace function public.update_member(
  p_group_id uuid, p_member_id uuid, p_name text, p_upi_id text, p_upi_name text, p_archived boolean, p_activity jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  update members
     set name = btrim(p_name),
         upi_id = nullif(btrim(p_upi_id), ''),
         upi_name = case when nullif(btrim(p_upi_id), '') is null then null else nullif(btrim(p_upi_name), '') end,
         archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_member_id and group_id = p_group_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._log_activity(p_group_id, 'member', p_member_id, p_activity);
end;
$$;

revoke all on function public.update_member(uuid, uuid, text, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.update_member(uuid, uuid, text, text, text, boolean, jsonb) to service_role;
