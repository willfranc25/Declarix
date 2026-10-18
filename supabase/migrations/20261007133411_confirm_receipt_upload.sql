-- Uploading an original does not authorize AI extraction. Existing jobs and
-- invoices keep their state; only new, verified uploads enter this extra step.
alter table public.extraction_jobs drop constraint extraction_jobs_status_check;
alter table public.extraction_jobs add constraint extraction_jobs_status_check
 check(status in ('uploading','uploaded','queued','processing','ready','failed','cancelled','saved'));

-- Retain the legacy RPC name so an older deployed/cached upload client stages
-- its file safely instead of automatically starting extraction.
create or replace function public.enqueue_extraction(p_user uuid,p_job uuid,p_hash text,p_pages integer)
returns public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare a public.accountant_accounts; j public.extraction_jobs; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 select * into j from public.extraction_jobs where id=p_job and user_id=p_user for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status<>'uploading' then return j; end if;
 if a.user_id is null or a.status='suspended' then raise exception 'ACCOUNT_DISABLED'; end if;
 if not exists(select 1 from public.organizations where id=j.organization_id and accountant_id=p_user and not archived) then raise exception 'COMPANY_FORBIDDEN'; end if;
 if p_pages is null or p_pages not between 1 and 100 then raise exception 'INVALID_PAGE_COUNT'; end if;
 if p_hash is null or length(p_hash)=0 then raise exception 'INVALID_FILE'; end if;
 update public.extraction_jobs set status='uploaded',content_hash=p_hash,pages=p_pages,updated_at=now() where id=j.id returning * into j;
 return j;
end $$;

-- One atomic, idempotent confirmation for an explicit snapshot of this company.
-- Locks follow the same account -> job order used by upload/cancel/finish.
create function public.start_uploaded_extractions(p_user uuid,p_company uuid,p_jobs uuid[])
returns integer language plpgsql security invoker set search_path='' as $$
declare a public.accountant_accounts; j public.extraction_jobs; ids uuid[]; n integer=0; begin
 if p_jobs is null or cardinality(p_jobs) not between 1 and 1000 or array_position(p_jobs,null) is not null then raise exception 'INVALID_BATCH'; end if;
 select array_agg(distinct id) into ids from unnest(p_jobs) id;
 select * into a from public.accountant_accounts where user_id=p_user for update;
 if a.user_id is null or a.status='suspended' then raise exception 'ACCOUNT_DISABLED'; end if;
 if not exists(select 1 from public.organizations where id=p_company and accountant_id=p_user and not archived) then raise exception 'COMPANY_FORBIDDEN'; end if;
 perform id from public.extraction_jobs where id=any(ids) and user_id=p_user and organization_id=p_company order by id for update;
 if (select count(*) from public.extraction_jobs where id=any(ids) and user_id=p_user and organization_id=p_company)<>cardinality(ids) then raise exception 'JOB_NOT_FOUND'; end if;
 for j in select * from public.extraction_jobs where id=any(ids) order by id loop
  if j.status in ('uploading','cancelled') then raise exception 'JOB_NOT_UPLOADED'; end if;
  if j.status='uploaded' then
   if j.content_hash is null or j.pages not between 1 and 100 then raise exception 'JOB_NOT_UPLOADED'; end if;
   update public.accountant_accounts set reserved=reserved+j.pages where user_id=p_user;
   update public.extraction_jobs set status='queued',pages_reserved=j.pages,available_at=now(),updated_at=now() where id=j.id;
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;
revoke all on function public.enqueue_extraction(uuid,uuid,text,integer),public.start_uploaded_extractions(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.enqueue_extraction(uuid,uuid,text,integer),public.start_uploaded_extractions(uuid,uuid,uuid[]) to service_role;
