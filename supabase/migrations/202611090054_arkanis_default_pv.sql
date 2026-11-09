-- Arkanis has two PV methods. Its unset/legacy D&D 'average' default means maximum.
begin;
set local lock_timeout = '5s';

create or replace function private.arkanis54_pv_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.hit_point_method is null or new.hit_point_method = 'average')
     and exists(select 1 from public.campaigns c join public.rpg_systems r on r.id=c.rpg_system_id
                where c.id=new.campaign_id and r.slug='arkanis') then
    new.hit_point_method = 'maximum';
  end if;
  return new;
end $$;
revoke all on function private.arkanis54_pv_default() from public, anon, authenticated;
drop trigger if exists arkanis54_pv_default on public.campaign_rules;
create trigger arkanis54_pv_default before insert or update of hit_point_method, campaign_id
on public.campaign_rules for each row execute function private.arkanis54_pv_default();

create or replace function private.arkanis54_default_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.rpg_systems where id=new.rpg_system_id and slug='arkanis') then
    insert into public.campaign_rules(campaign_id,hit_point_method)
    values(new.id,'maximum') on conflict(campaign_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.arkanis54_default_rules() from public, anon, authenticated;
drop trigger if exists arkanis54_default_rules on public.campaigns;
create trigger arkanis54_default_rules after insert on public.campaigns
for each row execute function private.arkanis54_default_rules();

-- Repair only missing or legacy defaults. Explicit rolled/maximum choices remain untouched.
insert into public.campaign_rules(campaign_id,hit_point_method)
select c.id,'maximum' from public.campaigns c join public.rpg_systems r on r.id=c.rpg_system_id
where r.slug='arkanis' on conflict(campaign_id) do nothing;
update public.campaign_rules rules set hit_point_method='maximum'
from public.campaigns c join public.rpg_systems r on r.id=c.rpg_system_id
where rules.campaign_id=c.id and r.slug='arkanis' and rules.hit_point_method='average';

notify pgrst, 'reload schema';
commit;
