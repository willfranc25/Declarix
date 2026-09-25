-- Read-only operations dashboard. Run with an operator's database access.
select status,count(*),min(created_at) oldest from public.extraction_jobs group by status;
select date_trunc('day',created_at) day,model,outcome,count(*) attempts,
 sum(estimated_usd) estimated_usd,avg(duration_ms) avg_ms,
 sum(prompt_tokens) input_tokens,sum(output_tokens+thinking_tokens) billable_output_tokens
from public.extraction_attempts group by 1,2,3 order by 1 desc;
select reserved,storage_bytes,storage_limit_bytes,status,count(*)
from public.accountant_accounts group by 1,2,3,4;
select * from private.ai_control;
-- A timed-out call may have been billed without returned token counts.
select count(*) uncertain_attempts from public.extraction_attempts
where outcome in ('WORKER_TIMEOUT','PROVIDER_TIMEOUT') and prompt_tokens=0;
