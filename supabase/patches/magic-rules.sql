alter table public.campaign_rules add column if not exists combat_dice_mode text not null default 'program' check(combat_dice_mode in('program','physical'));
alter table public.campaign_rules add column if not exists npc_dice_mode text not null default 'inherit' check(npc_dice_mode in('inherit','program','physical'));
alter table public.campaign_rules add column if not exists combat_dice_animation boolean not null default true;
alter table public.campaign_rules add column if not exists combat_effects boolean not null default true;
alter table public.campaign_rules add column if not exists show_save_dc boolean not null default true;
alter table public.campaign_rules add column if not exists concentration_checks boolean not null default true;
alter table public.battle_dice_rolls add column if not exists source text not null default 'program' check(source in('program','physical'));
alter table public.npc_stats add column if not exists spell_save_dc integer check(spell_save_dc between 1 and 40);
alter table public.npc_stats add column if not exists spell_attack_bonus integer check(spell_attack_bonus between -50 and 50);
alter table public.npc_stats add column if not exists spellcasting_ability text not null default 'int' check(spellcasting_ability in('str','dex','con','int','wis','cha'));
create or replace function private.battle39_dc(p_token uuid,p_entry jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare t public.battle_map_tokens;s jsonb;ability text;fixed integer;
begin
 select * into t from public.battle_map_tokens where id=p_token;s=private.battle_sheet(t.id);
 if t.npc_id is not null then select spell_save_dc,spellcasting_ability into fixed,ability from public.npc_stats where npc_id=t.npc_id;else ability=private.dnd_spell_ability(s,p_entry);end if;
 if fixed is not null then return fixed;end if;
 if ability is null then raise exception 'Defina a origem de conjuração desta magia.';end if;
 return 8+2+(greatest(1,coalesce((s->>'level')::integer,1))-1)/4+floor((coalesce((s->'abilities'->>ability)::numeric,10)-10)/2)::integer;
end $$;
create or replace function private.battle39_attack(p_token uuid,p_entry jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare t public.battle_map_tokens;n integer;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if t.npc_id is not null then select spell_attack_bonus into n from public.npc_stats where npc_id=t.npc_id;end if;return coalesce(n,private.battle39_dc(p_token,p_entry)-8);
end $$;
revoke all on function private.battle39_dc(uuid,jsonb),private.battle39_attack(uuid,jsonb) from public,anon,authenticated;
create or replace function private.battle39_face(p_sides integer) returns integer language plpgsql volatile set search_path='' as $$
declare faces jsonb=current_setting('battle39.faces',true)::jsonb;i integer=coalesce(nullif(current_setting('battle39.face_index',true),''),'0')::integer;v jsonb;n numeric;
begin
 v=faces->i;if v is null or jsonb_typeof(v)<>'number' then raise exception 'Informe todas as faces dos dados, na ordem indicada.';end if;n=v::text::numeric;
 if n<>floor(n) or n<1 or n>p_sides then raise exception 'O resultado do d% deve ser inteiro entre 1 e %.',p_sides,p_sides;end if;
 perform set_config('battle39.face_index',(i+1)::text,true);return n::integer;
end $$;
