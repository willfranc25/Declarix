-- Accountant subscriptions: monthly included processing units (pages/DTEs).
-- Prices deliberately remain unset until a pilot establishes support and infrastructure costs.
begin;

create table public.subscription_plans (
  code text primary key,
  name text not null,
  monthly_units integer not null check (monthly_units between 1 and 1000000),
  company_limit integer not null check (company_limit between 1 and 10000),
  price_clp integer check (price_clp is null or price_clp >= 0),
  active boolean not null default true
);
insert into public.subscription_plans(code,name,monthly_units,company_limit,price_clp) values
 ('trial','Prueba',30,3,0),
 ('inicio','Inicio',300,5,null),
 ('estudio','Estudio',2000,25,null),
 ('firma','Firma',8000,100,null);
alter table public.subscription_plans enable row level security;
create policy subscription_plans_read on public.subscription_plans for select to authenticated using(active);
grant select on public.subscription_plans to authenticated;
grant all on public.subscription_plans to service_role;

alter table public.accountant_accounts
 add column plan_code text not null default 'trial' references public.subscription_plans(code),
 add column monthly_limit integer not null default 30 check(monthly_limit >= 0),
 add column monthly_used integer not null default 0 check(monthly_used >= 0),
 add column period_start timestamptz not null default now(),
 add column period_end timestamptz not null default (now() + interval '30 days'),
 add column subscription_status text not null default 'trialing' check(subscription_status in ('trialing','active','past_due','canceled','suspended')),
 add column billing_provider text check(billing_provider in ('mercadopago','manual')),
 add column billing_subscription_id text;
update public.accountant_accounts set monthly_limit=30, monthly_used=0,
 period_start=now(), period_end=now()+interval '30 days', plan_code='trial',subscription_status='trialing';
create unique index accountant_billing_subscription_key on public.accountant_accounts(billing_provider,billing_subscription_id) where billing_subscription_id is not null;

create function private.enforce_company_limit() returns trigger language plpgsql security invoker set search_path='' as $$
declare lim integer; current_count integer; begin
 select p.company_limit into lim from public.accountant_accounts a join public.subscription_plans p on p.code=a.plan_code where a.user_id=new.accountant_id;
 select count(*) into current_count from public.organizations where accountant_id=new.accountant_id and not archived;
 if tg_op='INSERT' and current_count>=lim then raise exception 'PLAN_COMPANY_LIMIT'; end if;
 if tg_op='UPDATE' and old.archived and not new.archived and current_count>=lim then raise exception 'PLAN_COMPANY_LIMIT'; end if;
 return new;
end $$;
create trigger enforce_company_limit before insert or update of archived on public.organizations for each row execute function private.enforce_company_limit();

-- Reserve capacity atomically before processing and charge only successful jobs.
create or replace function public.enqueue_extraction(p_user uuid,p_job uuid,p_hash text,p_pages integer) returns public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare a public.accountant_accounts; j public.extraction_jobs; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 if a.period_end<=now() then
  update public.accountant_accounts set subscription_status='suspended',status='suspended' where user_id=p_user;
  raise exception 'SUBSCRIPTION_REQUIRED';
 end if;
 select * into a from public.accountant_accounts where user_id=p_user;
 select * into j from public.extraction_jobs where id=p_job and user_id=p_user for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status<>'uploading' then return j; end if;
 if a.status='suspended' or a.subscription_status in ('past_due','canceled','suspended') or p_pages not between 1 and 100 or a.monthly_limit-a.monthly_used-a.reserved<p_pages then raise exception 'MONTHLY_LIMIT_REACHED'; end if;
 update public.accountant_accounts set reserved=reserved+p_pages where user_id=p_user;
 update public.extraction_jobs set status='queued',content_hash=p_hash,pages=p_pages,credits_reserved=p_pages,updated_at=now() where id=j.id returning * into j;
 return j;
end $$;

create or replace function public.finish_extraction(p_job uuid,p_lease uuid,p_result jsonb,p_error text,p_retry_seconds integer,p_metrics jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; c private.ai_control; begin
 select * into c from private.ai_control where id for update;
 select * into j from public.extraction_jobs where id=p_job;
 if j.id is null then return false; end if;
 perform user_id from public.accountant_accounts where user_id=j.user_id for update;
 select * into j from public.extraction_jobs where id=p_job for update;
 if j.status<>'processing' or j.lease_token is distinct from p_lease then return false; end if;
 insert into public.extraction_attempts(job_id,user_id,organization_id,model,prompt_tokens,output_tokens,thinking_tokens,estimated_usd,duration_ms,outcome)
 values(j.id,j.user_id,j.organization_id,coalesce(p_metrics->>'model','unknown'),coalesce((p_metrics->>'promptTokens')::int,0),coalesce((p_metrics->>'outputTokens')::int,0),coalesce((p_metrics->>'thinkingTokens')::int,0),coalesce((p_metrics->>'estimatedUsd')::numeric,0),coalesce((p_metrics->>'durationMs')::int,0),case when p_result is not null then 'success' else coalesce(p_error,'unknown') end);
 update private.ai_control set reserved_usd=greatest(0,reserved_usd-c.attempt_reservation_usd),spent_today=spent_today+coalesce((p_metrics->>'estimatedUsd')::numeric,c.attempt_reservation_usd) where id;
 if p_result is not null then
  update public.accountant_accounts set reserved=reserved-j.credits_reserved,monthly_used=monthly_used+j.credits_reserved where user_id=j.user_id;
  insert into public.credit_ledger(user_id,job_id,amount,kind,reference) values(j.user_id,j.id,-j.credits_reserved,'consume',j.id::text) on conflict do nothing;
  update public.extraction_jobs set status='ready',result=p_result,credits_reserved=0,lease_until=null,error_code=null,error_message=null,updated_at=now() where id=j.id;
 elsif p_retry_seconds is not null and j.attempts<4 then
  update public.extraction_jobs set status='queued',available_at=now()+make_interval(secs=>greatest(1,p_retry_seconds)),lease_until=null,error_code=p_error,updated_at=now() where id=j.id;
 else
  update public.accountant_accounts set reserved=reserved-j.credits_reserved where user_id=j.user_id;
  update public.extraction_jobs set status='failed',credits_reserved=0,lease_until=null,error_code=p_error,error_message='No se pudo procesar. Puedes reintentar o cargar un archivo más legible.',updated_at=now() where id=j.id;
 end if;
 return true;
end $$;

create or replace function public.retry_extraction(p_user uuid,p_job uuid) returns void language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; a public.accountant_accounts; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 select * into j from public.extraction_jobs where id=p_job and user_id=p_user for update;
 if j.id is null or j.status<>'failed' or j.attempts>=8 then raise exception 'JOB_NOT_FOUND'; end if;
 if not exists(select 1 from public.organizations where id=j.organization_id and accountant_id=p_user and not archived) then raise exception 'COMPANY_FORBIDDEN'; end if;
 if a.status='suspended' or a.subscription_status in ('past_due','canceled','suspended') or a.monthly_limit-a.monthly_used-a.reserved<j.pages then raise exception 'MONTHLY_LIMIT_REACHED'; end if;
 update public.accountant_accounts set reserved=reserved+j.pages where user_id=p_user;
 update public.extraction_jobs set status='queued',credits_reserved=pages,available_at=now(),error_code=null,error_message=null,updated_at=now() where id=j.id;
end $$;

-- Called only by the trusted billing backend after payment reconciliation.
create table public.billing_webhook_events (
 provider_event_id text primary key,
 received_at timestamptz not null default now(),
 processed_at timestamptz,
 outcome text
);
alter table public.billing_webhook_events enable row level security;
grant all on public.billing_webhook_events to service_role;
revoke all on public.billing_webhook_events from public,anon,authenticated;

create function public.apply_subscription_event(p_user uuid,p_plan text,p_status text,p_provider text,p_subscription_id text,p_period_start timestamptz,p_period_end timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare quota integer; begin
 if p_status not in ('trialing','active','past_due','canceled','suspended') or p_provider not in ('mercadopago','manual') or p_period_end<=p_period_start then raise exception 'Invalid subscription event'; end if;
 select monthly_units into quota from public.subscription_plans where code=p_plan and active;
 if quota is null then raise exception 'Unknown plan'; end if;
 update public.accountant_accounts set plan_code=p_plan,monthly_limit=quota,subscription_status=p_status,
  status=case when p_status in ('past_due','canceled','suspended') then 'suspended' else 'active' end,
  billing_provider=p_provider,billing_subscription_id=p_subscription_id,period_start=p_period_start,period_end=p_period_end,
  monthly_used=case when accountant_accounts.period_start<>p_period_start then 0 else accountant_accounts.monthly_used end
 where user_id=p_user;
 if not found then raise exception 'Account not found'; end if;
end $$;
revoke all on function public.apply_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
drop function public.topup_credits(uuid,integer,text);

create or replace function public.claim_extraction() returns setof public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare c private.ai_control; j public.extraction_jobs; begin
 select * into c from private.ai_control where id for update;
 if c.budget_day<>current_date then update private.ai_control set budget_day=current_date,spent_today=0 where id; c.spent_today=0; end if;
 if c.paused or c.next_start>now() or c.spent_today+c.reserved_usd+c.attempt_reservation_usd>c.daily_budget_usd then return; end if;
 if (select count(*) from public.extraction_jobs where status='processing' and lease_until>now())>=c.max_concurrent then return; end if;
 select * into j from public.extraction_jobs q where status='queued' and available_at<=now() and exists(select 1 from public.accountant_accounts a where a.user_id=q.user_id and a.status<>'suspended' and a.subscription_status in ('trialing','active') and a.period_end>now()) and exists(select 1 from public.organizations o where o.id=q.organization_id and not o.archived)
 order by coalesce((select d.last_started from private.account_dispatch d where d.user_id=q.user_id),'-infinity'::timestamptz),available_at,created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 insert into private.account_dispatch(user_id,last_started) values(j.user_id,now()) on conflict(user_id) do update set last_started=excluded.last_started;
 update private.ai_control set next_start=now()+make_interval(secs=>c.min_interval_seconds),reserved_usd=reserved_usd+c.attempt_reservation_usd where id;
 return query update public.extraction_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=j.id returning *;
end $$;

commit;
