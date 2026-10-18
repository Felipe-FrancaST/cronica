-- Execute SOMENTE no SQL Editor do seu Supabase, após a migração 029.
-- Cadastre e confirme primeiro um e-mail dedicado à administração no próprio site.
-- Substitua o e-mail abaixo. Não existe senha administrativa padrão.
begin;
do $$
declare
 admin_email text := 'SUBSTITUA_PELO_SEU_EMAIL';
 admin_id uuid;
begin
 if admin_email='SUBSTITUA_PELO_SEU_EMAIL' then raise exception 'Preencha o e-mail do administrador antes de executar.';end if;
 select p.id into admin_id from public.profiles p join auth.users u on u.id=p.id
 where lower(u.email)=lower(trim(admin_email)) and u.email_confirmed_at is not null;
 if admin_id is null then raise exception 'Cadastre e confirme este e-mail no site antes de conceder a administração.';end if;
 if exists(select 1 from public.site_user_controls where user_id=admin_id and blocked) then raise exception 'Desbloqueie esta conta antes de conceder a administração.';end if;
 if exists(select 1 from public.billing_contracts where user_id=admin_id and status in('creating','uncertain','pending','authorized','paused')) then raise exception 'Cancele a renovação desta conta antes de conceder a administração.';end if;
 insert into public.site_administrators(user_id) values(admin_id) on conflict do nothing;
 insert into public.site_audit_log(actor_id,action,target_id,details)
 values(admin_id,'administrator',admin_id::text,jsonb_build_object('reason','Configuração inicial pelo SQL Editor','enabled',true));
end $$;
commit;
