-- Member FKs on payers, splits and settlements: RESTRICT → NO ACTION (the default).
-- RESTRICT is checked immediately, which blocks deleting a whole group (demo reset, test
-- cleanup) even though the same statement cascades those rows away. NO ACTION is checked at
-- the end of the statement, so a member that is still referenced still cannot be deleted alone.
alter table public.expense_payers drop constraint expense_payers_member_id_fkey;
alter table public.expense_payers
  add constraint expense_payers_member_id_fkey foreign key (member_id) references public.members (id);

alter table public.expense_splits drop constraint expense_splits_member_id_fkey;
alter table public.expense_splits
  add constraint expense_splits_member_id_fkey foreign key (member_id) references public.members (id);

alter table public.settlements drop constraint settlements_from_member_id_fkey;
alter table public.settlements
  add constraint settlements_from_member_id_fkey foreign key (from_member_id) references public.members (id);

alter table public.settlements drop constraint settlements_to_member_id_fkey;
alter table public.settlements
  add constraint settlements_to_member_id_fkey foreign key (to_member_id) references public.members (id);
