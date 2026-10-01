-- The browser can close while Supabase keeps dispatching queued documents.
-- Reuse the signed command from the previous migration and dispatch every 10 seconds.
do $dispatch$
declare
  old_job bigint;
  old_command text;
begin
  select jobid, command into old_job, old_command
  from cron.job
  where jobname = 'declarix-extraction-every-minute';
  if old_job is null then
    raise exception 'Declarix minute dispatch job is missing';
  end if;
  perform cron.schedule(
    'declarix-extraction-every-10-seconds',
    '10 seconds',
    old_command
  );
  perform cron.unschedule(old_job);
end
$dispatch$;

-- pg_cron records every poll, including empty-queue polls. Bound that history.
select cron.schedule(
  'declarix-prune-cron-history',
  '0 3 * * *',
  $cleanup$
    delete from cron.job_run_details
    where end_time < now() - interval '7 days'
      and jobid in (
        select jobid from cron.job
        where jobname in (
          'declarix-extraction-every-10-seconds',
          'declarix-prune-cron-history'
        )
      );
  $cleanup$
);
