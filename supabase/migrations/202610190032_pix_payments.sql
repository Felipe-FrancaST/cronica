-- 032: single-period Pix payments, verified by the server using Mercado Pago.
-- CPF and QR codes are not stored. Existing recurring subscriptions are preserved.
begin;
alter table public.billing_contracts add column if not exists payment_method text not null default 'recurring' check (payment_method in ('recurring','pix'));
alter table public.billing_contracts add column if not exists payment_expires_at timestamptz;
alter table public.billing_payments add column if not exists payment_method text not null default 'recurring' check (payment_method in ('recurring','pix'));
alter table public.billing_contracts drop constraint if exists billing_contracts_status_check;
alter table public.billing_contracts add constraint billing_contracts_status_check check (status in ('creating','uncertain','pending','authorized','paused','cancelled','failed','completed','expired'));

create or replace function public.billing_begin_pix(
 p_user_id uuid,p_plan_id uuid,p_scope text,p_request_id uuid,p_plan_version integer,p_payer_email text,p_consent boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.billing_contracts;p public.billing_plans;s public.site_billing_settings;
begin
 perform 1 from public.profiles where id=p_user_id for update;
 if not found or not private.billing_account_allowed(p_user_id) then
  raise exception 'Sua conta não pode iniciar um pagamento neste momento.' using errcode='42501';
 end if;
 select * into s from public.site_billing_settings where id=1;
 if p_scope not in ('master','player') or p_request_id is null or not coalesce(p_consent,false) then
  raise exception 'Confira o plano e confirme o pagamento único por Pix.';
 end if;
 if not s.billing_enabled or not (case when p_scope='master' then s.require_master else s.require_player end) then
  raise exception 'Este acesso está gratuito. Nenhum pagamento é necessário.';
 end if;
 if p_payer_email is null or length(p_payer_email)>254 or p_payer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Informe um e-mail válido para o pagamento.';
 end if;
 select * into c from public.billing_contracts where id=p_request_id;
 if c.id is not null then
  if c.user_id<>p_user_id or c.plan_id<>p_plan_id or c.scope<>p_scope or c.payment_method<>'pix' then
   raise exception 'Este pedido já pertence a outro pagamento.' using errcode='40001';
  end if;
  return jsonb_build_object('contract',to_jsonb(c),'create',false);
 end if;
 select * into c from public.billing_contracts where user_id=p_user_id and status in ('creating','uncertain','pending','authorized','paused') order by created_at desc limit 1;
 if c.id is not null then
  if c.payment_method<>'pix' or c.plan_id<>p_plan_id or c.scope<>p_scope or (c.plan_snapshot->>'version')::integer<>p_plan_version then
   raise exception 'Já existe um pagamento ou uma assinatura em andamento. Confira ou cancele o pedido atual antes de trocar.' using errcode='40001';
  end if;
  return jsonb_build_object('contract',to_jsonb(c),'create',false);
 end if;
 if private.billing_access_until(p_user_id,p_scope)>now() then
  raise exception 'Seu período pago ainda está ativo. Você poderá renovar após a data indicada.' using errcode='40001';
 end if;
 select * into p from public.billing_plans where id=p_plan_id and active for share;
 if p.id is null or not p_scope=any(p.scopes) then raise exception 'Escolha um plano disponível para este acesso.';end if;
 if p.version is distinct from p_plan_version then
  raise exception 'O plano mudou. Atualize a página e confira o novo valor antes de pagar.' using errcode='40001';
 end if;
 insert into public.billing_contracts(id,user_id,plan_id,plan_snapshot,scope,payer_email,settings_version,payment_method,payment_expires_at)
 values(p_request_id,p_user_id,p.id,to_jsonb(p),p_scope,lower(trim(p_payer_email)),s.version,'pix',clock_timestamp()+interval '24 hours') returning * into c;
 return jsonb_build_object('contract',to_jsonb(c),'create',true);
end $$;

create or replace function public.billing_store_pix(p_contract_id uuid,p_payment jsonb,p_status text,p_expires_at timestamptz)
returns public.billing_contracts language plpgsql security definer set search_path='' as $$
declare c public.billing_contracts;changed timestamptz=(p_payment->>'provider_updated_at')::timestamptz;deleting boolean;
begin
 perform 1 from public.profiles where id=(select user_id from public.billing_contracts where id=p_contract_id) for update;
 if not found then return null;end if;
 select * into c from public.billing_contracts where id=p_contract_id for update;
 if c.id is null or c.payment_method<>'pix' or p_status not in ('pending','completed','cancelled','expired','failed')
  or p_payment->>'provider_payment_id' is null or p_payment->>'provider_payment_id' !~ '^[0-9]{1,30}$'
  or p_payment->>'invoice_id' is distinct from p_payment->>'provider_payment_id'
  or (p_payment->>'amount_cents')::integer is distinct from (c.plan_snapshot->>'amount_cents')::integer
  or changed is null then raise exception 'O Pix não corresponde à contratação.';end if;
 if c.provider_id is not null and c.provider_id<>p_payment->>'provider_payment_id' then
  raise exception 'A referência deste Pix não pode ser substituída.';
 end if;
 if c.provider_updated_at>changed then return c;end if;
 deleting=private.account_is_deleting(c.user_id);
 if deleting and p_status='pending' then return c;end if;
 -- A cancelled code must never reopen and collide with a newer checkout.
 if c.status in ('cancelled','expired','failed','completed') and p_status='pending' then return c;end if;
 update public.billing_contracts set provider_id=p_payment->>'provider_payment_id',status=p_status,
  payment_expires_at=coalesce(p_expires_at,payment_expires_at),provider_updated_at=changed,
  next_payment_at=null,checkout_url=null,error_code=null,last_synced_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=c.id returning * into c;
 if not deleting then
  perform public.billing_store_payment(c.id,p_payment);
  update public.billing_payments set payment_method='pix' where provider_payment_id=c.provider_id and contract_id=c.id;
 end if;
 return c;
end $$;

create or replace function public.billing_pix_error(p_id uuid,p_code text,p_definitive boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=(select user_id from public.billing_contracts where id=p_id) for update;
 if not found or private.account_is_deleting((select user_id from public.billing_contracts where id=p_id)) then return;end if;
 update public.billing_contracts set status=case when p_definitive then 'failed' else 'uncertain' end,
  error_code=left(p_code,200),updated_at=clock_timestamp()
 where id=p_id and payment_method='pix' and provider_id is null and status in ('creating','uncertain');
end $$;

-- No QR code is returned until its provider ID has been stored. Closing an unbound
-- request prevents an in-flight response from publishing a code after cancellation.
create or replace function public.billing_cancel_uncreated_pix(p_id uuid)
returns public.billing_contracts language plpgsql security definer set search_path='' as $$
declare c public.billing_contracts;begin
 perform 1 from public.profiles where id=(select user_id from public.billing_contracts where id=p_id) for update;
 if not found then return null;end if;
 update public.billing_contracts set status='cancelled',error_code=null,updated_at=clock_timestamp()
 where id=p_id and payment_method='pix' and provider_id is null and status in ('creating','uncertain') returning * into c;
 if c.id is null then select * into c from public.billing_contracts where id=p_id;end if;
 return c;
end $$;

-- Explicitly reject a recurring checkout while the current request is a Pix.
do $$ declare f record;body text;begin
 select oid,prosrc into f from pg_proc where oid='public.billing_begin_checkout(uuid,uuid,text,uuid,integer,text,boolean)'::regprocedure;
 if position('c.payment_method' in f.prosrc)=0 then
  body=replace(f.prosrc,'if c.id is not null then','if c.id is not null then
   if c.payment_method<>''recurring'' then raise exception ''Já existe um Pix para este pedido. Confira ou cancele o pagamento atual.'' using errcode=''40001'';end if;');
  execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end if;
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('billing_begin_pix','billing_store_pix','billing_pix_error','billing_cancel_uncreated_pix') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
commit;
