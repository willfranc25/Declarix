begin;

create table if not exists public.storage_failure_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid,
  stage text not null check (stage in ('image_upload', 'invoice_insert', 'image_metadata_update')),
  error_code text not null check (error_code ~ '^[A-Za-z0-9_-]{1,40}$'),
  created_at timestamptz not null default now()
);

create index if not exists storage_failure_events_company_created_idx
  on public.storage_failure_events (organization_id, created_at desc);

alter table public.storage_failure_events enable row level security;

drop policy if exists storage_failure_events_read on public.storage_failure_events;
create policy storage_failure_events_read
  on public.storage_failure_events for select to authenticated
  using (private.owns_company(organization_id));

drop policy if exists storage_failure_events_insert on public.storage_failure_events;
create policy storage_failure_events_insert
  on public.storage_failure_events for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_edit_company(organization_id));

grant select, insert on public.storage_failure_events to authenticated;
revoke update, delete, truncate, references, trigger on public.storage_failure_events from anon, authenticated;
grant all on public.storage_failure_events to service_role;

commit;
