import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import type { DndSheet, ClassLevel, Spell } from '../src/systems/dnd5e/types';
import type { BattleDecision, BattleMap, BattleToken } from '../src/features/vtt/types';

test('038: automatic combat has strict participant ownership and compact atomic replies', async (t) => {
  const db = await billingDatabase();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    await db.exec(readMigration('202610230037_sheet_rules_and_guided_combat.sql'));
    await db.exec(readMigration('202610230038_direct_combat.sql'));
    const gm = randomUUID(),
      player = randomUUID(),
      defender = randomUUID(),
      stranger = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID(),
      other = randomUUID(),
      npc = randomUUID();
    const system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'guide-gm@test.local'),($2,'guide-player@test.local'),($3,'guide-defender@test.local'),($4,'guide-stranger@test.local')",
      [gm, player, defender, stranger],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Guided combat')",
      [campaign, gm, system],
    );
    await db.query(
      'insert into public.campaign_members(campaign_id,user_id) values($1,$2),($1,$3)',
      [campaign, player, defender],
    );
    async function as<T>(id: string, fn: () => Promise<T>) {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    }
    const make = (levels: ClassLevel[]) =>
      withClassLevels(
        {
          ...defaultSheet(),
          hp_current: 500,
          hp_max_override: 500,
          abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 16, cha: 16 },
        },
        levels,
      );
    const spell = (name: string, origin = 'wizard'): Spell => ({
      ...spellFromCatalog(
        SPELL_CATALOG.find((sp) => sp.english_name === name)!,
        randomUUID(),
        origin,
      ),
      prepared: true,
    });
    async function save(sheet: DndSheet, id = hero, owner = player) {
      await as(owner, () =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: owner,
            name: id === hero ? 'Mira' : 'Dara',
            sheet,
          }),
        ]),
      );
    }
    await save(make([{ class_id: 'wizard', level: 5 }]));
    await save(make([{ class_id: 'rogue', level: 7 }]), other, defender);
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name,relationship,visible_to_players) values($1,$2,$3,'Ogro','Hostil',true)",
      [npc, campaign, system],
    );
    await db.query(
      'insert into public.npc_stats(npc_id,hp_current,hp_max,ac) values($1,500,500,15)',
      [npc],
    );
    await as(gm, () =>
      db.query(
        "select public.start_campaign_session((public.save_campaign_session($1,'Sessão',1)).id)",
        [campaign],
      ),
    );
    const map = (
      await as(gm, () =>
        db.query<{ m: BattleMap }>('select to_jsonb(public.create_battle_map($1,$2)) m', [
          campaign,
          JSON.stringify({ name: 'Arena', width: 30, height: 30, scale_per_cell: 1.5 }),
        ]),
      )
    ).rows[0].m;
    const actor = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,2,2)) t',
          [map.id, hero],
        ),
      )
    ).rows[0].t;
    const ally = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,4,2)) t',
          [map.id, other],
        ),
      )
    ).rows[0].t;
    const enemy = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          "select to_jsonb(public.add_npc_to_battle_map($1,$2,12,'m',6,2)) t",
          [map.id, npc],
        ),
      )
    ).rows[0].t;
    async function start() {
      await db.exec(
        "update public.battle_decisions set status='cancelled' where status='pending';update public.battle_action_requests set status='cancelled' where status in('pending','approved')",
      );
      await as(gm, () =>
        db.query('select public.start_battle_combat($1,$2)', [
          map.battle_session_id,
          JSON.stringify(
            [actor.id, ally.id, enemy.id].map((token_id, i) => ({ token_id, initiative: 20 - i })),
          ),
        ]),
      );
    }

    // Fix only d20 faces in this fixture; damage still uses the production roller.
    await db.exec(`alter function private.battle_roll_detail(text,text) rename to direct_test_original_roll;
    create function private.battle_roll_detail(p_expression text,p_mode text default 'normal') returns jsonb language plpgsql volatile set search_path='' as $$
    declare d jsonb=private.direct_test_original_roll(p_expression,p_mode);term jsonb;terms jsonb='[]';delta integer=0;
    begin for term in select value from jsonb_array_elements(d->'terms') loop
      if (term->>'sides')::integer=20 then delta=delta+20-(term->>'subtotal')::integer;term=term||jsonb_build_object('values',case when p_mode='normal' then jsonb_build_array(20) else jsonb_build_array(20,20) end,'subtotal',20);end if;terms=terms||jsonb_build_array(term);end loop;
      return d||jsonb_build_object('terms',terms,'total',(d->>'total')::integer+delta);end $$;`);
    await start();
    await t.test('player action starts and creates their roll without a GM call', async () => {
      const attack = spell('Fire Bolt');
      await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [attack] });
      const payload = {
        kind: 'spell',
        source_id: attack.id,
        resource_kind: 'cantrip',
        resource_level: 0,
        target: { x: 6, y: 2 },
        target_ids: [enemy.id],
      };
      const client = randomUUID();
      const response = await as(player, () =>
        db.query<{ r: any }>('select public.perform_battle_action($1,$2,$3) r', [
          actor.id,
          JSON.stringify(payload),
          client,
        ]),
      );
      const update = response.rows[0].r;
      assert.equal(update.action.resolution.guided, true);
      assert.equal(update.decisions.length, 1);
      assert.equal(update.decisions[0].kind, 'attack');
      assert.equal(update.decisions[0].token_id, actor.id);
      const d = update.decisions[0];
      await assert.rejects(
        as(gm, () =>
          db.query('select public.answer_battle_decision_fast($1,$2)', [d.id, randomUUID()]),
        ),
        /outro participante/,
      );
      await assert.rejects(
        as(defender, () =>
          db.query('select public.answer_battle_decision_fast($1,$2)', [d.id, randomUUID()]),
        ),
        /outro participante/,
      );
      const hidden = await as(gm, () =>
        db.query('select * from public.battle_decisions where id=$1', [d.id]),
      );
      assert.equal(hidden.rows.length, 0);
      const answerClient = randomUUID();
      const result = await as(player, () =>
        db.query<{ r: any }>('select public.answer_battle_decision_fast($1,$2) r', [
          d.id,
          answerClient,
        ]),
      );
      assert.equal(result.rows[0].r.decision.status, 'answered');
      assert.ok(result.rows[0].r.tokens.length > 0);
      const retry = await as(player, () =>
        db.query<{ r: any }>('select public.answer_battle_decision_fast($1,$2) r', [
          d.id,
          answerClient,
        ]),
      );
      assert.deepEqual(retry.rows[0].r.decision.result, result.rows[0].r.decision.result);
      assert.equal(result.rows[0].r.decision.result.critical, true);
      const damage = result.rows[0].r.decisions.find((d: any) => d.kind === 'damage');
      assert.ok(damage);
      const damageClient = randomUUID();
      const completed = (
        await as(player, () =>
          db.query<{ r: any }>('select public.answer_battle_decision_fast($1,$2) r', [
            damage.id,
            damageClient,
          ]),
        )
      ).rows[0].r;
      const finished = completed.actions.find((q: any) => q.id === update.action.id);
      assert.equal(finished.status, 'success');
      assert.equal(finished.resolution.resources_consumed, true);
      assert.equal(completed.tokens.find((t: any) => t.id === actor.id).action_used, true);
      const hp = (
        await db.query<{ hp_current: number }>(
          'select hp_current from public.npc_stats where npc_id=$1',
          [npc],
        )
      ).rows[0].hp_current;
      assert.ok(hp < 500);
      await as(player, () =>
        db.query('select public.answer_battle_decision_fast($1,$2)', [damage.id, damageClient]),
      );
      assert.equal(
        (
          await db.query<{ hp_current: number }>(
            'select hp_current from public.npc_stats where npc_id=$1',
            [npc],
          )
        ).rows[0].hp_current,
        hp,
      );
      await assert.rejects(
        as(gm, () => db.query('select public.resolve_battle_action($1,true)', [update.action.id])),
        /automática/,
      );
      await assert.rejects(
        as(gm, () => db.query('select public.approve_battle_action($1,true)', [update.action.id])),
        /automática/,
      );

      const repeated = await as(player, () =>
        db.query<{ r: any }>('select public.perform_battle_action($1,$2,$3) r', [
          actor.id,
          JSON.stringify(payload),
          client,
        ]),
      );
      assert.equal(repeated.rows[0].r.action.id, update.action.id);
      await assert.rejects(
        as(gm, () =>
          db.query('select public.request_battle_action($1,$2,$3)', [
            actor.id,
            JSON.stringify(payload),
            randomUUID(),
          ]),
        ),
        /controla/,
      );
    });
    await t.test('NPC decisions belong only to the GM; hidden names remain private', async () => {
      await start();
      const attack = spell('Fireball');
      await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [attack] });
      const result = await as(player, () =>
        db.query<{ r: any }>('select public.perform_battle_action($1,$2,$3) r', [
          actor.id,
          JSON.stringify({
            kind: 'spell',
            source_id: attack.id,
            resource_kind: 'slot',
            resource_level: 3,
            target: { x: 5, y: 2 },
            target_ids: [],
          }),
          randomUUID(),
        ]),
      );
      assert.equal(
        result.rows[0].r.decisions.some((d: any) => d.token_id === enemy.id),
        false,
      );
      const npcDecision = (
        await as(gm, () =>
          db.query<BattleDecision>(
            "select * from public.battle_decisions where token_id=$1 and status='pending'",
            [enemy.id],
          ),
        )
      ).rows[0];
      assert.ok(npcDecision);
      await assert.rejects(
        as(player, () =>
          db.query('select public.answer_battle_decision_fast($1,$2)', [
            npcDecision.id,
            randomUUID(),
          ]),
        ),
        /outro participante/,
      );
      const answered = await as(gm, () =>
        db.query<{ r: any }>('select public.answer_battle_decision_fast($1,$2) r', [
          npcDecision.id,
          randomUUID(),
        ]),
      );
      assert.equal(answered.rows[0].r.decision.status, 'answered');
      const defenderDecision = (
        await as(defender, () =>
          db.query<BattleDecision>(
            "select * from public.battle_decisions where token_id=$1 and status='pending'",
            [ally.id],
          ),
        )
      ).rows[0];
      assert.ok(defenderDecision);
      await assert.rejects(
        as(gm, () =>
          db.query('select public.configure_battle_decision($1,$2)', [
            defenderDecision.id,
            'advantage',
          ]),
        ),
        /somente testes de NPCs/,
      );
      await as(defender, () =>
        db.query('select public.answer_battle_decision_fast($1,$2)', [
          defenderDecision.id,
          randomUUID(),
        ]),
      );
      const pending = (
        await as(player, () =>
          db.query<BattleDecision>(
            "select * from public.battle_decisions where token_id=$1 and status='pending'",
            [actor.id],
          ),
        )
      ).rows;
      for (const d of pending)
        await as(player, () =>
          db.query('select public.answer_battle_decision_fast($1,$2)', [d.id, randomUUID()]),
        );
    });

    await t.test(
      'opportunity reactions ask the character owner and can be declined without GM approval',
      async () => {
        await start();
        const requestId = randomUUID();
        await db.query(
          `insert into public.battle_action_requests(id,campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
        select $1,$2,s.id,$3,$4,$5,$6,'opportunity','Reação de oportunidade','reaction','none',0,0,'{"x":6,"y":2}'::jsonb,array[$7::uuid],'{"shape":"single","kind":"damage","range":9,"dice":"1d4","attackBonus":5}'::jsonb,s.round,s.turn_index,s.turn_started_at from public.battle_sessions s where s.id=$8`,
          [
            requestId,
            campaign,
            map.id,
            actor.id,
            player,
            randomUUID(),
            enemy.id,
            map.battle_session_id,
          ],
        );
        const d = (
          await as(player, () =>
            db.query<BattleDecision>(
              "select * from public.battle_decisions where request_id=$1 and status='pending'",
              [requestId],
            ),
          )
        ).rows[0];
        assert.equal(d.kind, 'choice');
        await assert.rejects(
          as(gm, () =>
            db.query('select public.answer_battle_decision_fast($1,$2,$3)', [
              d.id,
              randomUUID(),
              JSON.stringify({ choice: 'continue' }),
            ]),
          ),
          /outro participante/,
        );
        await as(player, () =>
          db.query('select public.answer_battle_decision_fast($1,$2,$3)', [
            d.id,
            randomUUID(),
            JSON.stringify({ choice: 'cancel' }),
          ]),
        );
        const q = (
          await db.query<{ status: string }>(
            'select status from public.battle_action_requests where id=$1',
            [requestId],
          )
        ).rows[0];
        assert.equal(q.status, 'cancelled');
        assert.equal(
          (
            await db.query<{ reaction_used: boolean }>(
              'select reaction_used from public.battle_map_tokens where id=$1',
              [actor.id],
            )
          ).rows[0].reaction_used,
          false,
        );
      },
    );
    await t.test(
      'only the active participant ends their turn and the compact reply advances initiative',
      async () => {
        await start();
        await assert.rejects(
          as(gm, () =>
            db.query(
              'select public.finish_battle_turn($1,$2,(select turn_started_at from public.battle_sessions where id=$1))',
              [map.battle_session_id, map.id],
            ),
          ),
          /encerrar este turno/,
        );
        await assert.rejects(
          as(defender, () =>
            db.query(
              'select public.finish_battle_turn($1,$2,(select turn_started_at from public.battle_sessions where id=$1))',
              [map.battle_session_id, map.id],
            ),
          ),
          /encerrar este turno/,
        );
        const update = (
          await as(player, () =>
            db.query<{ r: any }>(
              'select public.finish_battle_turn($1,$2,(select turn_started_at from public.battle_sessions where id=$1)) r',
              [map.battle_session_id, map.id],
            ),
          )
        ).rows[0].r;
        assert.equal(update.sessions[0].active_token_id, ally.id);
        const firstTurn = (
          await db.query<{ turn_started_at: string }>(
            'select turn_started_at from public.battle_sessions where id=$1',
            [map.battle_session_id],
          )
        ).rows[0].turn_started_at;
        await as(defender, () =>
          db.query('select public.finish_battle_turn($1,$2,$3)', [
            map.battle_session_id,
            map.id,
            firstTurn,
          ]),
        );
        await as(defender, () =>
          db.query('select public.finish_battle_turn($1,$2,$3)', [
            map.battle_session_id,
            map.id,
            firstTurn,
          ]),
        );
        assert.equal(
          (
            await db.query<{ active_token_id: string }>(
              'select active_token_id from public.battle_sessions where id=$1',
              [map.battle_session_id],
            )
          ).rows[0].active_token_id,
          enemy.id,
        );

        const npcTurn = (
          await as(gm, () =>
            db.query<{ r: any }>(
              'select public.finish_battle_turn($1,$2,(select turn_started_at from public.battle_sessions where id=$1)) r',
              [map.battle_session_id, map.id],
            ),
          )
        ).rows[0].r;
        assert.equal(npcTurn.sessions[0].active_token_id, actor.id);
        assert.equal(npcTurn.sessions[0].round, 2);
      },
    );
    await db.exec(readMigration('202610230038_direct_combat.sql'));
  } finally {
    await db.close();
  }
});
