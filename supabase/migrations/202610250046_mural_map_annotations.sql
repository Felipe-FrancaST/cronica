-- Shared map markup is separate from the original image and the private atlas.
begin;
alter table public.campaign_rules add column if not exists players_can_annotate_mural boolean not null default false;

-- Keep the public function's OID, argument names and existing defaults.
do $rules46$ declare args text; begin
 if to_regprocedure('private.save_campaign_rules_v45(uuid,jsonb,timestamptz)') is null then
  execute replace(pg_get_functiondef('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)'::regprocedure),'FUNCTION public.save_campaign_rules_v19(','FUNCTION private.save_campaign_rules_v45(');
 end if;
 select pg_get_function_arguments('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)'::regprocedure) into args;
 execute 'create or replace function public.save_campaign_rules_v19('||args||') returns public.campaign_rules language plpgsql security definer set search_path='''' as $body$
 declare r public.campaign_rules;
 begin
  if $2 ? ''players_can_annotate_mural'' and jsonb_typeof($2->''players_can_annotate_mural'')<>''boolean'' then raise exception ''Permissão de marcações inválida.'';end if;
  r=private.save_campaign_rules_v45($1,$2,$3);
  update public.campaign_rules set players_can_annotate_mural=coalesce(($2->>''players_can_annotate_mural'')::boolean,r.players_can_annotate_mural),updated_at=greatest(clock_timestamp(),updated_at+interval ''1 microsecond'') where campaign_id=$1 returning * into r;
  return r;
 end $body$';
end $rules46$;
revoke all on function private.save_campaign_rules_v45(uuid,jsonb,timestamptz) from public,anon,authenticated;

create table if not exists public.campaign_mural_annotation_states (
 item_id uuid primary key references public.campaign_mural_items(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 revision bigint not null default 0, reset_revision bigint not null default 0,
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.campaign_mural_annotations (
 id uuid primary key, item_id uuid not null references public.campaign_mural_items(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null, version bigint not null, deleted boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists mural_annotations_delta on public.campaign_mural_annotations(item_id,version);
create index if not exists mural_annotations_author on public.campaign_mural_annotations(author_id,item_id);

create or replace function private.mural_annotation_readable(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_mural_items i join public.campaign_sessions s on s.id=i.adventure_session_id where i.id=p_item and i.kind='image' and i.image_path is not null and private.can_read_campaign(i.campaign_id) and (private.is_campaign_owner(i.campaign_id) or i.visible_to_players and s.status in('active','ended')));
$$;
create or replace function private.mural_annotation_writable(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_mural_items i join public.campaign_sessions s on s.id=i.adventure_session_id left join public.campaign_rules r on r.campaign_id=i.campaign_id where i.id=p_item and s.status<>'ended' and private.mural_annotation_readable(i.id) and (private.is_campaign_owner(i.campaign_id) or coalesce(r.players_can_annotate_mural,false)));
$$;
revoke all on function private.mural_annotation_readable(uuid),private.mural_annotation_writable(uuid) from public,anon;
grant execute on function private.mural_annotation_readable(uuid),private.mural_annotation_writable(uuid) to authenticated;
alter table public.campaign_mural_annotation_states enable row level security;
alter table public.campaign_mural_annotations enable row level security;
revoke all on public.campaign_mural_annotation_states,public.campaign_mural_annotations from public,anon,authenticated;
grant select on public.campaign_mural_annotation_states,public.campaign_mural_annotations to authenticated;
drop policy if exists mural_annotation_states_read on public.campaign_mural_annotation_states;
create policy mural_annotation_states_read on public.campaign_mural_annotation_states for select to authenticated using(private.mural_annotation_readable(item_id));
drop policy if exists mural_annotations_read on public.campaign_mural_annotations;
create policy mural_annotations_read on public.campaign_mural_annotations for select to authenticated using(not deleted and private.mural_annotation_readable(item_id));

create or replace function private.validate_mural_annotation(p jsonb) returns void language plpgsql immutable set search_path='' as $$
declare v jsonb; k text=p->>'kind';
begin
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>30000 or k is null or k not in('stroke','marker','text') or jsonb_typeof(p->'color')<>'string' or not coalesce(p->>'color' ~ '^#[0-9a-fA-F]{6}$',false) then raise exception 'Marcação inválida.';end if;
 if k='stroke' then
  if p-array['kind','color','width','points']<>'{}'::jsonb or not p ?& array['kind','color','width','points'] or jsonb_typeof(p->'width')<>'number' or (p->>'width')::numeric not between 1 and 16 or jsonb_typeof(p->'points')<>'array' then raise exception 'Traçado inválido.';end if;
  if jsonb_array_length(p->'points') not between 2 and 512 then raise exception 'Use um traçado de até 512 pontos.';end if;
  for v in select * from jsonb_array_elements(p->'points') loop
   if jsonb_typeof(v)<>'object' or v-array['x','y']<>'{}'::jsonb or not v ?& array['x','y'] or jsonb_typeof(v->'x')<>'number' or jsonb_typeof(v->'y')<>'number' or (v->>'x')::numeric not between 0 and 1 or (v->>'y')::numeric not between 0 and 1 then raise exception 'Ponto do traçado inválido.';end if;
  end loop;
 else
  if p-array['kind','color','x','y','text']<>'{}'::jsonb or not p ?& array['kind','color','x','y','text'] or jsonb_typeof(p->'x')<>'number' or jsonb_typeof(p->'y')<>'number' or (p->>'x')::numeric not between 0 and 1 or (p->>'y')::numeric not between 0 and 1 or jsonb_typeof(p->'text')<>'string' or length(p->>'text')>240 or k='text' and length(trim(p->>'text'))=0 then raise exception 'Texto ou ponto inválido.';end if;
 end if;
end $$;
revoke all on function private.validate_mural_annotation(jsonb) from public,anon,authenticated;

create or replace function public.get_mural_annotations(p_item_id uuid,p_after bigint default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.campaign_mural_annotation_states;i public.campaign_mural_items;snapshot boolean;changes jsonb;
begin
 if not private.mural_annotation_readable(p_item_id) then raise exception 'Este mapa não está disponível no mural.' using errcode='42501';end if;
 select * into i from public.campaign_mural_items where id=p_item_id;
 select * into s from public.campaign_mural_annotation_states where item_id=p_item_id;
 snapshot=coalesce(p_after,0)<=0 or p_after>coalesce(s.revision,0) or p_after<coalesce(s.reset_revision,0);
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'item_id',a.item_id,'campaign_id',a.campaign_id,'author_id',a.author_id,'payload',case when a.deleted then '{}'::jsonb else a.payload end,'version',a.version,'deleted',a.deleted,'created_at',a.created_at) order by a.version,a.id),'[]'::jsonb) into changes from public.campaign_mural_annotations a where a.item_id=p_item_id and case when snapshot then not a.deleted else a.version>p_after end;
 return jsonb_build_object('revision',coalesce(s.revision,0),'snapshot',snapshot,'can_write',private.mural_annotation_writable(p_item_id),'image_path',i.image_path,'annotations',changes);
end $$;

create or replace function public.add_mural_annotation(p_item_id uuid,p_id uuid,p_image_path text,p_payload jsonb) returns public.campaign_mural_annotations language plpgsql security definer set search_path='' as $$
declare i public.campaign_mural_items;a public.campaign_mural_annotations;v bigint;
begin
 select * into i from public.campaign_mural_items where id=p_item_id for update;
 if i.id is null or auth.uid() is null or not private.mural_annotation_writable(p_item_id) then raise exception 'O mestre não permite novas marcações neste mapa.' using errcode='42501';end if;
 if i.image_path is distinct from p_image_path then raise exception 'A imagem mudou. Atualize o mural antes de marcar.' using errcode='40001';end if;
 if p_id is null then raise exception 'Marcação inválida.';end if;
 perform private.validate_mural_annotation(p_payload);
 select * into a from public.campaign_mural_annotations where id=p_id;
 if found then
  if a.item_id<>p_item_id or a.author_id<>auth.uid() or a.payload<>p_payload then raise exception 'Este envio pertence a outra marcação.' using errcode='42501';end if;
  return a;
 end if;
 if (select count(*) from public.campaign_mural_annotations where item_id=p_item_id and not deleted)>=1000 then raise exception 'Limite de 1.000 marcações neste mapa. Peça ao mestre para remover algumas.';end if;
 insert into public.campaign_mural_annotation_states(item_id,campaign_id) values(i.id,i.campaign_id) on conflict do nothing;
 update public.campaign_mural_annotation_states set revision=revision+1,updated_at=clock_timestamp() where item_id=i.id returning revision into v;
 insert into public.campaign_mural_annotations(id,item_id,campaign_id,author_id,payload,version) values(p_id,i.id,i.campaign_id,auth.uid(),p_payload,v) returning * into a;
 return a;
end $$;

create or replace function public.erase_mural_annotation(p_item_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.campaign_mural_items;a public.campaign_mural_annotations;v bigint;
begin
 select * into i from public.campaign_mural_items where id=p_item_id for update;
 if i.id is null or not private.mural_annotation_writable(p_item_id) then raise exception 'O mestre não permite alterar as marcações deste mapa.' using errcode='42501';end if;
 select * into a from public.campaign_mural_annotations where id=p_id and item_id=p_item_id;
 if not found then return;end if;
 if a.author_id<>auth.uid() and not private.is_campaign_owner(i.campaign_id) then raise exception 'Você só pode apagar suas próprias marcações.' using errcode='42501';end if;
 if a.deleted then return;end if;
 update public.campaign_mural_annotation_states set revision=revision+1,updated_at=clock_timestamp() where item_id=i.id returning revision into v;
 update public.campaign_mural_annotations set deleted=true,version=v where id=p_id;
end $$;

create or replace function public.clear_mural_annotations(p_item_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.campaign_mural_items;v bigint;
begin
 select * into i from public.campaign_mural_items where id=p_item_id for update;
 if i.id is null or not private.is_campaign_owner(i.campaign_id) or not private.mural_annotation_writable(p_item_id) then raise exception 'Somente o mestre pode limpar as marcações de um mapa ativo.' using errcode='42501';end if;
 update public.campaign_mural_annotation_states set revision=revision+1,updated_at=clock_timestamp() where item_id=i.id returning revision into v;
 update public.campaign_mural_annotations set deleted=true,version=v where item_id=i.id and not deleted;
end $$;
revoke all on function public.get_mural_annotations(uuid,bigint),public.add_mural_annotation(uuid,uuid,text,jsonb),public.erase_mural_annotation(uuid,uuid),public.clear_mural_annotations(uuid) from public,anon;
grant execute on function public.get_mural_annotations(uuid,bigint),public.add_mural_annotation(uuid,uuid,text,jsonb),public.erase_mural_annotation(uuid,uuid),public.clear_mural_annotations(uuid) to authenticated;

-- Replacing the image invalidates coordinates; identity deletion also resets
-- readers so removed authors do not leave stale drawings in other clients.
create or replace function private.mural_annotation_image_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.image_path is distinct from old.image_path or new.kind is distinct from old.kind then
  insert into public.campaign_mural_annotation_states(item_id,campaign_id,revision,reset_revision) values(new.id,new.campaign_id,1,1)
  on conflict(item_id) do update set revision=public.campaign_mural_annotation_states.revision+1,reset_revision=public.campaign_mural_annotation_states.revision+1,updated_at=clock_timestamp();
  delete from public.campaign_mural_annotations where item_id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists mural_annotation_image_changed on public.campaign_mural_items;
create trigger mural_annotation_image_changed after update on public.campaign_mural_items for each row execute function private.mural_annotation_image_changed();
create or replace function private.mural_annotation_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.campaign_mural_annotation_states set revision=revision+1,reset_revision=revision+1,updated_at=clock_timestamp() where item_id=old.item_id;
 return old;
end $$;
drop trigger if exists mural_annotation_removed on public.campaign_mural_annotations;
create trigger mural_annotation_removed after delete on public.campaign_mural_annotations for each row execute function private.mural_annotation_removed();
revoke all on function private.mural_annotation_image_changed(),private.mural_annotation_removed() from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_mural_annotation_states') then alter publication supabase_realtime add table public.campaign_mural_annotation_states;end if;
end $$;
notify pgrst,'reload schema';
commit;
