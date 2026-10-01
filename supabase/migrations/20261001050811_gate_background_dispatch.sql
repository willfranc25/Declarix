-- Avoid waking Vercel while extraction is paused, pacing, or out of budget.
do $gate$
declare
  dispatch_job bigint;
begin
  select jobid into dispatch_job
  from cron.job
  where jobname = 'declarix-extraction-every-10-seconds';
  if dispatch_job is null then
    raise exception 'Declarix dispatch job is missing';
  end if;
  perform cron.alter_job(
    dispatch_job,
    command := $command$
      select net.http_get(
        url := 'https://declarix.vercel.app/api/process-jobs',
        headers := jsonb_build_object(
          'X-Dispatch-Timestamp', dispatch.stamp,
          'X-Dispatch-Signature',
            encode(extensions.hmac(dispatch.stamp, dispatch.secret, 'sha256'), 'hex')
        ),
        timeout_milliseconds := 55000
      )
      from (
        select extract(epoch from clock_timestamp())::bigint::text as stamp,
               decrypted_secret as secret
        from vault.decrypted_secrets
        where name = 'declarix_dispatch_key'
      ) dispatch
      where exists (
        select 1 from public.extraction_jobs
        where (status = 'queued' and available_at <= now())
           or (status = 'processing' and lease_until <= now())
      )
      and exists (
        select 1 from private.ai_control c
        where c.id and not c.paused
          and c.next_start <= now()
          and (
            c.budget_day <> current_date
            or c.spent_today + c.reserved_usd + c.attempt_reservation_usd
               <= c.daily_budget_usd
          )
      );
    $command$
  );
end
$gate$;
