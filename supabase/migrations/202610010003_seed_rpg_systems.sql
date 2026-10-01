insert into public.rpg_systems(id,name,slug,description,version,active)
values('00000000-0000-4000-8000-000000000001','D&D 5e','dnd5e','Dungeons & Dragons, quinta edição (2014). Regras básicas do SRD 5.1.','SRD 5.1',true)
on conflict(slug) do update set name=excluded.name,description=excluded.description,version=excluded.version,active=true;
