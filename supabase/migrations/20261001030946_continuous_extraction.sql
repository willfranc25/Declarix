-- Hosted Supabase only: pg_cron, pg_net and Vault are not available in PGlite.
-- This dispatches eligible jobs to the existing Vercel worker once per minute.
-- It does not change or rewrite existing extraction jobs or invoices.
begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $setup$
begin
  if not exists (
    select 1 from vault.secrets where name = 'declarix_dispatch_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'declarix_dispatch_key',
      'Signs scheduled Declarix extraction dispatches'
    );
  end if;
end
$setup$;

create or replace function public.verify_background_dispatch(
  p_timestamp text,
  p_signature text
) returns boolean
language plpgsql security definer set search_path = ''
as $verify$
declare
  dispatch_key text;
begin
  if p_timestamp is null or p_timestamp !~ '^[0-9]{10}$'
     or p_signature is null or p_signature !~ '^[0-9a-f]{64}$'
     or abs(extract(epoch from clock_timestamp()) - p_timestamp::numeric) > 300
  then
    return false;
  end if;

  select decrypted_secret into dispatch_key
  from vault.decrypted_secrets
  where name = 'declarix_dispatch_key';

  return dispatch_key is not null and
    encode(extensions.hmac(p_timestamp, dispatch_key, 'sha256'), 'hex') = p_signature;
end
$verify$;

revoke all on function public.verify_background_dispatch(text, text)
  from public, anon, authenticated;
grant execute on function public.verify_background_dispatch(text, text)
  to service_role;

select cron.schedule(
  'declarix-extraction-every-minute',
  '* * * * *',
  $dispatch$
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
    );
  $dispatch$
);

commit;
