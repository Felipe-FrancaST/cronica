import { readFileSync, writeFileSync } from 'node:fs';
const previous = readFileSync(
  'supabase/migrations/202610230037_sheet_rules_and_guided_combat.sql',
  'utf8',
);
function extract(name: string) {
  const match = previous.match(
    new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\([^]*?end \\$\\$;`),
  );
  if (!match) throw new Error(name);
  return match[0];
}
let guide = extract('public.guide_battle_action')
  .replace(
    'not private.is_campaign_owner(q.campaign_id)',
    'not private.battle38_controls(q.token_id)',
  )
  .replace(
    'Somente o mestre pode autorizar a resolução guiada.',
    'Esta ação pertence a outro participante.',
  )
  .replace(
    ' select * into bs from public.battle_sessions',
    " if options<>'{}'::jsonb and not private.is_campaign_owner(q.campaign_id) then raise exception 'As regras da ficha são calculadas pelo servidor.' using errcode='42501';end if;\n select * into bs from public.battle_sessions",
  )
  .replace(
    'Resolução guiada autorizada. Aguardando as escolhas e rolagens dos participantes.',
    'Ação iniciada. Aguardando as escolhas e rolagens dos participantes.',
  );
guide = guide
  .replace(
    " if q.kind='opportunity' then raise exception 'Resolva a reação de oportunidade pelo painel de reações.';end if;",
    '',
  )
  .replaceAll(
    "coalesce((e->>'concentration')::boolean,false) and has_concentration",
    "(q.kind='opportunity' or coalesce((e->>'concentration')::boolean,false) and has_concentration)",
  )
  .replace(
    "'Trocar a concentração?'",
    "case when q.kind='opportunity' then 'Usar sua reação para atacar?' else 'Trocar a concentração?' end",
  )
  .replace(
    "'Conjurar e encerrar a concentração anterior'",
    "case when q.kind='opportunity' then 'Atacar com a reação' else 'Conjurar e encerrar a concentração anterior' end",
  )
  .replace(
    "'Cancelar e manter a concentração atual'",
    "case when q.kind='opportunity' then 'Não atacar e liberar o movimento' else 'Cancelar e manter a concentração atual' end",
  );
const opportunity = guide
  .replace('public.guide_battle_action(', 'private.battle38_begin_opportunity(')
  .replace(
    'if q.id is null or not private.battle38_controls(q.token_id) or not private.can_read_campaign(q.campaign_id)',
    "if q.id is null or q.kind<>'opportunity'",
  );
const next = extract('private.battle37_next')
  .replace(
    "'Conjuração cancelada antes de gastar recursos.'",
    "case when q.kind='opportunity' then 'Reação dispensada. Movimento liberado.' else 'Conjuração cancelada antes de gastar recursos.' end",
  )
  .replace(
    '   return q;',
    '   if q.movement_plan_id is not null then perform private.battle_finish_movement(q.movement_plan_id);end if;\n   return q;',
  )
  .replace(
    '  update public.battle_spell_effects set active=false where token_id=q.token_id and concentration and active;',
    "  if q.kind<>'opportunity' then update public.battle_spell_effects set active=false where token_id=q.token_id and concentration and active;end if;",
  );
let request = extract('public.request_battle_action').replaceAll(
  'private.can_control_battle_token(',
  'private.battle38_controls(',
);
const end = request.lastIndexOf(' return result;');
request =
  request.slice(0, end) +
  request
    .slice(end)
    .replace(' return result;', " return public.guide_battle_action(result.id,'{}');");
const answer = extract('public.answer_battle_decision').replaceAll(
  'private.can_control_battle_token(',
  'private.battle38_controls(',
);
const configure = extract('public.configure_battle_decision').replace(
  'begin\n',
  "begin\n if not exists(select 1 from public.battle_decisions check_decision join public.battle_map_tokens t on t.id=check_decision.token_id where check_decision.id=p_decision_id and t.npc_id is not null) then raise exception 'O mestre configura somente testes de NPCs.' using errcode='42501';end if;\n",
);
const base = readFileSync('supabase/patches/direct-combat.sql', 'utf8');
let advance = readFileSync(
  'supabase/migrations/202610060016_campaign_sessions_and_rules.sql',
  'utf8',
).match(/create or replace function public.advance_battle_turn\([^]*?end \$\$;/)![0];
advance = advance
  .replace(
    '(not private.is_campaign_owner(s.campaign_id) and (s.active_token_id is null or not private.can_control_battle_token(s.active_token_id)))',
    '(s.active_token_id is null or not private.battle38_controls(s.active_token_id))',
  )
  .replace(/  if not private.is_campaign_owner\(s.campaign_id\) and exists[^\n]+\n/, '');
const guardLegacy = (source: string, name: string, row: string) => {
  const fn = source.match(
    new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\([^]*?end \\$\\$;`),
  )![0];
  const needle = ` select * into ${row} from public.battle_action_requests where id=p_request_id;`;
  if (!fn.includes(needle)) throw new Error('Missing guarded request read: ' + name);
  return fn.replace(
    needle,
    needle +
      `\n if coalesce((${row}.resolution->>'guided')::boolean,false) then raise exception 'Esta ação é automática. Cada participante deve concluir suas próprias rolagens.' using errcode='42501';end if;`,
  );
};
const legacy18 = readFileSync(
  'supabase/migrations/202610070018_spell_access_combat_and_items.sql',
  'utf8',
);
const legacy25 = readFileSync('supabase/migrations/202610130025_campaign_items.sql', 'utf8');
const sql = [
  '-- 038: autonomous turns, participant ownership and compact combat replies. Apply after 037.',
  'begin;',
  base,
  guide,
  opportunity,
  'revoke all on function private.battle38_begin_opportunity(uuid,jsonb) from public,anon,authenticated;',
  next,
  request,
  answer,
  configure,
  advance,
  guardLegacy(legacy18, 'public.approve_battle_action', 'q'),
  guardLegacy(legacy18, 'public.resolve_battle_action', 'q'),
  guardLegacy(legacy25, 'public.resolve_battle_action_v9', 'r'),
  'commit;',
].join('\n\n');
if (Buffer.byteLength(sql) > 256 * 1024) throw new Error('SQL editor limit');
writeFileSync('supabase/migrations/202610230038_direct_combat.sql', sql);
