-- 029: site administration and verified Mercado Pago subscriptions.
-- No card data or provider secrets are stored in public tables.
begin;
create table if not exists public.site_billing_settings (
 id smallint primary key default 1 check(id=1),site_name text not null default 'Crônica' check(length(site_name) between 1 and 80),
 billing_enabled boolean not null default true,require_master boolean not null default true,require_player boolean not null default false,
 maintenance boolean not null default false,maintenance_message text not null default 'Estamos preparando o próximo capítulo. Voltamos em breve.' check(length(maintenance_message)<=500),
 support_email text not null default '' check(length(support_email)<=254),terms_url text not null default '' check(length(terms_url)<=500),privacy_url text not null default '' check(length(privacy_url)<=500),
 grace_days smallint not null default 0 check(grace_days between 0 and 14),version integer not null default 1,updated_at timestamptz not null default clock_timestamp()
);
insert into public.site_billing_settings(id) values(1) on conflict do nothing;
create table if not exists public.site_administrators(user_id uuid primary key references public.profiles(id) on delete cascade,created_at timestamptz not null default now());
create table if not exists public.site_user_controls(user_id uuid primary key references public.profiles(id) on delete cascade,blocked boolean not null default false,updated_at timestamptz not null default clock_timestamp());
create table if not exists public.billing_plans (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 80),description text not null default '' check(length(description)<=1200),
 amount_cents integer not null check(amount_cents between 100 and 10000000),interval_months smallint not null default 1 check(interval_months in(1,3,6,12)),
 scopes text[] not null default array['master','player'] check(cardinality(scopes) between 1 and 2 and scopes<@array['master','player']),
 max_campaigns integer check(max_campaigns between 1 and 10000),max_players_per_campaign integer check(max_players_per_campaign between 1 and 10000),
 active boolean not null default true,sort_order integer not null default 0,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp()
);
insert into public.billing_plans(id,name,description,amount_cents) values('b1000000-0000-4000-8000-000000000001','Mestre mensal','Crie e conduza suas campanhas com todos os recursos da Crônica.',2000) on conflict do nothing;
create table if not exists public.billing_contracts (
 id uuid primary key,user_id uuid not null references public.profiles(id) on delete restrict,plan_id uuid not null references public.billing_plans(id),
 plan_snapshot jsonb not null check(jsonb_typeof(plan_snapshot)='object'),scope text not null check(scope in('master','player')),
 status text not null default 'creating' check(status in('creating','uncertain','pending','authorized','paused','cancelled','failed')),
 provider_id text unique,checkout_url text,payer_email text not null,consent_at timestamptz not null default clock_timestamp(),settings_version integer not null,
 provider_updated_at timestamptz,next_payment_at timestamptz,last_synced_at timestamptz,error_code text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists billing_one_open_contract on public.billing_contracts(user_id) where status in('creating','uncertain','pending','authorized','paused');
create index if not exists billing_contracts_user_idx on public.billing_contracts(user_id,created_at desc);
create table if not exists public.billing_payments (
 provider_payment_id text primary key,invoice_id text not null,contract_id uuid not null references public.billing_contracts(id),user_id uuid not null references public.profiles(id),
 status text not null,amount_cents integer not null check(amount_cents>=0),refunded_cents integer not null default 0 check(refunded_cents>=0 and refunded_cents<=amount_cents),
 fee_cents integer check(fee_cents>=0),net_cents integer check(net_cents between -1000000000 and 1000000000),approved_at timestamptz,period_start timestamptz,period_end timestamptz,
 provider_updated_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(period_end is null or period_end>period_start)
);
create index if not exists billing_payments_access_idx on public.billing_payments(user_id,period_end desc);
create index if not exists billing_payments_finance_idx on public.billing_payments(approved_at desc);
create index if not exists billing_payments_invoice_idx on public.billing_payments(invoice_id);
create table if not exists public.billing_access_grants (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 scopes text[] not null check(cardinality(scopes) between 1 and 2 and scopes<@array['master','player']),valid_until timestamptz not null,
 granted_by uuid references public.profiles(id),revoked_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.site_audit_log (
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(id),action text not null,target_id text,
 details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table if not exists private.billing_webhooks (
 id uuid primary key default gen_random_uuid(),fingerprint text not null unique,topic text not null,resource_id text not null,
 status text not null default 'pending' check(status in('pending','processing','processed','failed')),attempts integer not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(),lease_until timestamptz,last_error text,created_at timestamptz not null default clock_timestamp(),processed_at timestamptz
);
create index if not exists billing_webhooks_due_idx on private.billing_webhooks(status,next_attempt_at,created_at);
create table if not exists private.billing_sync_leases(user_id uuid primary key references public.profiles(id),lease_until timestamptz not null,last_started_at timestamptz not null default clock_timestamp());
revoke all on private.billing_webhooks,private.billing_sync_leases from public,anon,authenticated;

create or replace function private.site_is_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from public.site_administrators where user_id=p_user) and not coalesce((select blocked from public.site_user_controls where user_id=p_user),false);
$$;
create or replace function public.site_is_admin() returns boolean language sql stable security definer set search_path='' as $$select private.site_is_admin(auth.uid());$$;
create or replace function private.site_assert_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin if not private.site_is_admin(auth.uid()) then raise exception 'Acesso exclusivo da administração.' using errcode='42501';end if;end $$;
create or replace function private.site_audit(p_action text,p_target text,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.site_audit_log(actor_id,action,target_id,details) values(auth.uid(),p_action,p_target,p_details);
$$;
create or replace function private.billing_account_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and not private.site_is_admin(p_user) and not exists(select 1 from public.site_user_controls where user_id=p_user and blocked) and not (select maintenance from public.site_billing_settings where id=1);
$$;
create or replace function private.billing_access_until(p_user uuid,p_scope text) returns timestamptz language sql stable security definer set search_path='' as $$
 select max(p.period_end + case when c.status='authorized' then (select grace_days from public.site_billing_settings where id=1)*interval '1 day' else interval '0 days' end)
 from public.billing_payments p join public.billing_contracts c on c.id=p.contract_id
 where p.user_id=p_user and p.status='approved' and p.refunded_cents<p.amount_cents and p.approved_at<=now() and p.period_start<=now() and c.plan_snapshot->'scopes' ? p_scope;
$$;
create or replace function private.billing_can_access(p_user uuid,p_scope text) returns boolean language sql stable security definer set search_path='' as $$
 select private.billing_account_allowed(p_user) and p_scope in('master','player') and (
  not (select billing_enabled and case when p_scope='master' then require_master else require_player end from public.site_billing_settings where id=1)
  or exists(select 1 from public.billing_access_grants where user_id=p_user and p_scope=any(scopes) and revoked_at is null and valid_until>now())
  or coalesce(private.billing_access_until(p_user,p_scope)>now(),false));
$$;
create or replace function private.billing_access_json(p_user uuid,p_scope text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reason text;until_at timestamptz;
begin
 if private.site_is_admin(p_user) then reason='admin';
 elsif exists(select 1 from public.site_user_controls where user_id=p_user and blocked) then reason='blocked';
 elsif (select maintenance from public.site_billing_settings where id=1) then reason='maintenance';
 elsif not (select billing_enabled and case when p_scope='master' then require_master else require_player end from public.site_billing_settings where id=1) then reason='free';
 else
  select max(valid_until) into until_at from public.billing_access_grants where user_id=p_user and p_scope=any(scopes) and revoked_at is null and valid_until>now();
  if until_at is not null then reason='courtesy';else until_at=private.billing_access_until(p_user,p_scope);reason=case when until_at>now() then 'paid' else 'required' end;end if;
 end if;
 return jsonb_build_object('allowed',reason in('paid','courtesy','free'),'reason',reason,'paid_until',until_at);
end $$;
create or replace function private.billing_effective_limits(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not (select billing_enabled and require_master from public.site_billing_settings where id=1) or exists(select 1 from public.billing_access_grants where user_id=p_user and 'master'=any(scopes) and revoked_at is null and valid_until>now()) then return '{}';end if;
 select c.plan_snapshot into result from public.billing_contracts c join public.billing_payments p on p.contract_id=c.id
 where c.user_id=p_user and c.plan_snapshot->'scopes' ? 'master' and p.status='approved' and p.refunded_cents<p.amount_cents and p.period_start<=now() and p.period_end+(select grace_days from public.site_billing_settings where id=1)*case when c.status='authorized' then interval '1 day' else interval '0 days' end>now()
 order by p.period_end desc limit 1;return coalesce(result,'{}');
end $$;

do $$ declare t text;begin
 foreach t in array array['site_billing_settings','site_administrators','site_user_controls','billing_plans','billing_contracts','billing_payments','billing_access_grants','site_audit_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
drop policy if exists site_settings_read on public.site_billing_settings;
create policy site_settings_read on public.site_billing_settings for select to authenticated using(true);
drop policy if exists site_admins_read on public.site_administrators;
create policy site_admins_read on public.site_administrators for select to authenticated using(user_id=auth.uid() or private.site_is_admin(auth.uid()));
drop policy if exists site_controls_read on public.site_user_controls;
create policy site_controls_read on public.site_user_controls for select to authenticated using(user_id=auth.uid() or private.site_is_admin(auth.uid()));
drop policy if exists site_plans_read on public.billing_plans;
create policy site_plans_read on public.billing_plans for select to authenticated using(active or private.site_is_admin(auth.uid()));
do $$ declare t text;begin
 foreach t in array array['billing_contracts','billing_payments','billing_access_grants'] loop
  execute format('drop policy if exists billing_own_read on public.%I',t);
  execute format('create policy billing_own_read on public.%I for select to authenticated using(user_id=auth.uid() or private.site_is_admin(auth.uid()))',t);
 end loop;
end $$;
drop policy if exists site_audit_read on public.site_audit_log;
create policy site_audit_read on public.site_audit_log for select to authenticated using(private.site_is_admin(auth.uid()));

create or replace function public.get_billing_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid=auth.uid();begin
 if uid is null then raise exception 'Entre na sua conta.' using errcode='42501';end if;
 return jsonb_build_object('is_admin',private.site_is_admin(uid),'blocked',exists(select 1 from public.site_user_controls where user_id=uid and blocked),
  'settings',(select to_jsonb(s) from public.site_billing_settings s where id=1),
  'plans',coalesce((select jsonb_agg(to_jsonb(p) order by sort_order,amount_cents) from public.billing_plans p where active),'[]'),
  'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by created_at desc) from (select * from public.billing_contracts where user_id=uid order by created_at desc limit 20)c),'[]'),
  'payments',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc) from (select * from public.billing_payments where user_id=uid order by created_at desc limit 24)p),'[]'),
  'access',jsonb_build_object('master',private.billing_access_json(uid,'master'),'player',private.billing_access_json(uid,'player')));
end $$;

-- Actual permissions depend on the operation, never on localStorage or a UI role.
create or replace function private.is_campaign_owner(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.billing_can_access(auth.uid(),'master') and exists(select 1 from public.campaigns where id=p_id and owner_id=auth.uid());
$$;
create or replace function private.can_read_campaign(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaigns c where c.id=p_id and case when c.owner_id=auth.uid() then private.billing_can_access(auth.uid(),'master')
  else private.billing_can_access(auth.uid(),'player') and exists(select 1 from public.campaign_members m where m.campaign_id=c.id and m.user_id=auth.uid()) end);
$$;
drop policy campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select to authenticated using(private.can_read_campaign(id));
drop policy campaigns_create on public.campaigns;
create policy campaigns_create on public.campaigns for insert to authenticated with check(owner_id=auth.uid() and private.billing_can_access(auth.uid(),'master'));

create or replace function private.billing_game_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not private.billing_account_allowed(auth.uid()) then raise exception 'Sua conta não tem acesso às aventuras neste momento. Consulte sua assinatura.' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename ~ '^(campaigns$|characters$|npcs$|campaign_|character_|battle_|npc_|world_|scenery_)' loop
  execute format('drop trigger if exists a0_billing_game_guard on public.%I',t.tablename);
  execute format('create trigger a0_billing_game_guard before insert or update or delete on public.%I for each row execute function private.billing_game_write_guard()',t.tablename);
  execute format('drop policy if exists billing_account_gate on public.%I',t.tablename);
  execute format('create policy billing_account_gate on public.%I as restrictive for all to authenticated using(private.billing_account_allowed(auth.uid())) with check(private.billing_account_allowed(auth.uid()))',t.tablename);
 end loop;
end $$;
create or replace function private.billing_plan_limit_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid;limits jsonb;cap integer;begin
 if tg_table_name='campaigns' then
  uid=new.owner_id;
  if not private.billing_can_access(uid,'master') then raise exception 'Uma assinatura de mestre é necessária para criar campanhas.' using errcode='42501';end if;
  if tg_op='UPDATE' and (new.status=old.status or new.status<>'active') then return new;end if;
  if new.status<>'active' then return new;end if;
  perform 1 from public.profiles where id=uid for update;
  limits=private.billing_effective_limits(uid);cap=(limits->>'max_campaigns')::integer;
  if cap is not null and (select count(*) from public.campaigns where owner_id=uid and status='active' and id<>new.id)>=cap then raise exception 'O limite de campanhas ativas deste plano foi atingido.';end if;
 else
  select owner_id into uid from public.campaigns where id=new.campaign_id;
  perform 1 from public.profiles where id=uid for update;
  limits=private.billing_effective_limits(uid);cap=(limits->>'max_players_per_campaign')::integer;
  if cap is not null and (select count(*) from public.campaign_members where campaign_id=new.campaign_id)>=cap then raise exception 'O limite de jogadores desta campanha foi atingido.';end if;
 end if;return new;
end $$;
drop trigger if exists a1_billing_campaign_limit on public.campaigns;
create trigger a1_billing_campaign_limit before insert or update of status on public.campaigns for each row execute function private.billing_plan_limit_guard();
drop trigger if exists a1_billing_player_limit on public.campaign_members;
create trigger a1_billing_player_limit before insert on public.campaign_members for each row execute function private.billing_plan_limit_guard();

-- Server-only operations. These signatures have no authenticated/anonymous grant.
create or replace function public.billing_begin_checkout(p_user_id uuid,p_plan_id uuid,p_scope text,p_request_id uuid,p_plan_version integer,p_payer_email text,p_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_contracts;p public.billing_plans;s public.site_billing_settings;
begin
 perform 1 from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Conta não encontrada.';end if;
 select * into c from public.billing_contracts where id=p_request_id;
 if c.id is not null then
  if c.user_id<>p_user_id or c.plan_id<>p_plan_id or c.scope<>p_scope then raise exception 'Este pedido já pertence a outra contratação.';end if;
  return jsonb_build_object('contract',to_jsonb(c),'create',false);
 end if;
 if not private.billing_account_allowed(p_user_id) then raise exception 'Sua conta não pode contratar uma assinatura neste momento.' using errcode='42501';end if;
 select * into s from public.site_billing_settings where id=1;
 if not s.billing_enabled or not (case when p_scope='master' then s.require_master else s.require_player end) then raise exception 'Este acesso está gratuito. Nenhum pagamento é necessário.';end if;
 if p_scope not in('master','player') or p_request_id is null or not coalesce(p_consent,false) then raise exception 'Confira o plano e autorize a assinatura recorrente.';end if;
 if length(p_payer_email)>254 or p_payer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe o e-mail da sua conta no Mercado Pago.';end if;
 select * into c from public.billing_contracts where user_id=p_user_id and status in('creating','uncertain','pending','authorized','paused') order by created_at desc limit 1;
 if c.id is not null then
  if c.plan_id<>p_plan_id or c.scope<>p_scope or (c.plan_snapshot->>'version')::integer<>p_plan_version then
   raise exception 'Já existe uma contratação em andamento. Confira sua assinatura atual antes de escolher outro plano.' using errcode='40001';
  end if;
  return jsonb_build_object('contract',to_jsonb(c),'create',false);
 end if;
 if private.billing_access_until(p_user_id,p_scope)>now() then raise exception 'Seu período pago ainda está ativo. Uma nova assinatura poderá ser contratada após esse período.';end if;
 select * into p from public.billing_plans where id=p_plan_id and active for share;
 if p.id is null or not p_scope=any(p.scopes) then raise exception 'Escolha um plano disponível para este acesso.';end if;
 if p.version is distinct from p_plan_version then raise exception 'O plano mudou. Atualize a página e confira o novo valor antes de contratar.' using errcode='40001';end if;
 insert into public.billing_contracts(id,user_id,plan_id,plan_snapshot,scope,payer_email,settings_version)
 values(p_request_id,p_user_id,p.id,to_jsonb(p),p_scope,lower(trim(p_payer_email)),s.version) returning * into c;
 return jsonb_build_object('contract',to_jsonb(c),'create',true);
end $$;
create or replace function public.billing_update_contract(p_id uuid,p_provider_id text,p_status text,p_checkout_url text,p_provider_updated_at timestamptz,p_next_payment_at timestamptz,p_error_code text default null) returns public.billing_contracts
language plpgsql security definer set search_path='' as $$
declare c public.billing_contracts;begin
 select * into c from public.billing_contracts where id=p_id for update;
 if c.id is null then raise exception 'Contratação não encontrada.';end if;
 if c.provider_id is not null and p_provider_id is distinct from c.provider_id then
  if p_provider_id is null then return c;end if;
  raise exception 'A referência desta assinatura não pode ser substituída.';
 end if;
 if c.provider_id is not null and c.status='cancelled' and p_status<>'cancelled' then return c;end if;
 if p_provider_updated_at is not null and c.provider_updated_at>p_provider_updated_at then return c;end if;
 update public.billing_contracts set provider_id=coalesce(p_provider_id,provider_id),status=p_status,checkout_url=coalesce(p_checkout_url,checkout_url),
 provider_updated_at=coalesce(p_provider_updated_at,provider_updated_at),next_payment_at=p_next_payment_at,error_code=left(p_error_code,100),updated_at=clock_timestamp()
 where id=p_id returning * into c;return c;
end $$;
create or replace function public.billing_store_payment(p_contract_id uuid,p_payment jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.billing_contracts;oldp public.billing_payments;approved timestamptz;period_end_at timestamptz;amount integer=(p_payment->>'amount_cents')::integer;changed timestamptz=(p_payment->>'provider_updated_at')::timestamptz;
begin
 select * into c from public.billing_contracts where id=p_contract_id for update;
 if c.id is null or c.provider_id is null or amount is distinct from (c.plan_snapshot->>'amount_cents')::integer then raise exception 'O pagamento não corresponde ao valor contratado.';end if;
 select * into oldp from public.billing_payments where provider_payment_id=p_payment->>'provider_payment_id' for update;
 if oldp.provider_payment_id is not null and (oldp.contract_id<>c.id or oldp.invoice_id<>p_payment->>'invoice_id') then raise exception 'O vínculo do pagamento não pode ser alterado.';end if;
 if oldp.provider_updated_at>=changed then return false;end if;
 approved=coalesce(oldp.approved_at,nullif(p_payment->>'approved_at','')::timestamptz);
 if p_payment->>'status'='approved' and approved is null then raise exception 'O pagamento aprovado precisa de data de confirmação.';end if;
 if approved is not null then period_end_at=((approved at time zone 'UTC')+make_interval(months=>(c.plan_snapshot->>'interval_months')::integer)) at time zone 'UTC';end if;
 insert into public.billing_payments(provider_payment_id,invoice_id,contract_id,user_id,status,amount_cents,refunded_cents,fee_cents,net_cents,approved_at,period_start,period_end,provider_updated_at)
 values(p_payment->>'provider_payment_id',p_payment->>'invoice_id',c.id,c.user_id,p_payment->>'status',amount,coalesce((p_payment->>'refunded_cents')::integer,0),(p_payment->>'fee_cents')::integer,(p_payment->>'net_cents')::integer,approved,approved,period_end_at,changed)
 on conflict(provider_payment_id) do update set status=excluded.status,refunded_cents=excluded.refunded_cents,fee_cents=excluded.fee_cents,net_cents=excluded.net_cents,
 approved_at=excluded.approved_at,period_start=excluded.period_start,period_end=excluded.period_end,provider_updated_at=excluded.provider_updated_at,updated_at=clock_timestamp();
 return true;
end $$;
create or replace function public.billing_claim_sync(p_user_id uuid,p_force boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare l private.billing_sync_leases;begin
 perform 1 from public.profiles where id=p_user_id for update;
 if not found then return false;end if;
 select * into l from private.billing_sync_leases where user_id=p_user_id for update;
 if l.lease_until>now() or not p_force and l.last_started_at>now()-interval '15 seconds' then return false;end if;
 insert into private.billing_sync_leases(user_id,lease_until,last_started_at) values(p_user_id,clock_timestamp()+interval '90 seconds',clock_timestamp())
 on conflict(user_id) do update set lease_until=excluded.lease_until,last_started_at=excluded.last_started_at;return true;
end $$;
create or replace function public.billing_release_sync(p_user_id uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.billing_sync_leases set lease_until=clock_timestamp() where user_id=p_user_id;
 if p_success then update public.billing_contracts set last_synced_at=clock_timestamp() where user_id=p_user_id;end if;
end $$;
create or replace function public.billing_enqueue_webhook(p_fingerprint text,p_topic text,p_resource_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 if p_topic not in('subscription_preapproval','subscription_authorized_payment','payment') or p_resource_id !~ '^[A-Za-z0-9_-]{1,128}$' or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Notificação inválida.';end if;
 insert into private.billing_webhooks(fingerprint,topic,resource_id) values(p_fingerprint,p_topic,p_resource_id) on conflict(fingerprint) do nothing returning id into result;
 return result;
end $$;
create or replace function public.billing_lease_webhooks(p_limit integer default 20) returns setof private.billing_webhooks language sql security definer set search_path='' as $$
 update private.billing_webhooks set status='processing',attempts=attempts+1,lease_until=clock_timestamp()+interval '90 seconds'
 where id in(select id from private.billing_webhooks where status='pending' and next_attempt_at<=now() or status='processing' and lease_until<now() order by created_at for update skip locked limit least(greatest(p_limit,1),100)) returning *;
$$;
create or replace function public.billing_finish_webhook(p_id uuid,p_error text default null) returns void language sql security definer set search_path='' as $$
 update private.billing_webhooks set status=case when p_error is null then 'processed' when attempts>=12 then 'failed' else 'pending' end,
 processed_at=case when p_error is null then clock_timestamp() else null end,last_error=left(p_error,200),lease_until=null,
 next_attempt_at=clock_timestamp()+least(3600,30*power(2,least(attempts,7))) * interval '1 second' where id=p_id;
$$;

-- Administration is independent of campaign ownership and never grants access to adventures.
create or replace function public.site_admin_mutate(p_action text,p_data jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;old_plan public.billing_plans;new_plan public.billing_plans;s public.site_billing_settings;result jsonb;scopes text[];days integer;
begin
 perform private.site_assert_admin();
 if length(trim(p_reason)) not between 3 and 500 then raise exception 'Informe um motivo entre 3 e 500 caracteres.';end if;
 if p_action='plan' then
  if nullif(p_data->>'id','') is not null then
   select * into old_plan from public.billing_plans where id=(p_data->>'id')::uuid for update;
   if old_plan.id is null then raise exception 'Plano não encontrado.';end if;
   if old_plan.version is distinct from (p_data->>'version')::integer then raise exception 'Este plano foi alterado. Recarregue os dados.' using errcode='40001';end if;
  end if;
  select array_agg(value) into scopes from jsonb_array_elements_text(p_data->'scopes');
  insert into public.billing_plans(id,name,description,amount_cents,interval_months,scopes,max_campaigns,max_players_per_campaign,active,sort_order)
  values(coalesce(old_plan.id,gen_random_uuid()),trim(p_data->>'name'),coalesce(p_data->>'description',''),(p_data->>'amount_cents')::integer,(p_data->>'interval_months')::smallint,scopes,
   nullif(p_data->>'max_campaigns','')::integer,nullif(p_data->>'max_players_per_campaign','')::integer,(p_data->>'active')::boolean,coalesce((p_data->>'sort_order')::integer,0))
  on conflict(id) do update set name=excluded.name,description=excluded.description,amount_cents=excluded.amount_cents,interval_months=excluded.interval_months,scopes=excluded.scopes,
   max_campaigns=excluded.max_campaigns,max_players_per_campaign=excluded.max_players_per_campaign,active=excluded.active,sort_order=excluded.sort_order,version=billing_plans.version+1,updated_at=clock_timestamp() returning * into new_plan;
  result=to_jsonb(new_plan);
 elsif p_action='settings' then
  select * into s from public.site_billing_settings where id=1 for update;
  if s.version is distinct from (p_data->>'version')::integer then raise exception 'As configurações mudaram. Recarregue os dados.' using errcode='40001';end if;
  if (p_data->>'support_email')<>'' and (p_data->>'support_email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'E-mail de suporte inválido.';end if;
  if exists(select 1 from jsonb_each_text(p_data) where key in('terms_url','privacy_url') and value<>'' and value !~ '^https://[^[:space:]]+$') then raise exception 'Os links de termos e privacidade devem usar HTTPS.';end if;
  update public.site_billing_settings set site_name=trim(p_data->>'site_name'),billing_enabled=(p_data->>'billing_enabled')::boolean,
   require_master=(p_data->>'require_master')::boolean,require_player=(p_data->>'require_player')::boolean,maintenance=(p_data->>'maintenance')::boolean,
   maintenance_message=p_data->>'maintenance_message',support_email=p_data->>'support_email',terms_url=p_data->>'terms_url',privacy_url=p_data->>'privacy_url',grace_days=(p_data->>'grace_days')::smallint,
   version=version+1,updated_at=clock_timestamp() where id=1 returning to_jsonb(site_billing_settings.*) into result;
 elsif p_action in('block','grant','revoke_grant','administrator') then
  uid=(p_data->>'user_id')::uuid;
  perform 1 from public.profiles where id=uid for update;
  if not found then raise exception 'Conta não encontrada.';end if;
  if p_action='block' then
   if exists(select 1 from public.site_administrators where user_id=uid) then raise exception 'Remova o acesso administrativo antes de bloquear esta conta.';end if;
   insert into public.site_user_controls(user_id,blocked) values(uid,(p_data->>'blocked')::boolean)
    on conflict(user_id) do update set blocked=excluded.blocked,updated_at=clock_timestamp();
  elsif p_action='grant' then
   days=(p_data->>'days')::integer;
   if days not between 1 and 365 then raise exception 'A cortesia deve durar entre 1 e 365 dias.';end if;
   select array_agg(value) into scopes from jsonb_array_elements_text(p_data->'scopes');
   insert into public.billing_access_grants(user_id,scopes,valid_until,granted_by) values(uid,scopes,clock_timestamp()+days*interval '1 day',auth.uid());
  elsif p_action='revoke_grant' then
   update public.billing_access_grants set revoked_at=clock_timestamp() where user_id=uid and id=(p_data->>'grant_id')::uuid and revoked_at is null;
  else
   perform 1 from public.site_billing_settings where id=1 for update;
   if (p_data->>'enabled')::boolean then
    if exists(select 1 from public.site_user_controls where user_id=uid and blocked) then raise exception 'Desbloqueie a conta antes de conceder administração.';end if;
    if exists(select 1 from public.billing_contracts where user_id=uid and status in('creating','uncertain','pending','authorized','paused')) then raise exception 'Cancele a renovação desta conta antes de torná-la administradora.';end if;
    insert into public.site_administrators(user_id) values(uid) on conflict do nothing;
   else
    if uid=auth.uid() then raise exception 'Você não pode remover seu próprio acesso administrativo.';end if;
    if (select count(*) from public.site_administrators)<=1 then raise exception 'Mantenha pelo menos um administrador.';end if;
    delete from public.site_administrators where user_id=uid;
   end if;
  end if;
  result=jsonb_build_object('user_id',uid);
 else raise exception 'Operação administrativa desconhecida.';end if;
 perform private.site_audit(p_action,coalesce(uid::text,result->>'id'),jsonb_build_object('reason',trim(p_reason),'changes',p_data));
 return result;
end $$;

create or replace function public.site_admin_record_operation(p_action text,p_user_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.site_assert_admin();
 if p_action not in('cancel_renewal','reconcile','retry_webhooks') or length(trim(p_reason)) not between 3 and 500 then raise exception 'Operação inválida.';end if;
 perform private.site_audit(p_action,p_user_id::text,jsonb_build_object('reason',p_reason));
end $$;

create or replace function public.site_admin_read(p_view text,p_options jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;uid uuid;off integer=greatest(coalesce((p_options->>'offset')::integer,0),0);lim integer=least(greatest(coalesce((p_options->>'limit')::integer,25),1),100);
 q text=left(trim(coalesce(p_options->>'query','')),254);from_at timestamptz;to_at timestamptz;
begin
 perform private.site_assert_admin();
 if p_view='overview' then
  select jsonb_build_object('users',(select count(*) from public.profiles),'campaigns',(select count(*) from public.campaigns),
   'paid_users',(select count(*) from public.profiles p where private.billing_access_until(p.id,'master')>now() or private.billing_access_until(p.id,'player')>now()),
   'pending',(select count(*) from public.billing_contracts where status in('pending','creating','uncertain')),
   'mrr_cents',(select coalesce(sum((plan_snapshot->>'amount_cents')::numeric/(plan_snapshot->>'interval_months')::numeric),0) from public.billing_contracts c where status='authorized' and exists(select 1 from public.billing_payments p where p.contract_id=c.id and p.status='approved' and p.refunded_cents<p.amount_cents and p.period_end>now())),
   'webhooks_pending',(select count(*) from private.billing_webhooks where status in('pending','processing')),'webhooks_failed',(select count(*) from private.billing_webhooks where status='failed'),
   'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by sort_order,created_at),'[]') from public.billing_plans p),'settings',(select to_jsonb(s) from public.site_billing_settings s where id=1)) into result;
 elsif p_view='users' then
  with filtered as(select p.id,p.name,p.email,p.created_at,coalesce(u.blocked,false) blocked,exists(select 1 from public.site_administrators a where a.user_id=p.id) is_admin,
    private.billing_access_json(p.id,'master') master_access,private.billing_access_json(p.id,'player') player_access,
    (select status from public.billing_contracts c where c.user_id=p.id order by created_at desc limit 1) subscription_status
   from public.profiles p left join public.site_user_controls u on u.user_id=p.id where q='' or position(lower(q) in lower(p.name||' '||p.email||' '||p.id::text))>0)
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(f)) from(select * from filtered order by created_at desc,id offset off limit lim) f),'[]')) into result;
 elsif p_view='user' then
  uid=(p_options->>'user_id')::uuid;
  select jsonb_build_object('profile',to_jsonb(p),'is_admin',exists(select 1 from public.site_administrators where user_id=uid),'blocked',coalesce((select blocked from public.site_user_controls where user_id=uid),false),
   'access',jsonb_build_object('master',private.billing_access_json(uid,'master'),'player',private.billing_access_json(uid,'player')),
   'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by created_at desc) from public.billing_contracts c where user_id=uid),'[]'),
   'payments',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from public.billing_payments where user_id=uid order by created_at desc limit 100) x),'[]'),
   'grants',coalesce((select jsonb_agg(to_jsonb(g) order by created_at desc) from public.billing_access_grants g where user_id=uid),'[]')) into result from public.profiles p where id=uid;
  if result is null then raise exception 'Conta não encontrada.';end if;
 elsif p_view='finance' then
  from_at=coalesce((p_options->>'from')::date,date_trunc('month',now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  to_at=(coalesce((p_options->>'to')::date,(now() at time zone 'America/Sao_Paulo')::date)+1)::timestamp at time zone 'America/Sao_Paulo';
  if to_at<=from_at or to_at>from_at+interval '367 days' then raise exception 'Selecione um período de até um ano.';end if;
  with filtered as(select b.*,p.email from public.billing_payments b join public.profiles p on p.id=b.user_id where coalesce(b.approved_at,b.created_at)>=from_at and coalesce(b.approved_at,b.created_at)<to_at)
  select jsonb_build_object('total',(select count(*) from filtered),
   'gross_cents',(select coalesce(sum(amount_cents) filter(where approved_at is not null),0) from filtered),
   'refund_cents',(select coalesce(sum(case when status='charged_back' then amount_cents else refunded_cents end),0) from filtered),
   'fee_cents',(select coalesce(sum(fee_cents) filter(where approved_at is not null),0) from filtered),
   'net_cents',(select coalesce(sum(net_cents) filter(where approved_at is not null),0) from filtered),
   'missing_net',(select count(*) from filtered where approved_at is not null and net_cents is null),
   'rows',coalesce((select jsonb_agg(to_jsonb(f)) from(select * from filtered order by coalesce(approved_at,created_at) desc,provider_payment_id offset off limit lim) f),'[]')) into result;
 elsif p_view='audit' then
  select jsonb_build_object('total',(select count(*) from public.site_audit_log),'rows',coalesce((select jsonb_agg(to_jsonb(f)) from(select a.*,p.name actor_name from public.site_audit_log a left join public.profiles p on p.id=a.actor_id order by a.id desc offset off limit lim) f),'[]')) into result;
 else raise exception 'Consulta administrativa desconhecida.';end if;
 return result;
end $$;

create or replace function public.billing_retry_webhooks() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin update private.billing_webhooks set status='pending',attempts=0,next_attempt_at=clock_timestamp(),last_error=null where status='failed';get diagnostics n=row_count;return n;end $$;
create or replace function public.billing_due_users(p_limit integer default 30) returns setof uuid language sql stable security definer set search_path='' as $$
 select user_id from public.billing_contracts where status not in('failed') and (last_synced_at is null or last_synced_at<now()-interval '6 hours')
 group by user_id order by min(last_synced_at) nulls first,min(created_at) limit least(greatest(p_limit,1),100);
$$;

-- PostgreSQL defaults function execution to PUBLIC. Revoke explicitly before granting.
do $$ declare f record;t text;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and (p.proname like 'billing_%' or p.proname like 'site_%' or p.proname='get_billing_context') loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
  if f.nspname='public' then
   if f.proname in('site_is_admin','get_billing_context','site_admin_mutate','site_admin_read','site_admin_record_operation') then
    execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.args);
   elsif exists(select 1 from pg_roles where rolname='service_role') then
    execute format('grant execute on function public.%I(%s) to service_role',f.proname,f.args);
   end if;
  end if;
 end loop;
 grant execute on function private.billing_account_allowed(uuid),private.billing_can_access(uuid,text),private.site_is_admin(uuid) to authenticated;
 if exists(select 1 from pg_roles where rolname='service_role') then
  foreach t in array array['site_billing_settings','site_administrators','site_user_controls','billing_plans','billing_contracts','billing_payments','billing_access_grants','site_audit_log'] loop
   execute format('grant select on public.%I to service_role',t);
  end loop;
 end if;
end $$;
commit;
