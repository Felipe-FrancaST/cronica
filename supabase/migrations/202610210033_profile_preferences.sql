-- Preferences are merged on the server so another tab cannot overwrite unrelated choices.
begin;
create or replace function public.update_profile_preferences(p_preferences jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text;
  v jsonb;
  result jsonb;
begin
  if uid is null then raise exception 'Entre na sua conta para salvar as configurações.'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Configurações inválidas.';
  end if;
  for k,v in select * from jsonb_each(p_preferences) loop
    if k in ('compact_cards','dice_animation') then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'Configuração inválida: %.', k; end if;
    elsif k = 'text_size' then
      if v not in ('"standard"'::jsonb,'"large"'::jsonb) then raise exception 'Tamanho do texto inválido.'; end if;
    elsif k = 'motion' then
      if v not in ('"system"'::jsonb,'"reduced"'::jsonb) then raise exception 'Preferência de movimento inválida.'; end if;
    elsif k = 'vtt_view' then
      if v not in ('"3d"'::jsonb,'"2d"'::jsonb) then raise exception 'Visualização inválida.'; end if;
    elsif k = 'vtt_quality' then
      if v not in ('"balanced"'::jsonb,'"low"'::jsonb) then raise exception 'Qualidade gráfica inválida.'; end if;
    else raise exception 'Configuração desconhecida: %.', k;
    end if;
  end loop;
  update public.profiles set preferences = preferences || p_preferences
    where id = uid returning preferences into result;
  if not found then raise exception 'Perfil não encontrado.'; end if;
  return result;
end;
$$;
revoke all on function public.update_profile_preferences(jsonb) from public, anon;
grant execute on function public.update_profile_preferences(jsonb) to authenticated;
-- Realtime is optional; clients also refresh when focused and every 30 seconds.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
commit;
