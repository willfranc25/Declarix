-- Additive: existing receipts and originals remain unchanged. No RLS changes.
alter table public.invoices add column if not exists "rutConfirmation" jsonb;
comment on column public.invoices."rutConfirmation" is 'Printed RUT confirmed manually despite checksum mismatch; exact value, actor and server timestamp. Not tax validation.';

create or replace function private.invoice_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare target public.invoices; printed_rut text; actor uuid; begin
 if tg_op='DELETE' then target=old; else target=new; end if;
 if tg_op='UPDATE' and old.organization_id is not null and (new.organization_id is distinct from old.organization_id or new.user_id<>old.user_id or new.id<>old.id) then raise exception 'No se puede reasignar el propietario o la empresa de un comprobante'; end if;
 if tg_op='UPDATE' and (new.source_job_id is distinct from old.source_job_id or new.source_index is distinct from old.source_index) then raise exception 'No se puede cambiar el origen'; end if;
 -- Lock company row to serialize closing a period with invoice mutations.
 perform id from public.organizations where id=target.organization_id for update;
 if exists(select 1 from public.period_closures where organization_id=target.organization_id and period=left(target.date,7)) or
   (tg_op='UPDATE' and exists(select 1 from public.period_closures where organization_id=old.organization_id and period=left(old.date,7))) then raise exception 'El período está cerrado. Reábrelo antes de modificar comprobantes'; end if;
 if tg_op<>'DELETE' then
  if new."totalAmount" is null or new."totalAmount"<=0 then raise exception 'El total debe ser positivo'; end if;
  if new.date is null or new.date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(new.date::date,'YYYY-MM-DD')<>new.date then raise exception 'Fecha inválida'; end if;
  if new.date::date > (now() at time zone 'America/Santiago')::date then raise exception 'Fecha futura'; end if;
  if new."documentType"='Comprobante de pago electrónico' then new."documentNumber"='0000'; end if;
  printed_rut=regexp_replace(upper(coalesce(new."providerRut",'')),'[.\s-]','','g');
  if not private.valid_rut(new."providerRut") then
   if printed_rut !~ '^[0-9]{7,8}[0-9K]$' or left(printed_rut,length(printed_rut)-1) ~ '^0+$' then raise exception 'RUT inválido o ausente'; end if;
   if new."rutConfirmation"->'confirmed' is distinct from 'true'::jsonb or new."rutConfirmation"->>'rut' is distinct from printed_rut then raise exception 'Confirma que el RUT coincide con el original antes de guardar'; end if;
   -- Bind the decision to this value; identity/time come from the server.
   if tg_op='INSERT' or new."rutConfirmation" is distinct from old."rutConfirmation" or printed_rut is distinct from regexp_replace(upper(old."providerRut"),'[.\s-]','','g') then
    actor=auth.uid();
    if actor is null or actor<>new.user_id then raise exception 'La confirmación requiere al propietario autenticado'; end if;
    new."rutConfirmation"=jsonb_build_object('rut',printed_rut,'confirmed',true,'by',actor,'at',clock_timestamp());
   end if;
  else new."rutConfirmation"=null;
  end if;
  if new."documentNumber" is null or btrim(new."documentNumber")='' then raise exception 'El folio es obligatorio'; end if;
  if least(new."netAmount",new."ivaAmount",new."specificTax",new."exemptAmount",new."otherTax",new."withholdingAmount")<0 then raise exception 'Los montos originales no pueden ser negativos'; end if;
  if exists(select 1 from public.invoices i where i.organization_id=new.organization_id and i.id<>new.id and not coalesce(i.deleted,false) and regexp_replace(upper(i."providerRut"),'[^0-9K]','','g')=regexp_replace(upper(new."providerRut"),'[^0-9K]','','g') and replace(i."documentType",' Electrónica','')=replace(new."documentType",' Electrónica','') and ((new."documentType"<>'Comprobante de pago electrónico' and ltrim(i."documentNumber",'0')=ltrim(new."documentNumber",'0')) or
 (new."documentType"='Comprobante de pago electrónico' and nullif(btrim(new."referenceNumber"),'') is not null
 and btrim(i."referenceNumber")=btrim(new."referenceNumber") and i.date=new.date and i."totalAmount"=new."totalAmount"))) then raise exception 'Ya existe ese emisor, tipo y folio en esta empresa'; end if;
  if new.source_job_id is not null then
   if tg_op='UPDATE' and (new.source_job_id is distinct from old.source_job_id or new.source_index is distinct from old.source_index) then raise exception 'No se puede cambiar el origen'; end if;
   select result->'documents'->new.source_index,object_path into new.extracted_original,new."imagePath" from public.extraction_jobs
   where id=new.source_job_id and organization_id=new.organization_id and user_id=new.user_id and status in ('ready','saved') and new.source_index>=0 and new.source_index<jsonb_array_length(result->'documents');
   if not found then raise exception 'Origen inválido'; end if;
  end if;
  if new."documentType" is null or btrim(new."expenseType")='' or new."expenseType" is null or btrim(new."providerName")='' or new."providerName" is null then raise exception 'Completa proveedor, documento y categoría'; end if;
  if new."documentType" ~* 'factura|nota de cr[eé]dito|nota de d[eé]bito' and
    (new."netAmount" is null or new."ivaAmount" is null or abs(coalesce(new."netAmount",0)+coalesce(new."exemptAmount",0)+coalesce(new."ivaAmount",0)+coalesce(new."specificTax",0)+coalesce(new."otherTax",0)-coalesce(new."withholdingAmount",0)-new."totalAmount")>2) then raise exception 'Los montos no cuadran con el total'; end if;
  if new."taxStatus"='declared' then new.declared_at=coalesce(new.declared_at,now()); end if;
  if tg_op='UPDATE' then new."updatedAt"=clock_timestamp(); end if;
  target=new;
 end if;
 return target;
end $$;
