-- Read-only operations dashboard. Run with an operator's database access.
-- uploaded waits for explicit confirmation; ready waits for review, not extraction.
select status,count(*),min(created_at) oldest,min(updated_at) oldest_update,
 sum(pages_reserved) reserved_pages
from public.extraction_jobs group by status;
select date_trunc('day',created_at) day,model,outcome,count(*) attempts,
 sum(estimated_usd) estimated_usd,avg(duration_ms) avg_ms,
 sum(prompt_tokens) input_tokens,sum(output_tokens) billable_output_tokens,
 sum(thinking_tokens) reasoning_tokens_included_in_output
from public.extraction_attempts group by 1,2,3 order by 1 desc;
select reserved,storage_bytes,storage_limit_bytes,status,count(*)
from public.accountant_accounts group by 1,2,3,4;
select * from private.ai_control;
-- A timed-out call may have been billed without returned token counts.
select count(*) uncertain_attempts from public.extraction_attempts
where outcome in ('WORKER_TIMEOUT','PROVIDER_TIMEOUT') and prompt_tokens=0;

-- Quota accounting and physical bucket usage are different limits.
select a.user_id,a.storage_bytes,a.storage_limit_bytes,
 a.storage_limit_bytes-a.storage_bytes available_bytes,
 round(100.0*a.storage_bytes/nullif(a.storage_limit_bytes,0),2) quota_used_percent,
 a.reserved,coalesce(j.reserved,0) job_reserved,
 a.reserved=coalesce(j.reserved,0) reservations_match
from public.accountant_accounts a
left join (select user_id,sum(pages_reserved) reserved from public.extraction_jobs group by user_id) j using(user_id);
select bucket_id,count(*) objects,sum(coalesce((metadata->>'size')::bigint,0)) bytes
from storage.objects group by bucket_id;
select j.status,count(*) jobs,count(o.id) original_objects,
 count(*) filter(where o.id is null) missing_original_objects,
 count(*) filter(where j.file_bytes<>(o.metadata->>'size')::bigint) size_mismatches
from public.extraction_jobs j
left join storage.objects o on o.bucket_id='documents' and o.name=j.object_path
where j.cleaned_at is null and j.status not in ('cancelled','uploading')
group by j.status;

-- A saved job may be explicitly dismissed; do not classify it as data loss.
select j.status,count(*) jobs,
 count(*) filter(where exists(select 1 from public.invoices i where i.source_job_id=j.id)) linked_jobs,
 count(*) filter(where j.status='saved' and not exists(
   select 1 from jsonb_array_elements(j.result->'documents') with ordinality d(value,n)
   where coalesce(j.review->((d.n-1)::text)->>'_dismissed','false')<>'true'
   and not exists(select 1 from public.invoices i where i.source_job_id=j.id and i.source_index=d.n-1)
 )) accounted_jobs
from public.extraction_jobs j group by j.status;

-- A successful cron poll does not prove an HTTP request or provider completion.
select jobname,schedule,active from cron.job where jobname like 'declarix%';
select j.jobname,r.status,count(*) polls,max(r.start_time) latest_start
from cron.job j join cron.job_run_details r using(jobid)
where j.jobname like 'declarix%' and r.start_time>now()-interval '1 day'
group by j.jobname,r.status;
-- Never select Vault values, dispatch headers, or provider credentials here.
