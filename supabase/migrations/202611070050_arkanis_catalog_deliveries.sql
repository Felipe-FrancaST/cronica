begin;
-- Permit only the exact local icon paired with its canonical potion name.
do $$ declare definition text; begin
 definition=pg_get_functiondef('public.save_campaign_item(jsonb,integer)'::regprocedure);
 if strpos(definition,'-- arkanis50 potion icon')=0 then
  definition=replace(definition,'then raise exception ''A imagem deve pertencer a esta campanha.'';', $guard$
  -- arkanis50 potion icon
  and not exists(select 1 from public.campaigns c join public.rpg_systems r on r.id=c.rpg_system_id join public.arkanis_potions p on p.name=d->>'name' where c.id=cid and r.slug='arkanis' and p.data->>'icon'=d->>'image_path')
  then raise exception 'A imagem deve pertencer a esta campanha.';$guard$);
  execute definition;
 end if;
end $$;

create or replace function public.give_arkanis_catalog_item(p_character_id uuid,p_catalog_id text,p_quantity integer,p_request_id uuid)
returns public.campaign_item_deliveries language plpgsql security definer set search_path='' as $$
declare ch public.characters; ing public.arkanis_ingredients; potion public.arkanis_potions; item public.campaign_items; iid uuid; d jsonb;
begin
 select * into ch from public.characters where id=p_character_id;
 if ch.id is null or not private.is_campaign_owner(ch.campaign_id) then raise exception 'Somente o mestre pode entregar itens.' using errcode='42501';end if;
 if not exists(select 1 from public.rpg_systems where id=ch.rpg_system_id and slug='arkanis') then raise exception 'Escolha um personagem de Arkanis.';end if;
 if p_request_id is null or p_quantity is null or p_quantity not between 1 and 9999 then raise exception 'Entregue de 1 a 9.999 unidades.';end if;
 perform 1 from public.campaigns where id=ch.campaign_id for update;
 select * into ing from public.arkanis_ingredients where id=p_catalog_id;
 select * into potion from public.arkanis_potions where id=p_catalog_id;
 if ing.id is null and potion.id is null then raise exception 'Ingrediente ou poção não encontrado no catálogo.';end if;
 d=jsonb_build_object('name',coalesce(ing.name,potion.name),'category','consumable','weight',0,'cost_gp',0,'notes',case when ing.id is not null then ing.affinities else potion.data->>'effect'||E'\nDuração: '||(potion.data->>'duration')||E'\nUso: '||(potion.data->>'use') end,'rarity','Comum','attunement',false,'charges',0,'functions','[]'::jsonb,'bonuses',jsonb_build_object('ac',0,'speed',0,'attack',0,'damage',0),'tags',case when ing.id is not null then '["ingredientes"]'::jsonb else '["poções"]'::jsonb end,'recharge','none','passive_requires_equipped',false,'image_path',coalesce(ing.icon,potion.data->>'icon'));
 if ing.id is not null then d=d||jsonb_build_object('ingredient_id',ing.id);end if;
 iid=md5('arkanis50:'||ch.campaign_id::text||':'||p_catalog_id)::uuid;
 select * into item from public.campaign_items where id=iid;
 if item.id is null or item.archived or item.data is distinct from private.validate_campaign_item(d) then
  item=public.save_campaign_item(jsonb_build_object('id',iid,'campaign_id',ch.campaign_id,'data',d,'visible_to_players',false,'archived',false),item.version);
 end if;
 return public.give_campaign_item(item.id,ch.id,p_quantity,p_request_id,item.version);
end $$;
revoke all on function public.give_arkanis_catalog_item(uuid,text,integer,uuid) from public,anon;
grant execute on function public.give_arkanis_catalog_item(uuid,text,integer,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
