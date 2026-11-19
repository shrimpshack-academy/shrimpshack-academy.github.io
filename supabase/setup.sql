-- Shrimp Shack Academy — database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. It is safe to run again.
-- It contains NO passwords, keys or staff data.

-- 1) One table holds every record. Only the server (the Edge Function, using the secret key) can read or write it.
create table if not exists public.records (
  coll       text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);
create index if not exists records_data_idx on public.records using gin (data jsonb_path_ops);

alter table public.records enable row level security;   -- on, with NO policies = nobody from the browser
revoke all on table public.records from anon, authenticated;

-- 2) History: every change or delete keeps the previous version, so mistakes can be undone.
create table if not exists public.records_history (
  hid        bigint generated always as identity primary key,
  coll       text        not null,
  id         text        not null,
  data       jsonb       not null,
  op         text        not null,
  changed_at timestamptz not null default now()
);
create index if not exists records_history_lookup on public.records_history (coll, id, changed_at desc);
alter table public.records_history enable row level security;
revoke all on table public.records_history from anon, authenticated;

create or replace function public.records_keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE') then
    if old.data is distinct from new.data then
      insert into public.records_history (coll, id, data, op) values (old.coll, old.id, old.data, 'update');
    end if;
    new.updated_at := now();
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.records_history (coll, id, data, op) values (old.coll, old.id, old.data, 'delete');
    return old;
  end if;
  return null;
end $$;
revoke all on function public.records_keep_history() from public, anon, authenticated;

drop trigger if exists records_history_trg on public.records;
create trigger records_history_trg before update or delete on public.records
  for each row execute function public.records_keep_history();

-- Busy collections (card opens, sign-in locks) change constantly; their history is not useful.
create or replace function public.records_history_skip_noise() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.coll in ('opens', 'locks') then return null; end if;
  return new;
end $$;
revoke all on function public.records_history_skip_noise() from public, anon, authenticated;
drop trigger if exists records_history_skip on public.records_history;
create trigger records_history_skip before insert on public.records_history
  for each row execute function public.records_history_skip_noise();

-- 3) Private storage for the training PDFs: PDF only, 20 MB max, never public.
--    Staff only ever get a link that works for 5 minutes, made by the server after checking their access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

-- No storage policies are created on purpose: the browser cannot list, read or write files directly.

-- 4) Quick check — you should see: records | true  and  records_history | true
select relname as "table", relrowsecurity as "protected"
from pg_class where relname in ('records', 'records_history') order by 1;
