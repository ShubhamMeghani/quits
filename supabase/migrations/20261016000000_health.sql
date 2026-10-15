-- Phase 1: keep-alive / health table. RLS on, no policies (R54).
create table if not exists public._health (
  id int primary key,
  note text not null
);

insert into public._health (id, note) values (1, 'ok')
on conflict (id) do nothing;

alter table public._health enable row level security;
