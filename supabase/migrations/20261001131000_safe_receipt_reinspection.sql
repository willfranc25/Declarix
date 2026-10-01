-- Keep the previous extraction so a focused reinspection can be restored.
create table private.extraction_reinspection_backups (
  job_id uuid primary key references public.extraction_jobs(id) on delete cascade,
  original_result jsonb not null,
  original_review jsonb not null,
  captured_at timestamptz not null default now()
);
revoke all on private.extraction_reinspection_backups from public, anon, authenticated;
grant select, insert on private.extraction_reinspection_backups to service_role;

create function private.queue_ready_reinspection(p_job uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare j public.extraction_jobs; owner_id uuid;
begin
  select user_id into owner_id from public.extraction_jobs where id = p_job;
  if owner_id is null then return false; end if;
  perform user_id from public.accountant_accounts where user_id = owner_id for update;
  select * into j from public.extraction_jobs where id = p_job for update;
  if j.status <> 'ready' or j.review <> '{}'::jsonb or j.result is null
     or exists(select 1 from public.invoices where source_job_id = p_job) then
    return false;
  end if;
  insert into private.extraction_reinspection_backups(job_id, original_result, original_review)
  values(j.id, j.result, j.review) on conflict(job_id) do nothing;
  update public.accountant_accounts set reserved = reserved + j.pages where user_id = owner_id;
  update public.extraction_jobs set status = 'queued', pages_reserved = pages,
    attempts = 0, available_at = now(), error_code = null, error_message = null,
    updated_at = now() where id = p_job;
  return true;
end $$;
revoke all on function private.queue_ready_reinspection(uuid) from public, anon, authenticated;
grant execute on function private.queue_ready_reinspection(uuid) to service_role;

create function private.restore_ready_reinspection(p_job uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare j public.extraction_jobs; owner_id uuid; backup private.extraction_reinspection_backups;
begin
  select user_id into owner_id from public.extraction_jobs where id = p_job;
  if owner_id is null then return false; end if;
  perform user_id from public.accountant_accounts where user_id = owner_id for update;
  select * into j from public.extraction_jobs where id = p_job for update;
  select * into backup from private.extraction_reinspection_backups where job_id = p_job;
  if backup.job_id is null or j.status not in ('queued', 'failed')
     or j.review <> backup.original_review
     or exists(select 1 from public.invoices where source_job_id = p_job) then
    return false;
  end if;
  update public.accountant_accounts set reserved = greatest(0, reserved - j.pages_reserved)
  where user_id = owner_id;
  update public.extraction_jobs set status = 'ready', result = backup.original_result,
    review = backup.original_review, pages_reserved = 0, error_code = null,
    error_message = null, lease_until = null, lease_token = null,
    updated_at = now() where id = p_job;
  return true;
end $$;
revoke all on function private.restore_ready_reinspection(uuid) from public, anon, authenticated;
grant execute on function private.restore_ready_reinspection(uuid) to service_role;
