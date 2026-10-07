-- Source template. The generator produces the ONE executable migration 018.
begin;
do $$ begin
 if to_regprocedure('private.dnd_validate_build(jsonb,jsonb)') is null or to_regclass('public.dnd_character_build_rules') is null then
  raise exception 'Esta atualização requer a multiclasse v16 instalada. Não execute migrações antigas; conclua a recuperação v16 primeiro.';
 end if;
end $$;
alter table public.battle_action_requests drop constraint if exists battle_action_requests_kind_check;
alter table public.battle_action_requests add constraint battle_action_requests_kind_check check(kind in('weapon','spell','item','feature','dash','disengage','dodge','opportunity'));
alter table public.battle_action_requests drop constraint if exists battle_action_requests_cost_check;
alter table public.battle_action_requests add constraint battle_action_requests_cost_check check(cost in('action','bonus','reaction','free'));
alter table public.battle_map_tokens add column if not exists raging boolean not null default false;
alter table public.battle_map_tokens add column if not exists rage_started_round integer;
alter table public.battle_map_tokens add column if not exists rage_activity_at timestamptz;
alter table public.battle_map_tokens add column if not exists rage_checked_at timestamptz;
alter table public.battle_map_tokens add column if not exists sneak_used boolean not null default false;
alter table public.battle_map_tokens add column if not exists hunter_used boolean not null default false;
alter table public.battle_map_tokens add column if not exists surge_used boolean not null default false;
alter table public.battle_map_tokens add column if not exists weapon_attacked boolean not null default false;
alter table public.battle_map_tokens add column if not exists extra_actions integer not null default 0 check(extra_actions between 0 and 1);

create table if not exists public.dnd_items(id text primary key,name text not null,data jsonb not null);
create table if not exists public.dnd_combat_features(id text primary key,data jsonb not null);
alter table public.dnd_items enable row level security;
alter table public.dnd_combat_features enable row level security;
drop policy if exists dnd_items_read on public.dnd_items;
create policy dnd_items_read on public.dnd_items for select to authenticated using(true);
drop policy if exists dnd_combat_features_read on public.dnd_combat_features;
create policy dnd_combat_features_read on public.dnd_combat_features for select to authenticated using(true);
grant select on public.dnd_items,public.dnd_combat_features to authenticated;
revoke all on public.dnd_items,public.dnd_combat_features from anon;
insert into public.dnd_items values('club','Clava','{"catalog_id":"club","name":"Clava","category":"weapon","quantity":1,"weight":1,"cost_gp":0.1,"equipped":false,"notes":"leve","weapon_type":"simple","damage":"1d4 concussão","properties":["leve"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('dagger','Adaga','{"catalog_id":"dagger","name":"Adaga","category":"weapon","quantity":1,"weight":0.5,"cost_gp":2,"equipped":false,"notes":"acuidade, leve, arremesso","weapon_type":"simple","damage":"1d4 perfurante","properties":["acuidade","leve","arremesso"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('greatclub','Clava grande','{"catalog_id":"greatclub","name":"Clava grande","category":"weapon","quantity":1,"weight":5,"cost_gp":0.2,"equipped":false,"notes":"duas mãos","weapon_type":"simple","damage":"1d8 concussão","properties":["duas mãos"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('handaxe','Machadinha','{"catalog_id":"handaxe","name":"Machadinha","category":"weapon","quantity":1,"weight":1,"cost_gp":5,"equipped":false,"notes":"leve, arremesso","weapon_type":"simple","damage":"1d6 cortante","properties":["leve","arremesso"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('javelin','Azagaia','{"catalog_id":"javelin","name":"Azagaia","category":"weapon","quantity":1,"weight":1,"cost_gp":0.5,"equipped":false,"notes":"arremesso","weapon_type":"simple","damage":"1d6 perfurante","properties":["arremesso"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('light-hammer','Martelo leve','{"catalog_id":"light-hammer","name":"Martelo leve","category":"weapon","quantity":1,"weight":1,"cost_gp":2,"equipped":false,"notes":"leve, arremesso","weapon_type":"simple","damage":"1d4 concussão","properties":["leve","arremesso"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('mace','Maça','{"catalog_id":"mace","name":"Maça","category":"weapon","quantity":1,"weight":2,"cost_gp":5,"equipped":false,"notes":"","weapon_type":"simple","damage":"1d6 concussão","properties":[],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('quarterstaff','Bordão','{"catalog_id":"quarterstaff","name":"Bordão","category":"weapon","quantity":1,"weight":2,"cost_gp":0.2,"equipped":false,"notes":"versátil","weapon_type":"simple","damage":"1d6 concussão","properties":["versátil"],"weapon_mode":"melee","weapon_range":1.5,"versatile_damage":"1d8"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('sickle','Foice','{"catalog_id":"sickle","name":"Foice","category":"weapon","quantity":1,"weight":1,"cost_gp":1,"equipped":false,"notes":"leve","weapon_type":"simple","damage":"1d4 cortante","properties":["leve"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('spear','Lança','{"catalog_id":"spear","name":"Lança","category":"weapon","quantity":1,"weight":1.5,"cost_gp":1,"equipped":false,"notes":"arremesso, versátil","weapon_type":"simple","damage":"1d6 perfurante","properties":["arremesso","versátil"],"weapon_mode":"melee","weapon_range":1.5,"versatile_damage":"1d8"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('light-crossbow','Besta leve','{"catalog_id":"light-crossbow","name":"Besta leve","category":"weapon","quantity":1,"weight":2.5,"cost_gp":25,"equipped":false,"notes":"distância, munição, recarga, duas mãos","weapon_type":"simple","damage":"1d8 perfurante","properties":["distância","munição","recarga","duas mãos"],"weapon_mode":"ranged","weapon_range":24,"ammunition":"bolt"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('dart','Dardo','{"catalog_id":"dart","name":"Dardo","category":"weapon","quantity":1,"weight":0.1,"cost_gp":0.05,"equipped":false,"notes":"distância, acuidade, arremesso","weapon_type":"simple","damage":"1d4 perfurante","properties":["distância","acuidade","arremesso"],"weapon_mode":"ranged","weapon_range":6}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('shortbow','Arco curto','{"catalog_id":"shortbow","name":"Arco curto","category":"weapon","quantity":1,"weight":1,"cost_gp":25,"equipped":false,"notes":"distância, munição, duas mãos","weapon_type":"simple","damage":"1d6 perfurante","properties":["distância","munição","duas mãos"],"weapon_mode":"ranged","weapon_range":24,"ammunition":"arrow"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('sling','Funda','{"catalog_id":"sling","name":"Funda","category":"weapon","quantity":1,"weight":0,"cost_gp":0.1,"equipped":false,"notes":"distância, munição","weapon_type":"simple","damage":"1d4 concussão","properties":["distância","munição"],"weapon_mode":"ranged","weapon_range":9,"ammunition":"bullet"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('battleaxe','Machado de batalha','{"catalog_id":"battleaxe","name":"Machado de batalha","category":"weapon","quantity":1,"weight":2,"cost_gp":10,"equipped":false,"notes":"versátil","weapon_type":"martial","damage":"1d8 cortante","properties":["versátil"],"weapon_mode":"melee","weapon_range":1.5,"versatile_damage":"1d10"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('flail','Mangual','{"catalog_id":"flail","name":"Mangual","category":"weapon","quantity":1,"weight":1,"cost_gp":10,"equipped":false,"notes":"","weapon_type":"martial","damage":"1d8 concussão","properties":[],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('glaive','Glaive','{"catalog_id":"glaive","name":"Glaive","category":"weapon","quantity":1,"weight":3,"cost_gp":20,"equipped":false,"notes":"pesada, duas mãos, alcance","weapon_type":"martial","damage":"1d10 cortante","properties":["pesada","duas mãos","alcance"],"weapon_mode":"melee","weapon_range":3}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('greataxe','Machado grande','{"catalog_id":"greataxe","name":"Machado grande","category":"weapon","quantity":1,"weight":3.5,"cost_gp":30,"equipped":false,"notes":"pesada, duas mãos","weapon_type":"martial","damage":"1d12 cortante","properties":["pesada","duas mãos"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('greatsword','Espada grande','{"catalog_id":"greatsword","name":"Espada grande","category":"weapon","quantity":1,"weight":3,"cost_gp":50,"equipped":false,"notes":"pesada, duas mãos","weapon_type":"martial","damage":"2d6 cortante","properties":["pesada","duas mãos"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('halberd','Alabarda','{"catalog_id":"halberd","name":"Alabarda","category":"weapon","quantity":1,"weight":3,"cost_gp":20,"equipped":false,"notes":"pesada, duas mãos, alcance","weapon_type":"martial","damage":"1d10 cortante","properties":["pesada","duas mãos","alcance"],"weapon_mode":"melee","weapon_range":3}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('lance','Lança de cavalaria','{"catalog_id":"lance","name":"Lança de cavalaria","category":"weapon","quantity":1,"weight":3,"cost_gp":10,"equipped":false,"notes":"alcance, especial","weapon_type":"martial","damage":"1d12 perfurante","properties":["alcance","especial"],"weapon_mode":"melee","weapon_range":3}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('longsword','Espada longa','{"catalog_id":"longsword","name":"Espada longa","category":"weapon","quantity":1,"weight":1.5,"cost_gp":15,"equipped":false,"notes":"versátil","weapon_type":"martial","damage":"1d8 cortante","properties":["versátil"],"weapon_mode":"melee","weapon_range":1.5,"versatile_damage":"1d10"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('maul','Malho','{"catalog_id":"maul","name":"Malho","category":"weapon","quantity":1,"weight":5,"cost_gp":10,"equipped":false,"notes":"pesada, duas mãos","weapon_type":"martial","damage":"2d6 concussão","properties":["pesada","duas mãos"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('morningstar','Maça-estrela','{"catalog_id":"morningstar","name":"Maça-estrela","category":"weapon","quantity":1,"weight":2,"cost_gp":15,"equipped":false,"notes":"","weapon_type":"martial","damage":"1d8 perfurante","properties":[],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('pike','Pique','{"catalog_id":"pike","name":"Pique","category":"weapon","quantity":1,"weight":9,"cost_gp":5,"equipped":false,"notes":"pesada, duas mãos, alcance","weapon_type":"martial","damage":"1d10 perfurante","properties":["pesada","duas mãos","alcance"],"weapon_mode":"melee","weapon_range":3}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('rapier','Rapieira','{"catalog_id":"rapier","name":"Rapieira","category":"weapon","quantity":1,"weight":1,"cost_gp":25,"equipped":false,"notes":"acuidade","weapon_type":"martial","damage":"1d8 perfurante","properties":["acuidade"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('scimitar','Cimitarra','{"catalog_id":"scimitar","name":"Cimitarra","category":"weapon","quantity":1,"weight":1.5,"cost_gp":25,"equipped":false,"notes":"acuidade, leve","weapon_type":"martial","damage":"1d6 cortante","properties":["acuidade","leve"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('shortsword','Espada curta','{"catalog_id":"shortsword","name":"Espada curta","category":"weapon","quantity":1,"weight":1,"cost_gp":10,"equipped":false,"notes":"acuidade, leve","weapon_type":"martial","damage":"1d6 perfurante","properties":["acuidade","leve"],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('trident','Tridente','{"catalog_id":"trident","name":"Tridente","category":"weapon","quantity":1,"weight":2,"cost_gp":5,"equipped":false,"notes":"arremesso, versátil","weapon_type":"martial","damage":"1d6 perfurante","properties":["arremesso","versátil"],"weapon_mode":"melee","weapon_range":1.5,"versatile_damage":"1d8"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('war-pick','Picareta de guerra','{"catalog_id":"war-pick","name":"Picareta de guerra","category":"weapon","quantity":1,"weight":1,"cost_gp":5,"equipped":false,"notes":"","weapon_type":"martial","damage":"1d8 perfurante","properties":[],"weapon_mode":"melee","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('warhammer','Martelo de guerra','{"catalog_id":"warhammer","name":"Martelo de guerra","category":"weapon","quantity":1,"weight":1,"cost_gp":15,"equipped":false,"notes":"versátil","weapon_type":"martial","damage":"1d8 concussão","properties":["versátil"],"weapon_mode":"melee","weapon_range":1.5,"versatile_damage":"1d10"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('whip','Chicote','{"catalog_id":"whip","name":"Chicote","category":"weapon","quantity":1,"weight":1.5,"cost_gp":2,"equipped":false,"notes":"acuidade, alcance","weapon_type":"martial","damage":"1d4 cortante","properties":["acuidade","alcance"],"weapon_mode":"melee","weapon_range":3}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('blowgun','Zarabatana','{"catalog_id":"blowgun","name":"Zarabatana","category":"weapon","quantity":1,"weight":0.5,"cost_gp":10,"equipped":false,"notes":"distância, munição, recarga","weapon_type":"martial","damage":"1 perfurante","properties":["distância","munição","recarga"],"weapon_mode":"ranged","weapon_range":7.5,"ammunition":"needle"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('hand-crossbow','Besta de mão','{"catalog_id":"hand-crossbow","name":"Besta de mão","category":"weapon","quantity":1,"weight":1.5,"cost_gp":75,"equipped":false,"notes":"distância, leve, munição, recarga","weapon_type":"martial","damage":"1d6 perfurante","properties":["distância","leve","munição","recarga"],"weapon_mode":"ranged","weapon_range":9,"ammunition":"bolt"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('heavy-crossbow','Besta pesada','{"catalog_id":"heavy-crossbow","name":"Besta pesada","category":"weapon","quantity":1,"weight":9,"cost_gp":50,"equipped":false,"notes":"distância, pesada, munição, recarga, duas mãos","weapon_type":"martial","damage":"1d10 perfurante","properties":["distância","pesada","munição","recarga","duas mãos"],"weapon_mode":"ranged","weapon_range":30,"ammunition":"bolt"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('longbow','Arco longo','{"catalog_id":"longbow","name":"Arco longo","category":"weapon","quantity":1,"weight":1,"cost_gp":50,"equipped":false,"notes":"distância, pesada, munição, duas mãos","weapon_type":"martial","damage":"1d8 perfurante","properties":["distância","pesada","munição","duas mãos"],"weapon_mode":"ranged","weapon_range":45,"ammunition":"arrow"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('net','Rede','{"catalog_id":"net","name":"Rede","category":"weapon","quantity":1,"weight":1.5,"cost_gp":1,"equipped":false,"notes":"distância, especial, arremesso","weapon_type":"martial","damage":"","properties":["distância","especial","arremesso"],"weapon_mode":"ranged","weapon_range":1.5}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('padded','Armadura acolchoada','{"catalog_id":"padded","name":"Armadura acolchoada","category":"armor","quantity":1,"weight":4,"cost_gp":5,"equipped":false,"notes":"Desvantagem em Furtividade","armor_type":"light","armor_base":11}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('leather','Armadura de couro','{"catalog_id":"leather","name":"Armadura de couro","category":"armor","quantity":1,"weight":5,"cost_gp":10,"equipped":false,"notes":"","armor_type":"light","armor_base":11}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('studded-leather','Couro batido','{"catalog_id":"studded-leather","name":"Couro batido","category":"armor","quantity":1,"weight":6.5,"cost_gp":45,"equipped":false,"notes":"","armor_type":"light","armor_base":12}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('hide','Armadura de peles','{"catalog_id":"hide","name":"Armadura de peles","category":"armor","quantity":1,"weight":6,"cost_gp":10,"equipped":false,"notes":"","armor_type":"medium","armor_base":12}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('chain-shirt','Cota de malha parcial','{"catalog_id":"chain-shirt","name":"Cota de malha parcial","category":"armor","quantity":1,"weight":10,"cost_gp":50,"equipped":false,"notes":"","armor_type":"medium","armor_base":13}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('scale-mail','Brunea','{"catalog_id":"scale-mail","name":"Brunea","category":"armor","quantity":1,"weight":22.5,"cost_gp":50,"equipped":false,"notes":"Desvantagem em Furtividade","armor_type":"medium","armor_base":14}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('breastplate','Peitoral','{"catalog_id":"breastplate","name":"Peitoral","category":"armor","quantity":1,"weight":10,"cost_gp":400,"equipped":false,"notes":"","armor_type":"medium","armor_base":14}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('half-plate','Meia armadura','{"catalog_id":"half-plate","name":"Meia armadura","category":"armor","quantity":1,"weight":20,"cost_gp":750,"equipped":false,"notes":"Desvantagem em Furtividade","armor_type":"medium","armor_base":15}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('ring-mail','Cota de anéis','{"catalog_id":"ring-mail","name":"Cota de anéis","category":"armor","quantity":1,"weight":20,"cost_gp":30,"equipped":false,"notes":"Desvantagem em Furtividade","armor_type":"heavy","armor_base":14}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('chain-mail','Cota de malha','{"catalog_id":"chain-mail","name":"Cota de malha","category":"armor","quantity":1,"weight":27.5,"cost_gp":75,"equipped":false,"notes":"Força 13; desvantagem em Furtividade","armor_type":"heavy","armor_base":16}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('splint','Armadura segmentada','{"catalog_id":"splint","name":"Armadura segmentada","category":"armor","quantity":1,"weight":30,"cost_gp":200,"equipped":false,"notes":"Força 15; desvantagem em Furtividade","armor_type":"heavy","armor_base":17}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('plate','Armadura de placas','{"catalog_id":"plate","name":"Armadura de placas","category":"armor","quantity":1,"weight":32.5,"cost_gp":1500,"equipped":false,"notes":"Força 15; desvantagem em Furtividade","armor_type":"heavy","armor_base":18}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('shield','Escudo','{"catalog_id":"shield","name":"Escudo","category":"armor","quantity":1,"weight":3,"cost_gp":10,"equipped":false,"notes":"","armor_type":"shield","armor_base":2}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('arrow','Flechas','{"catalog_id":"arrow","name":"Flechas","category":"ammunition","quantity":20,"weight":0.05,"cost_gp":0.05,"equipped":false,"notes":"Quantidade e preço por unidade; o disparo aprovado consome 1.","ammunition":"arrow"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('bolt','Virotes','{"catalog_id":"bolt","name":"Virotes","category":"ammunition","quantity":20,"weight":0.075,"cost_gp":0.05,"equipped":false,"notes":"Quantidade e preço por unidade; o disparo aprovado consome 1.","ammunition":"bolt"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('bullet','Balas de funda','{"catalog_id":"bullet","name":"Balas de funda","category":"ammunition","quantity":20,"weight":0.025,"cost_gp":0.002,"equipped":false,"notes":"Quantidade e preço por unidade; o disparo aprovado consome 1.","ammunition":"bullet"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('needle','Agulhas de zarabatana','{"catalog_id":"needle","name":"Agulhas de zarabatana","category":"ammunition","quantity":50,"weight":0.005,"cost_gp":0.02,"equipped":false,"notes":"Quantidade e preço por unidade; o disparo aprovado consome 1.","ammunition":"needle"}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('potion-healing','Poção de cura','{"catalog_id":"potion-healing","name":"Poção de cura","category":"potion","quantity":1,"weight":0.25,"cost_gp":50,"equipped":false,"notes":"Uma ação para beber ou administrar; cura 2d4+2 PV.","rarity":"Comum","use":{"kind":"healing","dice":"2d4+2","range":1.5,"consumed":true,"note":"Beber ou administrar a uma criatura ao alcance de toque. Não acrescenta atributo de conjuração."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('potion-greater-healing','Poção de cura maior','{"catalog_id":"potion-greater-healing","name":"Poção de cura maior","category":"potion","quantity":1,"weight":0.25,"cost_gp":0,"equipped":false,"notes":"Uma ação para beber ou administrar; cura 4d4+4 PV.","rarity":"Incomum","use":{"kind":"healing","dice":"4d4+4","range":1.5,"consumed":true,"note":"Beber ou administrar a uma criatura ao alcance de toque. Não acrescenta atributo de conjuração."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('potion-superior-healing','Poção de cura superior','{"catalog_id":"potion-superior-healing","name":"Poção de cura superior","category":"potion","quantity":1,"weight":0.25,"cost_gp":0,"equipped":false,"notes":"Uma ação para beber ou administrar; cura 8d4+8 PV.","rarity":"Rara","use":{"kind":"healing","dice":"8d4+8","range":1.5,"consumed":true,"note":"Beber ou administrar a uma criatura ao alcance de toque. Não acrescenta atributo de conjuração."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('potion-supreme-healing','Poção de cura suprema','{"catalog_id":"potion-supreme-healing","name":"Poção de cura suprema","category":"potion","quantity":1,"weight":0.25,"cost_gp":0,"equipped":false,"notes":"Uma ação para beber ou administrar; cura 10d4+20 PV.","rarity":"Muito rara","use":{"kind":"healing","dice":"10d4+20","range":1.5,"consumed":true,"note":"Beber ou administrar a uma criatura ao alcance de toque. Não acrescenta atributo de conjuração."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('acid','Ácido (frasco)','{"catalog_id":"acid","name":"Ácido (frasco)","category":"consumable","quantity":1,"weight":0.5,"cost_gp":25,"equipped":false,"notes":"","use":{"kind":"damage","dice":"2d6","range":6,"consumed":true,"note":"Ataque à distância com arma improvisada; o mestre decide o acerto."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('holy-water','Água benta (frasco)','{"catalog_id":"holy-water","name":"Água benta (frasco)","category":"consumable","quantity":1,"weight":0.5,"cost_gp":25,"equipped":false,"notes":"","use":{"kind":"damage","dice":"2d6","range":6,"consumed":true,"note":"Dano radiante somente contra ínferos ou mortos-vivos; o mestre verifica o tipo do alvo."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('antitoxin','Antitoxina','{"catalog_id":"antitoxin","name":"Antitoxina","category":"consumable","quantity":1,"weight":0,"cost_gp":50,"equipped":false,"notes":"","use":{"kind":"utility","dice":"","range":1.5,"consumed":true,"special":"antitoxin","note":"Vantagem contra veneno durante 1 hora; não beneficia construtos ou mortos-vivos. O mestre aplica a vantagem."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('healers-kit','Kit de primeiros socorros','{"catalog_id":"healers-kit","name":"Kit de primeiros socorros","category":"tool","quantity":1,"weight":1.5,"cost_gp":5,"equipped":false,"notes":"","charges":10,"use":{"kind":"utility","dice":"","range":1.5,"consumed":false,"special":"stabilize","note":"Uma ação e 1 dos 10 usos estabilizam uma criatura a 0 PV, sem restaurar PV."}}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('backpack','Mochila','{"catalog_id":"backpack","name":"Mochila","category":"container","quantity":1,"weight":2.5,"cost_gp":2,"equipped":false,"notes":"Capacidade aproximada: 15 kg."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('pouch','Bolsa','{"catalog_id":"pouch","name":"Bolsa","category":"container","quantity":1,"weight":0.5,"cost_gp":0.5,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('chest','Baú','{"catalog_id":"chest","name":"Baú","category":"container","quantity":1,"weight":12.5,"cost_gp":5,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('quiver','Aljava','{"catalog_id":"quiver","name":"Aljava","category":"container","quantity":1,"weight":0.5,"cost_gp":1,"equipped":false,"notes":"Até 20 flechas."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('waterskin','Odre','{"catalog_id":"waterskin","name":"Odre","category":"container","quantity":1,"weight":2.5,"cost_gp":0.2,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('rope','Corda de cânhamo','{"catalog_id":"rope","name":"Corda de cânhamo","category":"gear","quantity":1,"weight":5,"cost_gp":1,"equipped":false,"notes":"15 metros."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('silk-rope','Corda de seda','{"catalog_id":"silk-rope","name":"Corda de seda","category":"gear","quantity":1,"weight":2.5,"cost_gp":10,"equipped":false,"notes":"15 metros."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('bedroll','Saco de dormir','{"catalog_id":"bedroll","name":"Saco de dormir","category":"gear","quantity":1,"weight":3.5,"cost_gp":1,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('tinderbox','Caixa de fogo','{"catalog_id":"tinderbox","name":"Caixa de fogo","category":"gear","quantity":1,"weight":0.5,"cost_gp":0.5,"equipped":false,"notes":"Uma ação para acender combustível exposto."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('lantern','Lanterna coberta','{"catalog_id":"lantern","name":"Lanterna coberta","category":"gear","quantity":1,"weight":1,"cost_gp":5,"equipped":false,"notes":"Luz plena 9 m; penumbra por mais 9 m. Consome óleo."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('torch','Tocha','{"catalog_id":"torch","name":"Tocha","category":"gear","quantity":1,"weight":0.5,"cost_gp":0.01,"equipped":false,"notes":"Luz plena 6 m; penumbra por mais 6 m, durante 1 hora."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('rations','Rações (dia)','{"catalog_id":"rations","name":"Rações (dia)","category":"consumable","quantity":1,"weight":1,"cost_gp":0.5,"equipped":false,"notes":"Alimentação de 1 dia."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('oil','Óleo (frasco)','{"catalog_id":"oil","name":"Óleo (frasco)","category":"consumable","quantity":1,"weight":0.5,"cost_gp":0.1,"equipped":false,"notes":"Combustível; efeitos de fogo dependem do mestre."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('clothes','Roupas comuns','{"catalog_id":"clothes","name":"Roupas comuns","category":"gear","quantity":1,"weight":1.5,"cost_gp":0.5,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('book','Livro','{"catalog_id":"book","name":"Livro","category":"gear","quantity":1,"weight":2.5,"cost_gp":25,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('spellbook','Grimório','{"catalog_id":"spellbook","name":"Grimório","category":"gear","quantity":1,"weight":1.5,"cost_gp":50,"equipped":false,"notes":"Registro das magias de mago."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('component-pouch','Bolsa de componentes','{"catalog_id":"component-pouch","name":"Bolsa de componentes","category":"focus","quantity":1,"weight":1,"cost_gp":25,"equipped":false,"notes":"Substitui materiais sem custo e não consumidos pela magia."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('arcane-focus','Foco arcano','{"catalog_id":"arcane-focus","name":"Foco arcano","category":"focus","quantity":1,"weight":0.5,"cost_gp":10,"equipped":false,"notes":"Para mago, bruxo ou feiticeiro; não substitui materiais consumidos ou com custo."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('druidic-focus','Foco druídico','{"catalog_id":"druidic-focus","name":"Foco druídico","category":"focus","quantity":1,"weight":0,"cost_gp":1,"equipped":false,"notes":"Para druida; não substitui materiais consumidos ou com custo."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('holy-symbol','Símbolo sagrado','{"catalog_id":"holy-symbol","name":"Símbolo sagrado","category":"focus","quantity":1,"weight":0.5,"cost_gp":5,"equipped":false,"notes":"Para clérigo ou paladino; pode estar no escudo."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('thieves-tools','Ferramentas de ladrão','{"catalog_id":"thieves-tools","name":"Ferramentas de ladrão","category":"tool","quantity":1,"weight":0.5,"cost_gp":25,"equipped":false,"notes":"Abrir fechaduras e desarmar armadilhas; proficiência conforme a ficha."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('artisan-tools','Ferramentas de artesão','{"catalog_id":"artisan-tools","name":"Ferramentas de artesão","category":"tool","quantity":1,"weight":2.5,"cost_gp":10,"equipped":false,"notes":"Escolha o ofício nas observações."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('herbalism-kit','Kit de herbalismo','{"catalog_id":"herbalism-kit","name":"Kit de herbalismo","category":"tool","quantity":1,"weight":1.5,"cost_gp":5,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('disguise-kit','Kit de disfarce','{"catalog_id":"disguise-kit","name":"Kit de disfarce","category":"tool","quantity":1,"weight":1.5,"cost_gp":25,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('forgery-kit','Kit de falsificação','{"catalog_id":"forgery-kit","name":"Kit de falsificação","category":"tool","quantity":1,"weight":2.5,"cost_gp":15,"equipped":false,"notes":""}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('lute','Alaúde','{"catalog_id":"lute","name":"Alaúde","category":"tool","quantity":1,"weight":1,"cost_gp":35,"equipped":false,"notes":"Instrumento musical; pode ser foco para bardo."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_items values('flute','Flauta','{"catalog_id":"flute","name":"Flauta","category":"tool","quantity":1,"weight":0.5,"cost_gp":2,"equipped":false,"notes":"Instrumento musical; pode ser foco para bardo."}'::jsonb) on conflict(id) do update set name=excluded.name,data=excluded.data;
insert into public.dnd_combat_features values('barbarian:rage','{"id":"barbarian:rage","name":"Entrar em Fúria","resource":"barbarian:rage","cost":"bonus","operation":"rage","kind":"utility","dice":"","self":true,"range":0,"note":"Resistência a dano físico e bônus em ataques corpo a corpo com Força. Impede conjuração e encerra concentração; não funciona com armadura pesada.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('bard:inspiration','{"id":"bard:inspiration","name":"Inspirações","resource":"bard:inspiration","cost":"bonus","operation":"manual","kind":"utility","dice":"","self":false,"range":18,"note":"Dado d12. Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('warlock:luck','{"id":"warlock:luck","name":"Sorte do Próprio Obscuro","resource":"warlock:luck","cost":"free","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('warlock:hell','{"id":"warlock:hell","name":"Lançar no Inferno","resource":"warlock:hell","cost":"free","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('shared:channel-divinity','{"id":"shared:channel-divinity","name":"Canalizar Divindade","resource":"shared:channel-divinity","cost":"action","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":"Reserva compartilhada entre clérigo e paladino. Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('druid:wild-shape','{"id":"druid:wild-shape","name":"Forma Selvagem","resource":"druid:wild-shape","cost":"action","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":"Ilimitada Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('sorcerer:points','{"id":"sorcerer:points","name":"Pontos de feitiçaria","resource":"sorcerer:points","cost":"free","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":true}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('fighter:second-wind','{"id":"fighter:second-wind","name":"Retomar o Fôlego","resource":"fighter:second-wind","cost":"bonus","operation":"heal","kind":"healing","dice":"1d10+20","self":true,"range":0,"note":"","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('fighter:action-surge','{"id":"fighter:action-surge","name":"Surto de Ação","resource":"fighter:action-surge","cost":"free","operation":"surge","kind":"utility","dice":"","self":true,"range":0,"note":"Libera uma nova ação, preservando ataques pendentes, movimento e ação bônus. Máximo uma vez por turno.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('fighter:indomitable','{"id":"fighter:indomitable","name":"Indomável","resource":"fighter:indomitable","cost":"free","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('rogue:luck','{"id":"rogue:luck","name":"Golpe de Sorte","resource":"rogue:luck","cost":"free","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('monk:dash','{"id":"monk:dash","name":"Passo do Vento · Disparada","resource":"monk:ki","cost":"bonus","operation":"dash","kind":"utility","dice":"","self":true,"range":0,"note":"Gasta 1 ki; dobra a distância de salto neste turno.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('monk:disengage','{"id":"monk:disengage","name":"Passo do Vento · Desengajar","resource":"monk:ki","cost":"bonus","operation":"disengage","kind":"utility","dice":"","self":true,"range":0,"note":"Gasta 1 ki; dobra a distância de salto neste turno.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('monk:dodge','{"id":"monk:dodge","name":"Defesa Paciente","resource":"monk:ki","cost":"bonus","operation":"dodge","kind":"utility","dice":"","self":true,"range":0,"note":"Gasta 1 ki; o mestre aplica as vantagens da esquiva.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('monk:wholeness','{"id":"monk:wholeness","name":"Integridade Corporal","resource":"monk:wholeness","cost":"action","operation":"heal","kind":"healing","dice":"60","self":true,"range":0,"note":"","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('paladin:lay-hands','{"id":"paladin:lay-hands","name":"Impor as Mãos","resource":"paladin:lay-hands","cost":"action","operation":"heal","kind":"healing","dice":"amount","self":false,"range":1.5,"note":"Escolha quantos PV da reserva distribuir. Não afeta construtos ou mortos-vivos; o mestre verifica o alvo.","variable":true}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('paladin:divine-sense','{"id":"paladin:divine-sense","name":"Sentido Divino","resource":"paladin:divine-sense","cost":"action","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('paladin:cleansing','{"id":"paladin:cleansing","name":"Toque Purificador","resource":"paladin:cleansing","cost":"action","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('paladin:holy-nimbus','{"id":"paladin:holy-nimbus","name":"Aura Sagrada","resource":"paladin:holy-nimbus","cost":"action","operation":"manual","kind":"utility","dice":"","self":true,"range":0,"note":" Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.dnd_combat_features values('barbarian:end-rage','{"id":"barbarian:end-rage","name":"Encerrar Fúria","resource":"","cost":"bonus","operation":"end-rage","kind":"utility","dice":"","self":true,"range":0,"note":"","variable":false}'::jsonb) on conflict(id) do update set data=excluded.data;


create or replace function private.dnd_inventory_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare definition jsonb; amount numeric; charges integer;
begin
 if coalesce(new.data->>'catalog_id','')<>'' then select data into definition from public.dnd_items where id=new.data->>'catalog_id';
  if definition is null then raise exception 'Referência de item não encontrada no catálogo.';end if;
 else select data into definition from public.dnd_items where name=new.data->>'name';end if;
 if definition is not null then new.data=(definition-array['use','quantity','weight','cost_gp','notes','equipped'])||new.data||jsonb_build_object('catalog_id',definition->>'catalog_id','category',definition->>'category');end if;
 amount=coalesce((new.data->>'quantity')::numeric,0);
 if amount<>floor(amount) or amount<0 or coalesce((new.data->>'weight')::numeric,0)<0 or coalesce(new.data->>'category','') not in('weapon','armor','gear','item','potion','ammunition','tool','focus','consumable','container','treasure','magic') then raise exception 'Confira o tipo, a quantidade e o peso do item.';end if;
 if amount=0 then new.data=new.data||'{"equipped":false}'::jsonb;end if;
 if coalesce(new.data->>'weapon_proficiency','auto') not in('auto','proficient','untrained') or abs(coalesce((new.data->>'weapon_attack_bonus')::numeric,0))>20 or coalesce((new.data->>'weapon_attack_bonus')::numeric,0)<>floor(coalesce((new.data->>'weapon_attack_bonus')::numeric,0)) then raise exception 'Confira a proficiência e o bônus de ataque da arma.';end if;
 charges=coalesce((definition->>'charges')::integer,0);
 if new.data ? 'charges_used' and (coalesce((new.data->>'charges_used')::numeric,-1)<0 or (new.data->>'charges_used')::numeric<>floor((new.data->>'charges_used')::numeric) or (new.data->>'charges_used')::numeric>charges) then raise exception 'Usos do item acima do limite.';end if;
 return new;
end $$;
drop trigger if exists dnd_inventory_guard on public.character_inventory;
create trigger dnd_inventory_guard before insert or update on public.character_inventory for each row execute function private.dnd_inventory_guard();
-- Preserve existing quantities, descriptions and custom damage; classify known legacy items.
update public.character_inventory set data=data;

create or replace function private.dnd_expanded_spell(s jsonb,entry jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb;
begin
 if coalesce(nullif(entry->>'class_id',''),s->>'class_id')<>'warlock' then return false;end if;
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'='warlock';
 if coalesce(c->>'subclass_id','')<>'fiend' then return false;end if;
 return coalesce((c->>'subclass_id'='fiend' and (c->>'level')::integer>0 and
  (entry->>'english_name' in('Burning Hands','Command') or
  ((c->>'level')::integer>=3 and entry->>'english_name' in('Blindness/Deafness','Scorching Ray')) or
  ((c->>'level')::integer>=5 and entry->>'english_name' in('Fireball','Stinking Cloud')) or
  ((c->>'level')::integer>=7 and entry->>'english_name' in('Fire Shield','Wall of Fire')) or
  ((c->>'level')::integer>=9 and entry->>'english_name' in('Flame Strike','Hallow')))),false);
end $$;
create or replace function private.dnd_spell_inactive(s jsonb,entry jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare origin jsonb; chosen_id text=coalesce(nullif(entry->>'class_id',''),s->>'class_id'); sub text;
 progress public.dnd_spell_progression; grants jsonb; lvl integer=coalesce((entry->>'level')::integer,0); grant_id text=entry->>'granted_feature'; maxgrants integer=0;
begin
 select c into origin from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'=chosen_id;
 if origin is null then return true;end if;
 sub=case when origin->>'subclass_id' in('eldritch-knight','arcane-trickster') then origin->>'subclass_id' else '' end;
 select * into progress from public.dnd_spell_progression where class_id=chosen_id and subclass_id=sub and level=(origin->>'level')::integer;
 if progress.class_id is null or (progress.cantrips=0 and jsonb_array_length(progress.slots)=0) then return true;end if;
 if nullif(entry->>'granted_path','') is not null then
  if origin->>'subclass_id' is distinct from entry->>'granted_path' then return true;end if;
  select data->'path_spells'->(coalesce(origin->>'subclass_id','')||':'||(origin->>'level')||':'||coalesce(origin->'choices'->'land'->>0,'')) into grants from public.dnd_character_build_rules where class_id=chosen_id;
  return not coalesce(grants ? (entry->>'english_name'),false);
 end if;
 if grant_id='magical-secrets' then
  if chosen_id<>'bard' then return true;end if;
  maxgrants=case when origin->>'subclass_id'='lore' and (origin->>'level')::integer>=6 then 2 else 0 end+case when (origin->>'level')::integer>=10 then 2 else 0 end+case when (origin->>'level')::integer>=14 then 2 else 0 end+case when (origin->>'level')::integer>=18 then 2 else 0 end;
  if maxgrants=0 then return true;end if;
 elsif grant_id='pact-tome' then
  if chosen_id<>'warlock' or (origin->>'level')::integer<3 or not coalesce(origin->'choices'->'pact' ? 'tome',false) or lvl<>0 then return true;end if;
 elsif nullif(grant_id,'') is not null then return true;
 elsif nullif(entry->>'catalog_id','') is not null and not private.dnd_expanded_spell(s,entry) and not exists(select 1 from public.dnd_spell_classes where spell_id=entry->>'catalog_id' and class_id=case when sub<>'' then 'wizard' else chosen_id end) then return true;
 end if;
 if entry->>'casting_mode'='arcanum' then return chosen_id<>'warlock' or not(private.dnd_spell_pools(s)->'arcanum_levels' @> jsonb_build_array(lvl));end if;
 return (lvl=0 and progress.cantrips=0) or lvl>jsonb_array_length(progress.slots);
end $$;

create or replace function private.dnd_healing_dice(s jsonb,expression text) returns text language plpgsql immutable set search_path='' as $$
declare term text[];result text='';
begin
 if not exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='cleric' and c->>'subclass_id'='life' and (c->>'level')::integer>=17) then return expression;end if;
 for term in select regexp_matches(regexp_replace(expression,'\s','','g'),'([+-]?)(\d+)(?:d(\d+))?','g') loop
  result=result||coalesce(term[1],'')||case when term[3] is not null then (term[2]::integer*term[3]::integer)::text else term[2] end;
 end loop;return result;
end $$;

create or replace function private.dnd_special_spell_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;g text=new.data->>'granted_feature'; origin text; maximum integer;
begin
 if nullif(g,'') is null then return new;end if;
 select system_data into s from public.characters where id=new.character_id;
 origin=coalesce(nullif(new.data->>'class_id',''),s->>'class_id');
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'=origin;
 maximum=case g when 'pact-tome' then 3 when 'magical-secrets' then
  case when c->>'subclass_id'='lore' and (c->>'level')::integer>=6 then 2 else 0 end+case when (c->>'level')::integer>=10 then 2 else 0 end+case when (c->>'level')::integer>=14 then 2 else 0 end+case when (c->>'level')::integer>=18 then 2 else 0 end else 0 end;
 if private.dnd_spell_inactive(s,new.data) or (select count(*) from public.character_spells where character_id=new.character_id and id<>new.id and data->>'granted_feature'=g and coalesce(nullif(data->>'class_id',''),s->>'class_id')=origin)>=maximum then raise exception 'A concessão especial não está disponível ou excede suas escolhas.';end if;
 return new;
end $$;
drop trigger if exists dnd_special_spell_guard on public.character_spells;
create trigger dnd_special_spell_guard before insert or update on public.character_spells for each row execute function private.dnd_special_spell_guard();

-- A multiclass character may learn the same spell with a different class origin.
-- Keep each origin unique, because it determines learning, casting ability and DC.
drop index if exists public.character_catalog_spell_once;
create unique index if not exists character_catalog_spell_origin_once on public.character_spells(character_id,catalog_id,(coalesce(nullif(data->>'class_id',''),''))) where catalog_id is not null;

create or replace function private.dnd_learning_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;p public.dnd_spell_progression;origin text;entry jsonb;sub text;known integer=0;cantrips integer=0;secrets integer=0;lore integer=0;
begin
 select system_data into s from public.characters where id=new.character_id;
 -- Preserve old incompatible entries as inactive references. They grant no casting.
 if private.dnd_spell_inactive(s,new.data) then return new;end if;
 origin=coalesce(nullif(new.data->>'class_id',''),s->>'class_id');
 if nullif(new.data->>'catalog_id','') is not null and exists(select 1 from public.character_spells q where q.character_id=new.character_id and q.id<>new.id and q.data->>'catalog_id'=new.data->>'catalog_id' and coalesce(nullif(q.data->>'class_id',''),s->>'class_id')=origin) then raise exception 'Esta magia já está no grimório desta classe.';end if;
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'=origin;
 sub=case when c->>'subclass_id' in('eldritch-knight','arcane-trickster') then c->>'subclass_id' else '' end;
 select * into p from public.dnd_spell_progression where class_id=origin and subclass_id=sub and level=(c->>'level')::integer;
 if origin='bard' and c->>'subclass_id'='lore' and (c->>'level')::integer>=6 then lore=2;end if;
 for entry in select data from public.character_spells where character_id=new.character_id and id<>new.id union all select new.data loop
  if coalesce(nullif(entry->>'class_id',''),s->>'class_id')<>origin or private.dnd_spell_inactive(s,entry) or nullif(entry->>'granted_path','') is not null or entry->>'casting_mode'='arcanum' then continue;end if;
  if entry->>'granted_feature'='magical-secrets' then secrets=secrets+1;
  elsif nullif(entry->>'granted_feature','') is null then
   if (entry->>'level')::integer=0 then cantrips=cantrips+1;else known=known+1;end if;
  end if;
 end loop;
 if cantrips>p.cantrips then raise exception 'O limite de truques da classe foi atingido.';end if;
 if p.spells_known is not null and known+greatest(0,secrets-lore)>p.spells_known then raise exception 'O limite de magias conhecidas da classe foi atingido. Remova uma escolha para substituí-la.';end if;
 return new;
end $$;
drop trigger if exists dnd_learning_guard on public.character_spells;
create trigger dnd_learning_guard before insert or update on public.character_spells for each row execute function private.dnd_learning_guard();

create or replace function private.dnd_feature_definition(s jsonb,feature_id text,units integer,raging boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f jsonb; caps jsonb; maximum integer; used integer; resource text;
begin
 select data into f from public.dnd_combat_features where dnd_combat_features.id=feature_id;
 if f is null then raise exception 'Habilidade de combate desconhecida.';end if;
 resource=f->>'resource'; caps=private.dnd_feature_caps(s,s->'abilities');maximum=coalesce((caps->>resource)::integer,0);used=coalesce((s->'feature_uses'->>resource)::integer,0);
 if feature_id='barbarian:end-rage' then if not raging then raise exception 'A Fúria não está ativa.';end if;
 elsif maximum=0 or used+units>maximum then raise exception 'Não há usos disponíveis para esta habilidade.';end if;
 if units<1 or units>1000 or (not coalesce((f->>'variable')::boolean,false) and units<>1) then raise exception 'Quantidade de pontos inválida.';end if;
 if feature_id='barbarian:rage' then
  if raging then raise exception 'A Fúria já está ativa.';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where coalesce((i->>'equipped')::boolean,false) and i->>'armor_type'='heavy' and (i->>'quantity')::integer>0) then raise exception 'Retire a armadura pesada para usar os benefícios da Fúria.';end if;
 elsif feature_id='fighter:second-wind' then f=f||jsonb_build_object('dice','1d10+'||private.dnd_class_level(s,'fighter'));
 elsif feature_id='monk:wholeness' then f=f||jsonb_build_object('dice',(3*private.dnd_class_level(s,'monk'))::text);
 elsif feature_id='paladin:lay-hands' then f=f||jsonb_build_object('dice',units::text);
 elsif feature_id='bard:inspiration' then f=f||jsonb_build_object('note','Inspiração: d'||case when private.dnd_class_level(s,'bard')>=15 then 12 when private.dnd_class_level(s,'bard')>=10 then 10 when private.dnd_class_level(s,'bard')>=5 then 8 else 6 end||'. Mestre e jogador aplicam o dado a uma jogada elegível nos próximos 10 minutos.');
 end if;
 return f||jsonb_build_object('units',units);
end $$;

create or replace function private.dnd_weapon_proficient(item jsonb,s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare classes jsonb=private.dnd_levels(s);primary_class text;simple boolean=coalesce(item->>'weapon_type','simple')='simple';id text=coalesce(item->>'catalog_id','');
begin
 if item->>'weapon_proficiency'='proficient' then return true;end if;
 if item->>'weapon_proficiency'='untrained' then return false;end if;
 if id='unarmed' then return true;end if;
 primary_class=classes->0->>'class_id';
 if exists(select 1 from jsonb_array_elements(classes) c where c->>'class_id' in('barbarian','fighter','paladin','ranger')) then return true;end if;
 if exists(select 1 from jsonb_array_elements(classes) c where c->>'class_id'='monk') and (simple or id='shortsword') then return true;end if;
 if exists(select 1 from jsonb_array_elements(classes) c where c->>'class_id'='warlock') and simple then return true;end if;
 if primary_class in('bard','rogue') then return simple or id in('hand-crossbow','longsword','rapier','shortsword');end if;
 if primary_class in('cleric','artificer') then return simple;end if;
 if primary_class='druid' then return id in('club','dagger','dart','javelin','mace','quarterstaff','scimitar','sickle','sling','spear');end if;
 if primary_class in('wizard','sorcerer') then return id in('dagger','dart','sling','quarterstaff','light-crossbow');end if;
 return false;
end $$;
create or replace function private.dnd_weapon_traits(item jsonb,s jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare txt text=lower(coalesce(item->>'name','')||' '||coalesce(item->>'notes','')||' '||coalesce(item->'properties','[]')::text);ranged boolean; finesse boolean; unarmed boolean; martial boolean; ability text;strmod integer;dexmod integer;
begin
 ranged=item->>'weapon_mode'='ranged' or txt~'(arco|besta|funda|zarabatana)';ranged=coalesce(ranged,false);
 finesse=txt~'(acuidade|adaga|rapieira|cimitarra|espada curta|chicote)';unarmed=coalesce(item->>'catalog_id'='unarmed',false);
 martial=private.dnd_class_level(s,'monk')>0 and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'category'='armor' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0)
  and (unarmed or (not ranged and txt!~'(pesada|duas mãos|duas maos)' and (item->>'weapon_type'='simple' or txt~'(bordão|bordao|lança|lanca|clava|adaga|machadinha|martelo leve|foice|espada curta)')));
 strmod=floor((coalesce((s->'abilities'->>'str')::numeric,10)-10)/2);dexmod=floor((coalesce((s->'abilities'->>'dex')::numeric,10)-10)/2);
 ability=coalesce(nullif(item->>'weapon_ability',''),case when item->>'catalog_id'='net' then 'dex' when ranged and txt!~'arremesso' then 'dex' when finesse or martial then case when dexmod>strmod then 'dex' else 'str' end else 'str' end);
 return jsonb_build_object('ranged',ranged,'finesse',finesse,'unarmed',unarmed,'martial',martial,'ability',ability,'twoHanded',txt~'(duas mãos|duas maos)','light',txt~'leve');
end $$;
create or replace function private.dnd_has_style(s jsonb,id text) returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where coalesce(c->'choices'->'style' ? id,false) or coalesce(c->'choices'->'second-style' ? id,false))
$$;
create or replace function private.dnd_weapon_effect(item jsonb,s jsonb,opts jsonb default '{}',raging boolean default false) returns jsonb language plpgsql immutable set search_path='' as $$
declare e jsonb=private.dnd_weapon_base(item,s);t jsonb=private.dnd_weapon_traits(item,s);mod integer;dice text;parts jsonb;l integer;monk integer=private.dnd_class_level(s,'monk');sides integer;twohands boolean=coalesce((opts->>'two_handed')::boolean,false);crit integer=20;c jsonb;
begin
 if s->>'class_id'='npc' then return e;end if;
 dice=coalesce(regexp_replace(substring(item->>'damage' from '\d+d\d+(?:\s*[+-]\s*\d+)?'),'\s','','g'),'1');
 if twohands and nullif(item->>'versatile_damage','') is not null then dice=item->>'versatile_damage';end if;
 if coalesce((t->>'martial')::boolean,false) then
  sides=case when monk>=17 then 10 when monk>=11 then 8 when monk>=5 then 6 else 4 end;
  if (t->>'unarmed')::boolean or (dice~'^1d\d+$' and substring(dice from '^1d(\d+)$')::integer<sides) then dice='1d'||sides;end if;
 end if;
 mod=floor((coalesce((s->'abilities'->>(t->>'ability'))::numeric,10)-10)/2);
 if coalesce((opts->>'offhand')::boolean,false) and not private.dnd_has_style(s,'two-weapon') then mod=least(0,mod);end if;
 if raging and not(t->>'ranged')::boolean and t->>'ability'='str' then l=private.dnd_class_level(s,'barbarian');mod=mod+case when l>=16 then 4 when l>=9 then 3 else 2 end;end if;
 if private.dnd_has_style(s,'dueling') and not(t->>'ranged')::boolean and not(t->>'unarmed')::boolean and not(t->>'twoHanded')::boolean and not twohands and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'id' is distinct from item->>'id' and i->>'category'='weapon' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0) then mod=mod+2;end if;
 parts=jsonb_build_array(jsonb_build_object('dice',dice||case when mod>=0 then '+' else '' end||mod,'damageType',e->>'damageType'));
 if coalesce((opts->>'sneak')::boolean,false) then parts=parts||jsonb_build_array(jsonb_build_object('dice',ceil(private.dnd_class_level(s,'rogue')::numeric/2)::integer||'d6','damageType',e->>'damageType'));end if;
 if coalesce((opts->>'hunter')::boolean,false) then parts=parts||jsonb_build_array(jsonb_build_object('dice','1d8','damageType',e->>'damageType'));end if;
 if not(t->>'ranged')::boolean and not(t->>'unarmed')::boolean and private.dnd_class_level(s,'paladin')>=11 then parts=parts||jsonb_build_array(jsonb_build_object('dice','1d8','damageType','radiante'));end if;
 if coalesce((opts->>'smite_level')::integer,0)>0 then parts=parts||jsonb_build_array(jsonb_build_object('dice',(least(5,(opts->>'smite_level')::integer+1)+case when coalesce((opts->>'smite_special')::boolean,false) then 1 else 0 end)||'d8','damageType','radiante'));end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop if c->>'class_id'='fighter' and c->>'subclass_id'='champion' then crit=case when (c->>'level')::integer>=15 then 18 when (c->>'level')::integer>=3 then 19 else 20 end;end if;end loop;
 return e||jsonb_build_object('dice',case when item->>'catalog_id'='net' then '' else (select string_agg(p->>'dice','+' order by n) from jsonb_array_elements(parts) with ordinality a(p,n)) end,'damageParts',case when item->>'catalog_id'='net' then '[]'::jsonb else parts end,'kind',case when item->>'catalog_id'='net' then 'utility' else e->>'kind' end,'review',case when item->>'catalog_id'='net' then true else coalesce((e->>'review')::boolean,false) end,'note',case when item->>'catalog_id'='net' then 'Rede não causa dano. O mestre aplica a condição contido e as restrições de tamanho e de ataque descritas no item.' else e->>'note' end,
  'attackBonus',floor((coalesce((s->'abilities'->>(t->>'ability'))::numeric,10)-10)/2)+case when private.dnd_weapon_proficient(item,s) then 2+((s->>'level')::integer-1)/4 else 0 end+coalesce((item->>'weapon_attack_bonus')::integer,0)+case when (t->>'ranged')::boolean and private.dnd_has_style(s,'archery') then 2 else 0 end,'criticalAt',crit,
  'rerollWeaponDice',case when private.dnd_has_style(s,'great-weapon') and not(t->>'ranged')::boolean and ((t->>'twoHanded')::boolean or twohands) then coalesce(substring(dice from '^(\d+)d')::integer,0) else 0 end);
end $$;
create or replace function private.dnd_check_weapon_options(t public.battle_map_tokens,item jsonb,s jsonb,opts jsonb,target_ids jsonb) returns void language plpgsql stable security definer set search_path='' as $$
declare traits jsonb=private.dnd_weapon_traits(item,s);p jsonb;maximum integer;used integer;l integer=coalesce((opts->>'smite_level')::integer,0);kind text=coalesce(opts->>'smite_kind','slot');c jsonb;foe public.battle_map_tokens;target_sheet jsonb;
begin
 if jsonb_typeof(opts) is distinct from 'object' then raise exception 'Opções de ataque inválidas.';end if;
 if item->>'catalog_id'='net' and (coalesce((opts->>'sneak')::boolean,false) or coalesce((opts->>'hunter')::boolean,false) or coalesce((opts->>'smite_level')::integer,0)>0) then raise exception 'Rede não causa dano; o mestre aplica sua condição.';end if;
 if t.npc_id is not null then if opts<>'{}'::jsonb then raise exception 'NPC usa as ações de sua própria ficha.';end if;return;end if;
 p=private.dnd_spell_pools(s);
 if coalesce((opts->>'two_handed')::boolean,false) and (nullif(item->>'versatile_damage','') is null or exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'armor_type'='shield' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0)) then raise exception 'Duas mãos exige arma versátil e ausência de escudo.';end if;
 if coalesce((opts->>'sneak')::boolean,false) and (private.dnd_class_level(s,'rogue')=0 or t.sneak_used or not((traits->>'ranged')::boolean or (traits->>'finesse')::boolean)) then raise exception 'Ataque Furtivo indisponível para esta arma ou turno.';end if;
 if coalesce((opts->>'offhand')::boolean,false) and (not t.weapon_attacked or t.bonus_used or not coalesce((item->>'equipped')::boolean,false) or not(traits->>'light')::boolean or (traits->>'ranged')::boolean or not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'id' is distinct from item->>'id' and i->>'category'='weapon' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0 and (private.dnd_weapon_traits(i,s)->>'light')::boolean and not(private.dnd_weapon_traits(i,s)->>'ranged')::boolean)) then raise exception 'Segunda arma exige duas armas leves corpo a corpo e um ataque realizado neste turno.';end if;
 if coalesce((opts->>'hunter')::boolean,false) then
  select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'='ranger';
  if c is null or (c->>'level')::integer<3 or c->>'subclass_id'<>'hunter' or not exists(select 1 from jsonb_array_elements_text(coalesce(c->'choices'->'hunter-3','[]')) v where v like 'Matador de Colossos%') or t.hunter_used then raise exception 'Matador de Colossos indisponível.';end if;
  select * into foe from public.battle_map_tokens where id=(target_ids->>0)::uuid;
  if foe.id is null or foe.map_id<>t.map_id or not private.can_read_battle_token(foe.id) then raise exception 'Alvo indisponível nesta mesa.' using errcode='42501';end if;
  target_sheet=private.battle_sheet(foe.id);
  if target_sheet is null or (target_sheet->>'hp_current')::integer>=private.battle_hp_max(target_sheet) then raise exception 'Matador de Colossos exige alvo ferido.';end if;
 end if;
 if l<0 or l>9 then raise exception 'Círculo de Destruição Divina inválido.';end if;
 if l>0 then
  if private.dnd_class_level(s,'paladin')<2 or (traits->>'ranged')::boolean then raise exception 'Destruição Divina exige paladino 2 e ataque corpo a corpo.';end if;
  if kind='slot' then maximum=coalesce((p->'slots'->>(l-1))::integer,0);used=coalesce((s->'slots_used'->>l::text)::integer,0);
  elsif kind='pact' and l=(p->>'pact_level')::integer then maximum=(p->>'pact_slots')::integer;used=coalesce((s->>'pact_slots_used')::integer,0);
  else raise exception 'Recurso incompatível com Destruição Divina.';end if;
  if maximum<=used then raise exception 'Sem espaço disponível para Destruição Divina.';end if;
 end if;
 if nullif(item->>'ammunition','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'category'='ammunition' and i->>'ammunition'=item->>'ammunition' and (i->>'quantity')::integer>0) then raise exception 'Adicione munição compatível ao inventário antes de disparar.';end if;
end $$;

create or replace function private.dnd_critical_expression(expression text) returns text language plpgsql immutable set search_path='' as $$
declare term text[];result text='';
begin
 for term in select regexp_matches(regexp_replace(expression,'\s','','g'),'([+-]?)(\d+)(?:d(\d+))?','g') loop
  result=result||coalesce(term[1],'')||case when term[3] is not null then (2*term[2]::integer)::text||'d'||term[3] else term[2] end;
 end loop;return result;
end $$;

create or replace function private.dnd_roll_damage_parts(terms jsonb,parts jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare p jsonb;result jsonb='[]';position integer=0;n integer;amount integer;
begin
 for p in select value from jsonb_array_elements(coalesce(parts,'[]')) loop
  select count(*) into n from regexp_matches(p->>'dice','([+-]?)(\d+)(?:d(\d+))?','g');
  amount=0;for i in position..position+n-1 loop amount=amount+coalesce((terms->i->>'subtotal')::integer,0);end loop;position=position+n;
  result=result||jsonb_build_array(jsonb_build_object('damageType',p->>'damageType','amount',greatest(0,amount)));
 end loop;return result;
end $$;
create or replace function private.dnd_damage_amount(t public.battle_map_tokens,s jsonb,e jsonb,roll integer,saved boolean,options jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare factor numeric;amount integer=0;parts jsonb;part jsonb;dtype text;v integer;has_evasion boolean=false;
begin
 factor=case when saved then case when coalesce((e->>'halfOnSave')::boolean,false) then 0.5 else 0 end else 1 end;
 has_evasion=t.character_id is not null and (private.dnd_class_level(s,'rogue')>=7 or private.dnd_class_level(s,'monk')>=7 or exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='ranger' and c->>'subclass_id'='hunter' and (c->>'level')::integer>=15 and c->'choices'->'hunter-15' ? 'Evasão')) and not coalesce(s->'conditions' ?| array['Incapacitado','Inconsciente','Paralisado','Atordoado','Petrificado'],false);
 if has_evasion and lower(coalesce(e->>'save',''))='dex' and coalesce((e->>'halfOnSave')::boolean,false) then factor=case when saved then 0 else 0.5 end;end if;
 parts=case when jsonb_array_length(coalesce(options->'damage_parts','[]'))>0 then options->'damage_parts' else jsonb_build_array(jsonb_build_object('amount',roll,'damageType',e->>'damageType')) end;
 for part in select value from jsonb_array_elements(parts) loop
  dtype=lower(coalesce(part->>'damageType',''));v=floor((part->>'amount')::numeric*factor);
  if dtype='veneno' and private.dnd_class_level(s,'monk')>=10 then v=0;end if;
  if t.raging and dtype in('cortante','perfurante','concussão','concussao') and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'armor_type'='heavy' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0) then v=floor(v::numeric/2);end if;
  amount=amount+v;
 end loop;return amount;
end $$;
create or replace function private.dnd_attack_roll_detail(expression text,e jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare detail jsonb=private.battle_roll_detail(expression,'normal');terms jsonb;term jsonb;vals jsonb;original jsonb;total integer;subtotal integer=0;n integer;v integer;
begin
 n=coalesce((e->>'rerollWeaponDice')::integer,0);if n<1 then return detail;end if;
 terms=detail->'terms';term=terms->0;vals=term->'values';original=vals;
 for i in 0..least(n,jsonb_array_length(vals))-1 loop
  v=(vals->>i)::integer;if v in(1,2) then vals=jsonb_set(vals,array[i::text],to_jsonb(floor(random()*(term->>'sides')::integer)::integer+1));end if;
 end loop;
 select sum(value::integer) into subtotal from jsonb_array_elements_text(vals);
 total=(detail->>'total')::integer-(term->>'subtotal')::integer+subtotal*(term->>'sign')::integer;
 term=term||jsonb_build_object('values',vals,'subtotal',subtotal*(term->>'sign')::integer,'rerolled_from',original);terms=jsonb_set(terms,'{0}',term);
 return detail||jsonb_build_object('terms',terms,'total',total);
end $$;

create or replace function private.dnd_item_special(r public.battle_action_requests,e jsonb) returns void language plpgsql security definer set search_path='' as $$
declare target public.battle_map_tokens;sheet jsonb;condition text;
begin
 if coalesce(e->>'special','') not in('stabilize','antitoxin') then return;end if;
 for target in select * from public.battle_map_tokens where id=any(r.target_ids) and map_id=r.map_id order by id for update loop
  if target.character_id is null then
   if e->>'special'='stabilize' and (private.battle_sheet(target.id)->>'hp_current')::integer<>0 then raise exception 'Estabilizar exige uma criatura com 0 PV.';end if;
   continue; -- NPC death saves and poison saves are narrated by the GM.
  end if;
  perform 1 from public.characters where id=target.character_id for update;sheet=private.battle_sheet(target.id);
  if e->>'special'='stabilize' then
   if (sheet->>'hp_current')::integer<>0 or coalesce((sheet->>'death_failures')::integer,0)>=3 then raise exception 'Só é possível estabilizar uma criatura viva com 0 PV.';end if;
   update public.characters set system_data=system_data||jsonb_build_object('death_successes',0,'death_failures',0) where id=target.character_id;condition='Estável';
  else condition='Antitoxina (1 hora; mestre controla duração)';end if;
  if not coalesce(sheet->'conditions' ? condition,false) then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce(system_data->'conditions','[]')||jsonb_build_array(condition)) where id=target.character_id;end if;
 end loop;
end $$;
create or replace function private.dnd_weapon_base(p_data jsonb,p_sheet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare textval text=lower(coalesce(p_data->>'name','')||' '||coalesce(p_data->>'notes','')); ranged boolean; mod integer; reach numeric; dice text; dtype text;
begin
 ranged=coalesce(p_data->>'weapon_mode','')='ranged' or textval ~ '(arco|besta|funda|zarabatana)';
 mod=floor((coalesce((p_sheet->'abilities'->>coalesce(nullif(p_data->>'weapon_ability',''),case when ranged then 'dex' else 'str' end))::numeric,10)-10)/2);
 if nullif(p_data->>'weapon_ability','') is null and not ranged and textval ~ '(acuidade|adaga|rapieira)' then
  mod=greatest(mod,floor((coalesce((p_sheet->'abilities'->>'dex')::numeric,10)-10)/2));
 end if;
 if p_sheet->>'class_id'='npc' then mod=0; end if; -- NPC attack formulas already contain their modifiers.
 reach=coalesce((p_data->>'weapon_range')::numeric,case when ranged then coalesce((substring(textval from 'alcance\s+(\d+)'))::numeric,24) when textval ~ '(alcance|glaive|alabarda|chicote)' then 3 else 1.5 end);
 if p_sheet->>'class_id'='npc' then reach=coalesce((substring(replace(p_data->>'range',',','.') from '\d+(?:\.\d+)?'))::numeric,1.5); end if;
 dice=coalesce(regexp_replace(substring(p_data->>'damage' from '\d+d\d+(?:\s*[+-]\s*\d+)?'),'\s','','g'),'1');
 dtype=coalesce(substring(lower(p_data->>'damage') from '(cortante|perfurante|concussão|fogo|frio|radiante|necrótico|veneno|ácido|trovejante|elétrico|psíquico|energia)'),'');
 return jsonb_build_object('shape','single','kind','damage','range',greatest(0,least(600,reach)),'size',0,'width',1.5,'origin','point','dice',dice||case when mod>=0 then '+' else '' end||mod,'damageType',dtype,'review',false,'timing','immediate');
end $$;

create or replace function private.battle_sheet(p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; s jsonb;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if t.character_id is not null then
  select system_data into s from public.characters where id=t.character_id;
  return s || jsonb_build_object('abilities',coalesce((select jsonb_object_agg(ability,score) from public.character_attributes where character_id=t.character_id),'{}'),'inventory',coalesce((select jsonb_agg(data||jsonb_build_object('id',id) order by id) from public.character_inventory where character_id=t.character_id),'[]'),'raging',t.raging);
 end if;
 select jsonb_build_object('level',n.level,'class_id','npc','abilities',ns.abilities,'hp_current',ns.hp_current,'hp_max_override',ns.hp_max,'hp_temp',ns.hp_temp)
 into s from public.npcs n join public.npc_stats ns on ns.npc_id=n.id where n.id=t.npc_id;
 return s;
end $$;

create or replace function private.battle_weapon(p_data jsonb,p_sheet jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare item alias for $1;s alias for $2;entry jsonb=item;begin
 if not(entry ? 'id') then select i into entry from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i-'id'=item limit 1;entry=coalesce(entry,item);end if;
 return private.dnd_weapon_effect(entry,s,'{}',coalesce((s->>'raging')::boolean,false));end $$;

create or replace function public.validate_dnd_spell_reference() returns trigger
language plpgsql security invoker set search_path='' as $$
declare reference public.dnd_spells; sheet jsonb; lvl integer; choices smallint[];origin jsonb; prog public.dnd_spell_progression;sub text;pool jsonb;
begin
 if nullif(new.data->>'catalog_id','') is not null then
  select * into reference from public.dnd_spells where id=new.data->>'catalog_id';
  if reference.id is null then raise exception 'Esta magia não existe no catálogo.'; end if;
  if (new.data->>'level')::integer is distinct from reference.level then raise exception 'O círculo da magia difere do catálogo.'; end if;
  -- Canonical descriptions remain canonical; preparation, notes and origin stay with the character.
  new.data=new.data||(reference.data-array['id','classes','edition','class_sources'])||jsonb_build_object('catalog_classes',(select coalesce(jsonb_agg(c.class_id order by c.class_id),'[]') from public.dnd_spell_classes c where c.spell_id=reference.id));
 end if;
 if tg_table_name='character_spells' and new.data->>'casting_mode'='arcanum' then
  select system_data into sheet from public.characters where id=new.character_id;
  lvl=(new.data->>'level')::integer;
  pool=private.dnd_spell_pools(sheet);
  if not(sheet ? 'class_levels') and not pool->'arcanum_levels' @> jsonb_build_array(lvl) then raise exception 'Este Arcano Místico ainda não está disponível.'; end if;
  if reference.id is not null and not exists(select 1 from public.dnd_spell_classes where spell_id=reference.id and class_id='warlock') then raise exception 'Escolha um Arcano Místico da lista do Bruxo.'; end if;
 end if;
 if tg_table_name='character_spells' then
  select system_data into sheet from public.characters where id=new.character_id;
  if coalesce(new.data->>'casting_mode','class')='class' and coalesce(new.data->>'granted_path','')='' and coalesce(new.data->>'granted_feature','')='' then
   select c into origin from jsonb_array_elements(private.dnd_levels(sheet)) c where c->>'class_id'=coalesce(nullif(new.data->>'class_id',''),sheet->>'class_id');
   sub=case when origin->>'subclass_id' in('eldritch-knight','arcane-trickster') then origin->>'subclass_id' else '' end;
   select * into prog from public.dnd_spell_progression where class_id=origin->>'class_id' and subclass_id=sub and level=(origin->>'level')::integer;
   if origin is not null and reference.id is not null and not exists(select 1 from public.dnd_spell_classes where spell_id=reference.id and class_id=case when sub<>'' then 'wizard' else origin->>'class_id' end) and not private.dnd_expanded_spell(sheet,new.data) then raise exception 'A magia não pertence à lista da classe de origem; registre concessões especiais como extras.';end if;
  end if;
  if private.dnd_spell_inactive(sheet,new.data) then new.data=new.data||'{"inactive":true}'::jsonb;else new.data=new.data-'inactive';end if;
 end if;
 return new;
end $$;

create or replace function public.save_character(p_payload jsonb,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cid uuid=(p_payload->>'id')::uuid; s jsonb=p_payload->'sheet'; old_row public.characters;
  saved public.characters; system_slug text; attribute text; entry jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into old_row from public.characters where id=cid for update;
  if old_row.id is not null and p_expected_updated_at is not null and old_row.updated_at<>p_expected_updated_at then
    raise exception 'Esta ficha foi atualizada em outra sessão. Feche e reabra antes de salvar.';
  end if;
  if old_row.id is not null and (old_row.owner_id<>(p_payload->>'owner_id')::uuid or old_row.campaign_id<>(p_payload->>'campaign_id')::uuid or old_row.rpg_system_id<>(p_payload->>'rpg_system_id')::uuid) then
    raise exception 'O vínculo do personagem não pode ser alterado.' using errcode='42501';
  end if;
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'A ficha é inválida.'; end if;
  select slug into system_slug from public.rpg_systems where id=(p_payload->>'rpg_system_id')::uuid;
  if system_slug='dnd5e' then
    perform private.dnd_validate_build(s,s->'abilities');
    if coalesce((s->>'level')::integer,0) not between 1 and 20 then raise exception 'O nível deve estar entre 1 e 20.'; end if;
    foreach attribute in array array['str','dex','con','int','wis','cha'] loop
      if coalesce((s->'abilities'->>attribute)::integer,0) not between 1 and 30 then raise exception 'Os atributos devem estar entre 1 e 30.'; end if;
    end loop;
    if coalesce((s->>'hp_current')::integer,-1)<0 or coalesce((s->>'hp_temp')::integer,-1)<0 or coalesce((s->>'xp')::bigint,-1)<0 then raise exception 'PV e experiência não podem ser negativos.'; end if;
    if s->>'hp_max_override' is not null and (s->>'hp_max_override')::integer<1 then raise exception 'O máximo de PV deve ser positivo.'; end if;
  end if;
  if jsonb_typeof(s->'inventory') is distinct from 'array' or jsonb_typeof(s->'spells') is distinct from 'array' or jsonb_typeof(s->'abilities') is distinct from 'object' or jsonb_typeof(s->'skills') is distinct from 'object' then raise exception 'Os registros da ficha são inválidos.'; end if;
  insert into public.characters(id,campaign_id,rpg_system_id,owner_id,name,portrait_path,appearance,biography,system_data)
  values(cid,(p_payload->>'campaign_id')::uuid,(p_payload->>'rpg_system_id')::uuid,(p_payload->>'owner_id')::uuid,trim(p_payload->>'name'),p_payload->>'portrait_path',coalesce(p_payload->>'appearance',''),coalesce(p_payload->>'biography',''),s-array['abilities','skills','inventory','spells'])
  on conflict(id) do update set name=excluded.name,portrait_path=excluded.portrait_path,appearance=excluded.appearance,biography=excluded.biography,system_data=excluded.system_data
  returning * into saved;
  delete from public.character_attributes where character_id=cid;
  insert into public.character_attributes(character_id,ability,score) select cid,key,value::integer from jsonb_each_text(s->'abilities');
  delete from public.character_skills where character_id=cid;
  insert into public.character_skills(character_id,skill,proficiency) select cid,key,value::smallint from jsonb_each_text(s->'skills');
  delete from public.character_inventory where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'inventory') loop
    if length(trim(entry->>'name'))=0 or coalesce((entry->>'quantity')::integer,0)<0 or coalesce((entry->>'weight')::numeric,-1)<0 then raise exception 'Confira a quantidade e o peso dos itens.'; end if;
    insert into public.character_inventory(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  delete from public.character_spells where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'spells') loop
    if coalesce(length(trim(entry->>'name')),0)=0 or coalesce((entry->>'level')::integer,-1) not between 0 and 9 then raise exception 'Confira o nome e o nível das magias.'; end if;
    insert into public.character_spells(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  return jsonb_build_object('id',saved.id,'updated_at',saved.updated_at);
end $$;

create or replace function private.dnd_spell_bonus(s jsonb,entry jsonb,e jsonb,cast_level integer) returns integer language plpgsql immutable set search_path='' as $$
declare bonus integer=0;c jsonb;origin text=coalesce(nullif(entry->>'class_id',''),s->>'class_id');
begin
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  if e->>'kind'='healing' and (entry->>'level')::integer>0 and c->>'class_id'='cleric' and c->>'subclass_id'='life' then bonus=bonus+2+cast_level;end if;
  if e->>'kind'='damage' and origin='wizard' and entry->>'school'='Evocação' and c->>'class_id'='wizard' and c->>'subclass_id'='evocation' and (c->>'level')::integer>=10 then bonus=bonus+floor(((s->'abilities'->>'int')::numeric-10)/2)::integer;end if;
  if e->>'kind'='damage' and origin='sorcerer' and c->>'class_id'='sorcerer' and c->>'subclass_id'='draconic' and (c->>'level')::integer>=6 and nullif(e->>'damageType','') is not null and lower(c->'choices'->'dragon'->>0) like '%'||lower(e->>'damageType')||'%' then bonus=bonus+floor(((s->'abilities'->>'cha')::numeric-10)/2)::integer;end if;
 end loop;
 if entry->>'english_name'='Eldritch Blast' and origin='warlock' then
  for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
   if c->>'class_id'='warlock' and (c->>'level')::integer>=2 and c->'choices'->'invocations' ? 'agonizing-blast' then bonus=bonus+floor(((s->'abilities'->>'cha')::numeric-10)/2)::integer;end if;
  end loop;
 end if;return bonus;
end $$;

create or replace function public.request_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; entry jsonb; e jsonb; sheet jsonb;
 result public.battle_action_requests; source uuid; kind text=p_payload->>'kind'; cost text='action'; rkind text='none'; rlevel integer=0;
 target jsonb=p_payload->'target'; ids uuid[]; sp public.dnd_spells; ability text; modifier integer; dice text; pulse_dice text; lvl integer=0; cname text; f jsonb; wopts jsonb=coalesce(p_payload->'weapon_options','{}'); units integer=coalesce((p_payload->>'feature_units')::integer,1); itemdef jsonb;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para agir.' using errcode='42501'; end if;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.can_control_battle_token(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 select * into m from public.battle_maps where id=(select map_id from public.battle_map_tokens where id=p_token_id);
 select * into s from public.battle_sessions where id=m.battle_session_id for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.can_control_battle_token(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não controla esse personagem.' using errcode='42501'; end if;
 if s.status<>'active' or s.active_token_id is distinct from t.id then raise exception 'Aguarde o turno deste personagem.'; end if;
 if exists(select 1 from public.battle_action_requests q where q.session_id=s.id and q.status in('pending','approved') and (q.token_id=t.id or q.kind='opportunity')) then raise exception 'Aguarde a decisão do mestre sobre a tentativa pendente.'; end if;
 sheet=private.battle_sheet(t.id);
 if coalesce((sheet->>'hp_current')::integer,0)<=0 then raise exception 'Um personagem com 0 PV não pode executar esta ação.'; end if;
 if sheet->'conditions' ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição do personagem impede ações e reações.'; end if;
 if kind not in('weapon','spell','item','feature','dash','disengage','dodge') then raise exception 'Ação inválida.'; end if;
 if kind='item' then
  if t.character_id is null then raise exception 'NPC usa os itens descritos na sua ficha.';end if;
  source=(p_payload->>'source_id')::uuid;
  select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id for update;
  select data into itemdef from public.dnd_items where id=entry->>'catalog_id';
  if entry is null or itemdef->'use' is null or (entry->>'quantity')::integer<1 or (itemdef ? 'charges' and coalesce((entry->>'charges_used')::integer,0)>=(itemdef->>'charges')::integer) then raise exception 'Item esgotado ou sem uso de combate definido.';end if;
  e=itemdef->'use'||jsonb_build_object('shape','single','origin','point','size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',true,'damageType',case entry->>'catalog_id' when 'acid' then 'ácido' when 'holy-water' then 'radiante' else '' end,'item_catalog',entry->>'catalog_id');cname=entry->>'name';
 elsif kind='feature' then
  if t.character_id is null then raise exception 'NPC usa as habilidades descritas na própria ficha.';end if;
  f=private.dnd_feature_definition(sheet,p_payload->>'feature_id',units,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação só pode ser usado uma vez por turno.';end if;
  e=f||jsonb_build_object('shape',case when (f->>'self')::boolean then 'self' else 'single' end,'origin',case when (f->>'self')::boolean then 'self' else 'point' end,'size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',f->>'operation'='manual');
  cost=f->>'cost';cname=f->>'name';entry=f;
 elsif kind in('weapon','spell') then
  source=(p_payload->>'source_id')::uuid;
  if kind='weapon' then
   if t.character_id is not null then
    if source=t.id then entry=jsonb_build_object('id',source,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
    else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0;end if;
   else select data into entry from public.npc_attacks where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta arma não está na ficha do personagem.'; end if;
   if entry->>'catalog_id'='net' and t.action_used and t.attacks_remaining>0 then raise exception 'A rede exige uma ação inteira; conclua os ataques desta ação antes de usá-la.';end if;
   perform private.dnd_check_weapon_options(t,entry,sheet,wopts,coalesce(p_payload->'target_ids','[]'));
   e=private.dnd_weapon_effect(entry,sheet,wopts,t.raging);entry=entry||jsonb_build_object('weapon_options',wopts);cname=entry->>'name';
   if coalesce((wopts->>'offhand')::boolean,false) then cost='bonus';end if;
   if coalesce((wopts->>'smite_level')::integer,0)>0 then rkind=coalesce(wopts->>'smite_kind','slot');rlevel=(wopts->>'smite_level')::integer;end if;
   if coalesce((wopts->>'sneak')::boolean,false) then e=e||'{"review":true,"note":"Ataque Furtivo: o mestre confirma vantagem ou aliado adjacente e ausência de desvantagem."}'::jsonb;end if;
   if coalesce((wopts->>'smite_special')::boolean,false) then e=e||'{"review":true,"note":"O mestre confirma que o alvo é morto-vivo ou ínfero para o dado radiante adicional."}'::jsonb;end if;
  else
   if t.character_id is not null then select data into entry from public.character_spells where id=source and character_id=t.character_id;
   else select data into entry from public.npc_spells where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta magia não está na ficha do personagem.'; end if;
   select * into sp from public.dnd_spells where id=entry->>'catalog_id';
   e=case when sp.id is not null then sp.combat else '{"shape":"single","kind":"utility","range":9,"size":0,"width":1.5,"origin":"point","dice":"","review":true,"timing":"immediate","note":"Magia personalizada: o mestre configura os efeitos na aprovação."}'::jsonb end;
   lvl=coalesce(sp.level,(entry->>'level')::integer,0); entry=entry||jsonb_build_object('level',lvl);
   cname=coalesce(sp.name,entry->>'name'); rkind=coalesce(p_payload->>'resource_kind',case when lvl=0 then 'cantrip' else 'slot' end); rlevel=coalesce((p_payload->>'resource_level')::integer,lvl);
   if t.raging then raise exception 'Não é possível conjurar enquanto a Fúria está ativa.';end if;
   perform private.battle_check_resource(t,entry,rkind,rlevel);
   if lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%bônus%' then cost='bonus';
   elsif lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%rea%' then cost='reaction'; end if;
   if t.bonus_spell_cast and (cost<>'action' or lvl>0) then raise exception 'Após magia bônus, só um truque com tempo de 1 ação pode ser conjurado neste turno.'; end if;
   if cost='bonus' and t.action_spell_level>0 then raise exception 'Uma magia de ação de círculo 1 ou maior impede conjuração bônus neste turno.'; end if;
   ability=private.dnd_spell_ability(sheet,entry);
   modifier=floor((coalesce((sheet->'abilities'->>ability)::numeric,10)-10)/2);
   dice=coalesce(e->>'dice','');
   if e ? 'sizePerSlot' then e=e||jsonb_build_object('size',(e->>'size')::numeric+greatest(0,rlevel-lvl)*(e->>'sizePerSlot')::numeric); end if;
   if coalesce((e->>'cantripScale')::boolean,false) and lvl=0 then
    dice=regexp_replace(dice,'^(\d+)d',((substring(dice from '^\d+'))::integer*case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end)::text||'d');
   end if;
   if coalesce(e->>'upcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop dice=dice||'+'||(e->>'upcast'); end loop; end if;
   if e ? 'pulseDice' then
    pulse_dice=e->>'pulseDice';
    if coalesce(e->>'pulseUpcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop pulse_dice=pulse_dice||'+'||(e->>'pulseUpcast'); end loop; end if;
    e=e||jsonb_build_object('pulseDice',pulse_dice);
   end if;
   if coalesce((e->>'ability')::boolean,false) then dice=dice||case when modifier>=0 then '+' else '' end||modifier; end if;
   if coalesce(e->>'dice','')<>'' and private.dnd_spell_bonus(sheet,entry,e,rlevel)<>0 then dice=dice||case when private.dnd_spell_bonus(sheet,entry,e,rlevel)>=0 then '+' else '' end||private.dnd_spell_bonus(sheet,entry,e,rlevel);end if;
   if e->>'kind'='healing' and lvl>0 then dice=private.dnd_healing_dice(sheet,dice);end if;
   e=e||jsonb_build_object('dice',dice,'concentration',coalesce(sp.concentration,false),'duration',coalesce(sp.data->>'duration',entry->>'duration',''),'description',coalesce(sp.data->>'description',entry->>'description',''),'casting_time',coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação'));
   if lower(e->>'casting_time') ~ '(minuto|hora)' then e=e||'{"review":true,"timing":"trigger","note":"Conjuração longa: o mestre acompanha o tempo e conclui o efeito somente após a duração necessária."}'::jsonb; end if;
  end if;
 elsif kind in('dash','disengage') and private.dnd_class_level(sheet,'rogue')>=2 and p_payload->>'cost'='bonus' then
  cost='bonus'; cname=case kind when 'dash' then 'Disparada (Ação Ardilosa)' else 'Desengajar (Ação Ardilosa)' end;
 else cname=case kind when 'dash' then 'Disparada' when 'disengage' then 'Desengajar' else 'Esquivar' end; end if;
 if cost='action' and t.action_used and t.extra_actions=0 and not(kind='weapon' and t.attacks_remaining>0) then raise exception 'A ação deste turno já foi utilizada.'; end if;
 if cost='bonus' and t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
 if cost='reaction' and t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
 e=coalesce(e,'{"shape":"self","kind":"utility","origin":"self","range":0,"size":0,"dice":""}'::jsonb);
 target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));
 if jsonb_typeof(target->'x') is distinct from 'number' or jsonb_typeof(target->'y') is distinct from 'number' or (target->>'x')::numeric<>floor((target->>'x')::numeric) or (target->>'y')::numeric<>floor((target->>'y')::numeric) or (target->>'x')::integer<0 or (target->>'x')::integer>=m.width or (target->>'y')::integer<0 or (target->>'y')::integer>=m.height then raise exception 'Alvo fora do mapa.'; end if;
 if e->>'origin'<>'self' and private.battle_target_range(t,target,m)>coalesce((e->>'range')::numeric,0)+0.00001 then raise exception 'Alvo fora do alcance.'; end if;
 ids=array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p_payload->'target_ids','[]')));
 if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1) then raise exception 'Quantidade de alvos acima do limite da magia.'; end if;
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.battle_map_tokens q where q.id=v and q.map_id=t.map_id and private.can_read_battle_token(q.id))) then raise exception 'Alvo não pertence ao mapa ou não está visível.' using errcode='42501'; end if;
 if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary') or kind in('item','feature','weapon')) and cardinality(ids)<>1 then raise exception 'Selecione uma criatura como alvo.'; end if;
 if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) then raise exception 'Alvo fora da área indicada.'; end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,kind,source,cname,cost,rkind,rlevel,lvl,target,ids,e||jsonb_build_object('entry',entry,'actor_x',t.x,'actor_y',t.y),s.round,s.turn_index,s.turn_started_at) returning * into result;
 return result;
end $$;

create or replace function public.resolve_battle_action_v9(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests; s public.battle_sessions; t public.battle_map_tokens; e jsonb; entry jsonb; sheet jsonb; outcomes jsonb='{}';
 spend boolean; attacks integer=1; opts jsonb=coalesce(p_resolution,'{}');f jsonb;units integer;itemdef jsonb;inv public.character_inventory;wopts jsonb;newdata jsonb;remaining integer;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if r.id is null or not private.is_campaign_owner(r.campaign_id) then raise exception 'Apenas o mestre desta campanha pode decidir.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=r.session_id for update;
 perform 1 from public.campaigns where id=r.campaign_id for update; -- serialize HP/resources across maps of one campaign
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if r.status<>'pending' then return r; end if; -- idempotent, including two browsers clicking simultaneously
 select * into t from public.battle_map_tokens where id=r.token_id for update;
 if s.status<>'active' or s.round<>r.round or s.turn_index<>r.turn_index or s.turn_started_at is distinct from r.turn_started_at then
  update public.battle_action_requests set status='expired',resolved_at=now() where id=r.id returning * into r; return r;
 end if;
 if r.kind<>'opportunity' and s.active_token_id is distinct from t.id then raise exception 'A tentativa pertence a outro turno.'; end if;
 sheet=private.battle_sheet(t.id); e=r.definition; spend=p_success or s.failed_actions_consume;
 if p_success and opts ? 'geometry' then
  if coalesce(opts->'geometry'->>'shape','') not in('single','self','sphere','cone','line','cube') or coalesce(opts->'geometry'->>'origin','') not in('point','self') or coalesce((opts->'geometry'->>'size')::numeric,-1)<0 or (opts->'geometry'->>'size')::numeric>10000 or coalesce((opts->'geometry'->>'width')::numeric,0)<=0 or (opts->'geometry'->>'width')::numeric>10000 then raise exception 'Formato ou dimensão da área inválido.'; end if;
  e=e||jsonb_build_object('shape',opts->'geometry'->>'shape','origin',opts->'geometry'->>'origin','size',(opts->'geometry'->>'size')::numeric,'width',(opts->'geometry'->>'width')::numeric);
 end if;
 if r.kind='feature' and spend then
  f=private.dnd_feature_definition(sheet,e->>'id',(e->>'units')::integer,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação já utilizado neste turno.';end if;
  if coalesce(f->>'resource','')<>'' then
   update public.characters set system_data=jsonb_set(system_data,'{feature_uses}',coalesce(system_data->'feature_uses','{}')||jsonb_build_object(f->>'resource',coalesce((system_data->'feature_uses'->>(f->>'resource'))::integer,0)+(f->>'units')::integer)) where id=t.character_id;
  end if;
 elsif r.kind='item' and spend then
  select * into inv from public.character_inventory where id=r.source_id and character_id=t.character_id for update;
  select data into itemdef from public.dnd_items where id=inv.data->>'catalog_id';
  if inv.id is null or itemdef->'use' is null or (inv.data->>'quantity')::integer<1 then raise exception 'O item foi removido ou está esgotado.';end if;
  newdata=inv.data;
  if itemdef ? 'charges' then
   remaining=coalesce((inv.data->>'charges_used')::integer,0)+1;
   if remaining>(itemdef->>'charges')::integer then raise exception 'Este item não possui mais usos.';end if;
   newdata=newdata||jsonb_build_object('charges_used',remaining);
   if remaining=(itemdef->>'charges')::integer and (inv.data->>'quantity')::integer>1 then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1,'charges_used',0);end if;
  elsif coalesce((itemdef->'use'->>'consumed')::boolean,false) then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1);end if;
  update public.character_inventory set data=newdata where id=inv.id;
 elsif r.kind='weapon' and spend and t.character_id is not null then
  if r.source_id=t.id then entry=jsonb_build_object('id',t.id,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
  else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=r.source_id and character_id=t.character_id and data->>'category'='weapon' and (data->>'quantity')::integer>0 for update;end if;
  if entry is null then raise exception 'A arma foi removida ou está esgotada.';end if;
  wopts=coalesce(e->'entry'->'weapon_options','{}');
  perform private.dnd_check_weapon_options(t,entry,sheet,wopts,to_jsonb(r.target_ids));
  if p_success and r.resource_level>0 then
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;end if;
  end if;
  if nullif(entry->>'ammunition','') is not null then
   select * into inv from public.character_inventory where character_id=t.character_id and data->>'category'='ammunition' and data->>'ammunition'=entry->>'ammunition' and (data->>'quantity')::integer>0 order by id limit 1 for update;
   if inv.id is null then raise exception 'Munição compatível esgotada.';end if;
   update public.character_inventory set data=data||jsonb_build_object('quantity',(data->>'quantity')::integer-1) where id=inv.id;
  end if;
  update public.battle_map_tokens set weapon_attacked=weapon_attacked or (r.cost='action' and (private.dnd_weapon_traits(entry,sheet)->>'light')::boolean and not(private.dnd_weapon_traits(entry,sheet)->>'ranged')::boolean),
   sneak_used=sneak_used or (p_success and coalesce((wopts->>'sneak')::boolean,false)),hunter_used=hunter_used or (p_success and coalesce((wopts->>'hunter')::boolean,false)),
   rage_activity_at=case when raging and exists(select 1 from public.battle_map_tokens foe where foe.id=any(r.target_ids) and foe.faction in('enemy','ally') and foe.faction<>t.faction) then now() else rage_activity_at end where id=t.id;
 end if;
 if r.kind='spell' and spend then
  if t.character_id is not null then select data into entry from public.character_spells where id=r.source_id and character_id=t.character_id;
  else select data into entry from public.npc_spells where id=r.source_id and npc_id=t.npc_id; end if;
  if entry is null then raise exception 'A magia foi retirada da ficha. Cancele esta tentativa.'; end if;
  entry=entry||jsonb_build_object('level',r.spell_level); perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;
   elsif r.resource_kind='arcanum' then update public.characters set system_data=jsonb_set(system_data,'{arcanum_used}',coalesce(system_data->'arcanum_used','{}')||jsonb_build_object(r.resource_level::text,1)) where id=t.character_id;
   end if;
  end if;
 end if;
 if spend then
  if r.cost='action' then
   if r.kind='weapon' then
    if t.action_used and t.attacks_remaining<=0 and t.extra_actions=0 then raise exception 'Não há ataques restantes.'; end if;
    if not t.action_used or t.attacks_remaining<=0 then
     attacks=case when e->'entry'->>'catalog_id'='net' then 1 else private.dnd_attack_count(sheet) end;
    else attacks=t.attacks_remaining; end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=attacks-1,extra_actions=extra_actions-case when t.action_used and t.attacks_remaining<=0 then 1 else 0 end where id=t.id;
   else
    if t.action_used and t.extra_actions=0 then raise exception 'A ação já foi utilizada.';end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=case when t.action_used then t.attacks_remaining else 0 end,extra_actions=extra_actions-case when t.action_used then 1 else 0 end,action_spell_level=case when r.kind='spell' then r.spell_level else action_spell_level end where id=t.id; end if;
  elsif r.cost='bonus' then
   if t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
   update public.battle_map_tokens set bonus_used=true,bonus_spell_cast=bonus_spell_cast or r.kind='spell' where id=t.id;
  elsif r.cost='reaction' then
   if t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
   update public.battle_map_tokens set reaction_used=true where id=t.id;
  end if;
 end if;
 if p_success then
  if r.kind='feature' then
   case e->>'operation'
    when 'rage' then
     update public.battle_map_tokens set raging=true,rage_started_round=s.round,rage_activity_at=null,rage_checked_at=now() where id=t.id;
     update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;
    when 'end-rage' then update public.battle_map_tokens set raging=false where id=t.id;
    when 'surge' then update public.battle_map_tokens set extra_actions=extra_actions+1,surge_used=true where id=t.id;
    when 'dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
    when 'disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
    when 'dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
    else outcomes=private.battle_apply_hp(r,t,e,opts);
   end case;
  elsif r.kind='dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
  elsif r.kind='disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
  elsif r.kind='dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
  else
   if r.kind='item' then perform private.dnd_item_special(r,e);end if;
   if opts ? 'kind' then
    if opts->>'kind' not in('damage','healing','temporary','utility') then raise exception 'Efeito inválido.'; end if;
    e=e||jsonb_build_object('kind',opts->>'kind');
   end if;
   if opts ? 'damageType' then e=e||jsonb_build_object('damageType',opts->>'damageType'); end if;
   if coalesce(e->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false) then outcomes=private.battle_apply_hp(r,t,e,opts); end if;
   if r.kind='spell' and (e ? 'pulseDice' or coalesce(e->>'timing','immediate')='trigger' or lower(coalesce(e->>'duration','')) not like 'instant%') then
    if coalesce((e->>'concentration')::boolean,false) then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active; end if;
    insert into public.battle_spell_effects(request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration)
    values(r.id,r.campaign_id,r.map_id,t.id,r.name,case when e ? 'pulseDice' then e||jsonb_build_object('dice',e->>'pulseDice') else e end,r.target,coalesce((e->>'concentration')::boolean,false),coalesce(e->>'duration',''));
   end if;
  end if;
 end if;
 update public.battle_action_requests set status=case when p_success then 'success' else 'failure' end,resolution=outcomes||jsonb_build_object('resources_consumed',spend,'dice',coalesce(opts->>'dice',e->>'dice','')),
  resolved_by=auth.uid(),resolved_at=now() where id=r.id returning * into r;
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id); end if;
 return r;
end $$;

create or replace function private.battle_apply_hp_v11(r public.battle_action_requests,a public.battle_map_tokens,e jsonb,opts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; target jsonb; sheet jsonb; amount integer; roll integer;
 hp integer; maxhp integer; temp integer; afterhp integer; aftertemp integer; saved boolean; multiplier numeric; override jsonb; kind text=e->>'kind';
 ids uuid[]; total integer=0; total_amount integer=0; applied jsonb='[]'; target_opts jsonb; minimum integer;
begin
 select * into m from public.battle_maps where id=r.map_id;
 target=r.target; roll=private.battle_roll(coalesce(opts->>'dice',e->>'dice',''));
 ids=case when opts ? 'target_ids' then array(select distinct value::uuid from jsonb_array_elements_text(opts->'target_ids')) else r.target_ids end;
 if cardinality(ids)>200 then raise exception 'Quantidade de alvos inválida.'; end if;
 if exists(select 1 from unnest(ids) i where not exists(select 1 from public.battle_map_tokens where id=i and map_id=r.map_id)) then raise exception 'Alvo de outra mesa não pode ser afetado.'; end if;
 for t in select * from public.battle_map_tokens q where q.map_id=r.map_id and
  ((coalesce((e->>'selective')::boolean,false) or e->>'shape'='single' or opts ? 'target_ids') and q.id=any(ids) or
   not coalesce((e->>'selective')::boolean,false) and e->>'shape'<>'single' and not(opts ? 'target_ids') and private.battle_in_effect(q,a,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) order by q.id for update loop
  if t.character_id is not null then perform 1 from public.characters where id=t.character_id for update;
  else perform 1 from public.npc_stats where npc_id=t.npc_id for update; end if;
  sheet=private.battle_sheet(t.id); if sheet is null then continue; end if;
  target_opts=coalesce(opts->'targets'->t.id::text,'{}'); saved=coalesce((target_opts->>'saved')::boolean,false);
  multiplier=coalesce((target_opts->>'multiplier')::numeric,1);
  if multiplier not in(0,0.5,1,2) then raise exception 'Multiplicador inválido.'; end if;
  amount=greatest(0,least(100000,coalesce((target_opts->>'amount')::integer,floor(floor(roll*case when saved then case when coalesce((e->>'halfOnSave')::boolean,false) then 0.5 else 0 end else 1 end)*multiplier)::integer)));
  if kind='damage' and not(target_opts ? 'amount') then amount=greatest(0,least(100000,floor(private.dnd_damage_amount(t,sheet,e,roll,saved,opts)*multiplier)::integer));end if;
  hp=coalesce((sheet->>'hp_current')::integer,0); maxhp=private.battle_hp_max(sheet); temp=coalesce((sheet->>'hp_temp')::integer,0);
  if coalesce((e->>'restoreFull')::boolean,false) and kind='healing' then amount=greatest(0,maxhp-hp); end if;
  total_amount=total_amount+amount;
  if e ? 'pool' and total_amount>(e->>'pool')::integer then raise exception 'A cura distribuída supera a reserva de % PV.',e->>'pool'; end if;
  afterhp=hp; aftertemp=temp;
  if kind='damage' then aftertemp=greatest(0,temp-amount); afterhp=greatest(0,hp-greatest(0,amount-temp));
   if r.kind='spell' and r.name='Doença Plena' then afterhp=greatest(1,afterhp); end if;
  elsif kind='healing' then afterhp=least(maxhp,hp+amount);
  elsif kind='temporary' then aftertemp=greatest(temp,amount);
  else continue; end if;
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   -- Read again after locking so concurrent sheet saves cannot lose HP changes.
   sheet=private.battle_sheet(t.id); hp=coalesce((sheet->>'hp_current')::integer,0); temp=coalesce((sheet->>'hp_temp')::integer,0); maxhp=private.battle_hp_max(sheet);
   afterhp=case kind when 'damage' then greatest(case when r.name='Doença Plena' then 1 else 0 end,hp-greatest(0,amount-temp)) when 'healing' then least(maxhp,hp+amount) else hp end;
   aftertemp=case kind when 'damage' then greatest(0,temp-amount) when 'temporary' then greatest(temp,amount) else temp end;
   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp,'hp_temp',aftertemp) where id=t.character_id;
  else
   select hp_current,hp_max,hp_temp into hp,maxhp,temp from public.npc_stats where npc_id=t.npc_id for update;
   afterhp=case kind when 'damage' then greatest(case when r.name='Doença Plena' then 1 else 0 end,hp-greatest(0,amount-temp)) when 'healing' then least(maxhp,hp+amount) else hp end;
   aftertemp=case kind when 'damage' then greatest(0,temp-amount) when 'temporary' then greatest(temp,amount) else temp end;
   update public.npc_stats set hp_current=afterhp,hp_temp=aftertemp where npc_id=t.npc_id;
   update public.npcs set updated_at=now() where id=t.npc_id;
  end if;
  insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved)
  values(r.id,r.campaign_id,t.id,kind,amount,hp,afterhp,temp,aftertemp,saved);
  if t.visible or t.controlled_by=r.requested_by or exists(select 1 from public.characters where id=t.character_id and owner_id=r.requested_by) or exists(select 1 from public.campaigns where id=r.campaign_id and owner_id=r.requested_by) then applied=applied||jsonb_build_array(jsonb_build_object('token_id',t.id,'name',t.name,'amount',case kind when 'healing' then afterhp-hp when 'temporary' then aftertemp-temp else amount end,'kind',kind,'saved',saved)); end if;
  total=total+1;
  if kind='damage' and amount>0 then
   update public.battle_map_tokens set rage_activity_at=case when raging then now() else rage_activity_at end where id=t.id;
   if t.character_id is not null then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v<>'Estável'),'[]')) where id=t.character_id;end if;
  end if;
  if kind='healing' and hp=0 and afterhp>0 and t.character_id is not null then
   update public.characters set system_data=system_data||jsonb_build_object('death_successes',0,'death_failures',0,'conditions',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v not in('Estável','Inconsciente')),'[]')) where id=t.character_id;
  end if;
  if afterhp=0 then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;update public.battle_map_tokens set raging=false where id=t.id;end if;
 end loop;
 if e ? 'pool' and kind='healing' and total_amount=0 then raise exception 'Distribua a reserva de cura nos valores finais dos alvos antes de aprovar.'; end if;
 if kind='damage' and coalesce((e->>'lifeSteal')::numeric,0)>0 then
  if a.character_id is not null then perform 1 from public.characters where id=a.character_id for update;
  else perform 1 from public.npc_stats where npc_id=a.npc_id for update; end if;
  sheet=private.battle_sheet(a.id); hp=(sheet->>'hp_current')::integer; maxhp=private.battle_hp_max(sheet); temp=coalesce((sheet->>'hp_temp')::integer,0);
  amount=floor(total_amount*(e->>'lifeSteal')::numeric)::integer; afterhp=least(maxhp,hp+amount);
  if a.character_id is not null then update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
  else update public.npc_stats set hp_current=afterhp where npc_id=a.npc_id; update public.npcs set updated_at=now() where id=a.npc_id; end if;
  insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',amount,hp,afterhp,temp,temp,false);
  applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
 end if;
 if kind='healing' and r.kind='spell' and r.spell_level>0 and exists(select 1 from jsonb_array_elements(applied) v where v->>'token_id'<>a.id::text and (v->>'amount')::integer>0) then
  sheet=private.battle_sheet(a.id);
  if exists(select 1 from jsonb_array_elements(private.dnd_levels(sheet)) c where c->>'class_id'='cleric' and c->>'subclass_id'='life' and (c->>'level')::integer>=6) then
   hp=(sheet->>'hp_current')::integer;maxhp=private.battle_hp_max(sheet);afterhp=least(maxhp,hp+2+r.resource_level);temp=coalesce((sheet->>'hp_temp')::integer,0);
   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
   insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',afterhp-hp,hp,afterhp,temp,temp,false);
   applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
  end if;
 end if;
 return jsonb_build_object('roll',roll,'affected',applied,'count',jsonb_array_length(applied));
end $$;

create or replace function private.battle_turn_budget() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status or new.active_token_id is distinct from old.active_token_id or new.round<>old.round or new.turn_index<>old.turn_index or new.turn_started_at is distinct from old.turn_started_at then
  if not private.is_campaign_owner(new.campaign_id) and (exists(select 1 from public.battle_action_requests where session_id=new.id and status in('pending','approved')) or exists(select 1 from public.battle_movement_plans where session_id=new.id and status='pending')) then raise exception 'Aguarde a decisão do mestre antes de encerrar o turno.'; end if;
  update public.battle_action_requests set status='expired',resolved_at=now() where session_id=new.id and status in('pending','approved');
  update public.battle_movement_plans set status='cancelled',reason='Turno encerrado.' where session_id=new.id and status='pending';
  update public.battle_map_tokens t set raging=false where t.map_id in(select id from public.battle_maps where battle_session_id=new.id) and t.raging and (new.status<>'active' or new.round-coalesce(t.rage_started_round,new.round)>=10 or (private.battle_sheet(t.id)->>'hp_current')::integer<=0);
  update public.battle_map_tokens t set raging=case when private.dnd_class_level(private.battle_sheet(t.id),'barbarian')>=15 then raging else raging and coalesce(rage_activity_at,'-infinity')>=coalesce(rage_checked_at,old.turn_started_at) end,rage_checked_at=now(),disengaged=false where id=old.active_token_id;
  update public.battle_map_tokens set sneak_used=false,hunter_used=false where map_id in(select id from public.battle_maps where battle_session_id=new.id);
  update public.battle_map_tokens set extra_actions=0,surge_used=false,weapon_attacked=false where id=new.active_token_id;
  if new.status='active' then
   update public.battle_map_tokens set movement_speed=private.battle_character_speed(character_id),movement_remaining=private.battle_character_speed(character_id),movement_unit='m' where id=new.active_token_id and character_id is not null;
   update public.battle_map_tokens set action_used=false,bonus_used=false,reaction_used=false,attacks_remaining=0,disengaged=false,dodging=false,movement_bonus=0,bonus_spell_cast=false,action_spell_level=-1,version=version+1 where id=new.active_token_id; end if;
 end if; return new;
end $$;

create or replace function public.approve_battle_action(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; result public.battle_action_requests; opts jsonb=coalesce(p_resolution,'{}')-'defer_player_roll'-'roll_id'; kind text; expression text;parts jsonb;part jsonb;actor_sheet jsonb;barbarian integer;extra integer;critdef jsonb;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) then raise exception 'Apenas o mestre pode decidir.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 if q.status<>'pending' then return q; end if;
 expression=coalesce(q.definition->>'dice','');
 if (expression='' or coalesce((q.definition->>'review')::boolean,false)) and opts ? 'dice' then expression=coalesce(opts->>'dice',expression); end if;
 kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and expression is distinct from coalesce(q.definition->>'dice','') then
  update public.battle_action_requests set definition=definition-array['damageParts','rerollWeaponDice'] where id=q.id returning * into q;
 end if;
 if p_success and coalesce((opts->>'critical')::boolean,false) then
  if kind<>'damage' or q.definition->>'shape'<>'single' or coalesce(q.definition->>'save','')<>'' then raise exception 'Crítico é válido apenas para dano de ataque contra alvo único.';end if;
  actor_sheet=private.battle_sheet(q.token_id);barbarian=private.dnd_class_level(actor_sheet,'barbarian');extra=0;
  if q.kind in('weapon','opportunity') and not(private.dnd_weapon_traits(q.definition->'entry',actor_sheet)->>'ranged')::boolean then extra=case when barbarian>=17 then 3 when barbarian>=13 then 2 when barbarian>=9 then 1 else 0 end;end if;
  parts='[]';
  for part in select value from jsonb_array_elements(coalesce(q.definition->'damageParts','[]')) loop
   part=part||jsonb_build_object('dice',private.dnd_critical_expression(part->>'dice'));
   if jsonb_array_length(parts)=0 and extra>0 then part=part||jsonb_build_object('dice',(part->>'dice')||'+'||extra||'d'||substring(expression from '^\d+d(\d+)'));end if;
   parts=parts||jsonb_build_array(part);
  end loop;
  expression=private.dnd_critical_expression(expression);
  if jsonb_array_length(parts)>0 then select string_agg(p->>'dice','+' order by n) into expression from jsonb_array_elements(parts) with ordinality a(p,n);end if;
  critdef=q.definition||jsonb_build_object('dice',expression,'damageParts',parts,'rerollWeaponDice',coalesce((q.definition->>'rerollWeaponDice')::integer,0)*2,'critical',true);
  update public.battle_action_requests set definition=critdef where id=q.id returning * into q;
 end if;
 if p_success and q.kind in('spell','weapon','item','feature') and kind in('damage','healing','temporary') and expression~'d(4|6|8|10|12|20|100)' and (coalesce(q.definition->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false)) then
  -- Formula is scaled server-side; only GM review can supply an exception/custom effect.
  perform private.battle_check_dice(expression);
  opts=opts||jsonb_build_object('defer_player_roll',true,'dice',expression);
  result=public.resolve_battle_action_v9(q.id,true,opts);
  if result.status='success' and coalesce((result.resolution->>'awaiting_roll')::boolean,false) then
   update private.battle_roll_permits set effect_ids=array(select id from public.battle_spell_effects where request_id=q.id) where request_id=q.id;
   update public.battle_spell_effects set active=false where request_id=q.id;
   update public.battle_action_requests set status='approved' where id=q.id returning * into result;
  end if;
 else result=public.resolve_battle_action(q.id,p_success,opts); end if;
 return result;
end $$;

create or replace function public.roll_approved_battle_action(p_request_id uuid,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; s public.battle_sessions; a public.battle_map_tokens; permit private.battle_roll_permits; d public.battle_dice_rolls; detail jsonb; outcome jsonb; expression text;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para rolar.' using errcode='42501'; end if;
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.can_read_campaign(q.campaign_id) or not private.can_control_battle_token(q.token_id) or not(private.is_campaign_owner(q.campaign_id) or q.requested_by=auth.uid()) then raise exception 'Você não pode rolar esta tentativa.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 -- Retries and concurrent tabs return the original result, never another roll or HP change.
 if q.status='success' and q.resolution ? 'dice_roll_id' then return q; end if;
 if q.status<>'approved' then raise exception 'Aguarde o sucesso do mestre antes de rolar.'; end if;
 if s.status<>'active' or s.active_token_id is distinct from q.token_id or s.round<>q.round or s.turn_index<>q.turn_index or s.turn_started_at is distinct from q.turn_started_at then
  update public.battle_action_requests set status='expired',resolution=resolution||jsonb_build_object('awaiting_roll',false),resolved_at=now() where id=q.id returning * into q; return q;
 end if;
 select * into a from public.battle_map_tokens where id=q.token_id for update;
 if coalesce((private.battle_sheet(a.id)->>'hp_current')::integer,0)<=0 or (private.battle_sheet(a.id)->'conditions') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'O personagem não pode concluir esta ação. O mestre pode cancelar ou encerrar o turno.'; end if;
 select * into permit from private.battle_roll_permits where request_id=q.id;
 if permit.request_id is null then raise exception 'Esta tentativa não tem uma rolagem autorizada.'; end if;
 if exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Este identificador pertence a outra rolagem.'; end if;
 expression=permit.options->>'dice'; detail=private.dnd_attack_roll_detail(expression,permit.definition);
 insert into public.battle_dice_rolls(campaign_id,map_id,rolled_by,client_id,expression,label,visibility,mode,terms,total,request_id,consumed_at)
 values(q.campaign_id,q.map_id,auth.uid(),p_client_id,detail->>'expression',left(q.name,120),case when not a.visible then case when private.is_campaign_owner(q.campaign_id) then 'gm' else 'self' end else 'public' end,'normal',detail->'terms',(detail->>'total')::integer,q.id,now()) returning * into d;
 outcome=private.battle_apply_hp_v9(q,a,permit.definition,permit.options||jsonb_build_object('dice',greatest(0,d.total)::text,'damage_parts',private.dnd_roll_damage_parts(detail->'terms',permit.definition->'damageParts')));
 -- A persistent effect becomes available after the initial HP result is applied.
 update public.battle_spell_effects set active=true where id=any(permit.effect_ids);
 update public.battle_action_requests set status='success',resolution=resolution||outcome||jsonb_build_object('awaiting_roll',false,'dice',d.expression,'dice_roll_id',d.id,'dice_roll',to_jsonb(d),'rolled_at',now()),resolved_at=now() where id=q.id returning * into q;
 return q;
end $$;

create or replace function public.resolve_battle_action(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; result public.battle_action_requests; r public.battle_dice_rolls; opts jsonb=coalesce(p_resolution,'{}'); expression text; kind text;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) then raise exception 'Apenas o mestre pode decidir.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 if q.status<>'pending' then return q; end if;
 expression=coalesce(opts->>'dice',q.definition->>'dice',''); kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and q.kind in('spell','weapon','item','feature','opportunity') and kind in('damage','healing','temporary') and (coalesce(q.definition->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false)) then
  if opts ? 'roll_id' then
   select * into r from public.battle_dice_rolls where id=(opts->>'roll_id')::uuid for update;
   if r.id is null or r.request_id is distinct from q.id or r.rolled_by<>auth.uid() or r.consumed_at is not null then raise exception 'Use uma rolagem desta tentativa que ainda não foi aplicada.'; end if;
  elsif expression<>'' then r=private.battle_record_roll(q.map_id,expression,gen_random_uuid(),q.name,'gm','normal',q.id); end if;
  if r.id is not null then opts=opts||jsonb_build_object('dice',greatest(0,r.total)::text,'damage_parts',private.dnd_roll_damage_parts(r.terms,q.definition->'damageParts')); end if;
 end if;
 result=public.resolve_battle_action_v9(q.id,p_success,opts);
 if result.status='success' and r.id is not null then
  update public.battle_dice_rolls set consumed_at=now() where id=r.id returning * into r;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('dice',r.expression,'dice_roll_id',r.id,'dice_roll',to_jsonb(r)) where id=q.id returning * into result;
 end if;
 return result;
end $$;

-- New private helpers remain accessible only through the authorized RPCs.
revoke all on function private.dnd_inventory_guard(),private.dnd_special_spell_guard(),private.dnd_feature_definition(jsonb,text,integer,boolean),private.dnd_weapon_traits(jsonb,jsonb),private.dnd_has_style(jsonb,text),private.dnd_weapon_effect(jsonb,jsonb,jsonb,boolean),private.dnd_weapon_base(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.dnd_check_weapon_options(public.battle_map_tokens,jsonb,jsonb,jsonb,jsonb),private.dnd_roll_damage_parts(jsonb,jsonb),private.dnd_damage_amount(public.battle_map_tokens,jsonb,jsonb,integer,boolean,jsonb),private.dnd_attack_roll_detail(text,jsonb),private.dnd_item_special(public.battle_action_requests,jsonb) from public,anon,authenticated;
revoke all on function private.dnd_critical_expression(text) from public,anon,authenticated;
revoke all on function private.dnd_weapon_proficient(jsonb,jsonb),private.dnd_learning_guard() from public,anon,authenticated;
revoke all on function private.dnd_expanded_spell(jsonb,jsonb),private.dnd_healing_dice(jsonb,text) from public,anon,authenticated;
-- Pure metadata predicate needed by the existing SECURITY INVOKER spell trigger.
-- It reads only caller-supplied JSON and exposes no records or mutations.
grant execute on function private.dnd_expanded_spell(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'ATUALIZAÇÃO V17 CONCLUÍDA — magias, habilidades e itens atualizados. Atualize a página do site.' as resultado;
