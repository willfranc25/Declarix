-- Preserve existing originals and ownership/quota checks; only expand image sizes.
alter table public.extraction_jobs drop constraint extraction_jobs_file_bytes_check;
alter table public.extraction_jobs add constraint extraction_jobs_file_bytes_check
  check(file_bytes between 1 and case when mime_type in ('image/jpeg','image/png','image/webp') then 52428800 else 20971520 end);
create or replace function public.prepare_extraction(p_user uuid,p_company uuid,p_id uuid,p_name text,p_mime text,p_bytes bigint)
returns public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare a public.accountant_accounts; j public.extraction_jobs; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 if a.user_id is null or a.status='suspended' then raise exception 'ACCOUNT_DISABLED'; end if;
 if not exists(select 1 from public.organizations where id=p_company and accountant_id=p_user and not archived) then raise exception 'COMPANY_FORBIDDEN'; end if;
 if p_mime not in ('image/jpeg','image/png','image/webp','application/pdf','application/xml','text/xml') or p_bytes<1 or
    p_bytes>(case when p_mime in ('image/jpeg','image/png','image/webp') then 52428800 else 20971520 end) then raise exception 'INVALID_FILE'; end if;
 if a.storage_bytes+p_bytes>a.storage_limit_bytes then raise exception 'STORAGE_LIMIT'; end if;
 if (select count(*) from public.extraction_jobs where user_id=p_user and status in ('uploading','cancelled') and cleaned_at is null)>=20 then raise exception 'UPLOAD_LIMIT'; end if;
 insert into public.extraction_jobs(id,user_id,organization_id,object_path,filename,mime_type,file_bytes)
 values(p_id,p_user,p_company,p_user::text||'/'||p_company::text||'/'||p_id::text,p_name,p_mime,p_bytes) returning * into j;
 update public.accountant_accounts set storage_bytes=storage_bytes+p_bytes where user_id=p_user;
 return j;
end $$;
update storage.buckets set file_size_limit=52428800 where id='documents';

-- Keep a private before/after record and account for the provider calls.
create table private.identifier_repairs (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.extraction_jobs(id) on delete cascade,
 before_result jsonb not null, after_result jsonb not null, applied boolean not null,
 metrics jsonb not null, created_at timestamptz not null default now()
);
alter table private.identifier_repairs enable row level security;
revoke all on private.identifier_repairs from public,anon,authenticated;
grant all on private.identifier_repairs to service_role;
create function public.identifier_repair_control() returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('paused',paused,'budget_day',budget_day,'spent_today',spent_today,
   'reserved_usd',reserved_usd,'attempt_reservation_usd',attempt_reservation_usd,'daily_budget_usd',daily_budget_usd)
 from private.ai_control where id
$$;
revoke all on function public.identifier_repair_control() from public,anon,authenticated;
grant execute on function public.identifier_repair_control() to service_role;
create function public.commit_identifier_repair(p_job uuid,p_expected jsonb,p_result jsonb,p_metrics jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare applied boolean; cost numeric; begin
 cost:=coalesce((p_metrics->>'estimatedUsd')::numeric,0.50);
 if cost<0 or cost>10 or jsonb_typeof(p_result->'documents') is distinct from 'array' then raise exception 'INVALID_REPAIR'; end if;
 if jsonb_array_length(p_result->'documents')<>1 then raise exception 'INVALID_REPAIR'; end if;
 update public.extraction_jobs set result=p_result,updated_at=clock_timestamp()
 where id=p_job and status='ready' and result=p_expected
   and not exists(select 1 from public.invoices where source_job_id=p_job);
 applied:=found;
 insert into private.identifier_repairs(job_id,before_result,after_result,applied,metrics)
 values(p_job,p_expected,p_result,applied,p_metrics);
 update private.ai_control set spent_today=(case when budget_day=current_date then spent_today else 0 end)+cost,budget_day=current_date where id;
 return applied;
end $$;
revoke all on function public.commit_identifier_repair(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_identifier_repair(uuid,jsonb,jsonb,jsonb) to service_role;
