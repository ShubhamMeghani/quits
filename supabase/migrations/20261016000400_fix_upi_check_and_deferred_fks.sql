-- 1) Postgres regex bounds max out at 255, so '{2,256}' raised 2201B for any non-null UPI ID.
--    Keep the SPEC rule (2–256 chars before '@') with char_length instead.
alter table public.members drop constraint members_upi_id_check;
alter table public.members add constraint members_upi_id_check check (
  upi_id is null
  or (upi_id ~ '^[a-zA-Z0-9._-]+@[a-zA-Z]{2,64}$' and char_length(split_part(upi_id, '@', 1)) between 2 and 256)
);

-- 2) Member FKs are checked at commit, after the group cascade has removed payer/split/settlement
--    rows (NO ACTION still fired mid-cascade). Deleting a referenced member on its own still fails.
alter table public.expense_payers drop constraint expense_payers_member_id_fkey;
alter table public.expense_payers add constraint expense_payers_member_id_fkey
  foreign key (member_id) references public.members (id) deferrable initially deferred;

alter table public.expense_splits drop constraint expense_splits_member_id_fkey;
alter table public.expense_splits add constraint expense_splits_member_id_fkey
  foreign key (member_id) references public.members (id) deferrable initially deferred;

alter table public.settlements drop constraint settlements_from_member_id_fkey;
alter table public.settlements add constraint settlements_from_member_id_fkey
  foreign key (from_member_id) references public.members (id) deferrable initially deferred;

alter table public.settlements drop constraint settlements_to_member_id_fkey;
alter table public.settlements add constraint settlements_to_member_id_fkey
  foreign key (to_member_id) references public.members (id) deferrable initially deferred;
