import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import type { DndSheet, ClassLevel, Spell } from '../src/systems/dnd5e/types';
import type { BattleMap, BattleToken } from '../src/features/vtt/types';

test('043: NPC controls, condition mechanics, narrative markers and vision', async (t) => {
  const db = await billingDatabase();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
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

    assert.ok(ally.id);
    await as(gm, () =>
      db.query('select public.start_battle_combat($1,$2)', [
        map.battle_session_id,
        JSON.stringify([
          { token_id: actor.id, initiative: 20 },
          { token_id: enemy.id, initiative: 10 },
        ]),
      ]),
    );
    const command = async (
      change: Record<string, unknown>,
      token = enemy.id,
      client = randomUUID(),
      user = gm,
    ) =>
      (
        await as(user, () =>
          db.query<any>('select public.manage_battle_creature($1,$2,$3) result', [
            token,
            JSON.stringify(change),
            client,
          ]),
        )
      ).rows[0].result;
    const sheet = async (token = enemy.id) =>
      (await db.query<any>('select private.battle_sheet($1) s', [token])).rows[0].s;
    async function reset() {
      await db.exec(
        "update private.battle_condition_effects set active=false;update public.battle_spell_effects set active=false;update public.battle_decisions set status='cancelled' where status='pending';",
      );
      await db.query(
        'update public.characters set system_data=system_data||\'{"hp_current":500,"hp_temp":0,"conditions":[],"exhaustion":0,"death_failures":0,"death_successes":0}\' where id=any($1)',
        [[hero, other]],
      );
      await db.query(
        "update public.npc_stats set hp_current=500,hp_max=500,hp_temp=0,stat_block='{}',resistances='',weaknesses='' where npc_id=$1",
        [npc],
      );
      await db.query(
        'update public.battle_map_tokens set movement_speed=9,movement_remaining=9,action_used=false,bonus_used=false where id=$1',
        [actor.id],
      );
    }
    await t.test('structured NPCs persist training, movement and immunities', async () => {
      const n = (
        await db.query<any>(
          'select to_jsonb(n)||to_jsonb(ns) payload from public.npcs n join public.npc_stats ns on ns.npc_id=n.id where n.id=$1',
          [npc],
        )
      ).rows[0].payload;
      const block = {
        movement: { walk: 12, fly: 18 },
        senses: { blindsight: 9, trueSight: 36 },
        saving_throws: { dex: 8 },
        proficiency: 4,
        condition_immunities: ['Enfeitiçado'],
      };
      await as(gm, () =>
        db.query('select public.save_npc($1)', [
          JSON.stringify({ ...n, stat_block: block, attacks: [], spells: [] }),
        ]),
      );
      assert.deepEqual(
        (await db.query<any>('select stat_block from public.npc_stats where npc_id=$1', [npc]))
          .rows[0].stat_block,
        block,
      );
      assert.equal(
        (await db.query<any>("select private.dnd37_save_bonus($1,'dex') n", [enemy.id])).rows[0].n,
        8,
      );
      await assert.rejects(
        () => command({ operation: 'condition', condition: 'Enfeitiçado' }),
        /imune/i,
      );
      assert.equal(
        Number(
          (
            await db.query<any>('select movement_speed from public.battle_map_tokens where id=$1', [
              enemy.id,
            ])
          ).rows[0].movement_speed,
        ),
        12,
      );
    });
    await t.test(
      'large NPCs use their footprint and grapples restore the spent movement budget',
      async () => {
        await reset();
        const n = (
            await db.query<any>(
              'select to_jsonb(n)||to_jsonb(ns) payload from public.npcs n join public.npc_stats ns on ns.npc_id=n.id where n.id=$1',
              [npc],
            )
          ).rows[0].payload,
          largeId = randomUUID();
        await as(gm, () =>
          db.query('select public.save_npc($1)', [
            JSON.stringify({
              ...n,
              id: largeId,
              name: 'Gigante',
              stat_block: { size: 'Grande', movement: { walk: 12 } },
              attacks: [],
              spells: [],
            }),
          ]),
        );
        await db.query("update public.battle_sessions set status='preparing' where id=$1", [
          map.battle_session_id,
        ]);
        const large = (
          await as(gm, () =>
            db.query<any>("select to_jsonb(public.add_npc_to_battle_map($1,$2,12,'m',20,10)) t", [
              map.id,
              largeId,
            ]),
          )
        ).rows[0].t;
        assert.equal(large.size, 2);
        await db.query("update public.battle_sessions set status='active' where id=$1", [
          map.battle_session_id,
        ]);
        await db.query('update public.battle_map_tokens set movement_remaining=7.5 where id=$1', [
          actor.id,
        ]);
        await command(
          {
            operation: 'condition',
            condition: 'Agarrado',
            source_token_id: enemy.id,
            source_reach: 9,
          },
          actor.id,
        );
        assert.equal(
          Number(
            (
              await db.query<any>(
                'select movement_speed from public.battle_map_tokens where id=$1',
                [actor.id],
              )
            ).rows[0].movement_speed,
          ),
          0,
        );
        await command({ operation: 'condition', condition: 'Incapacitado' });
        assert.ok(!(await sheet(actor.id)).conditions.includes('Agarrado'));
        assert.equal(
          Number(
            (
              await db.query<any>(
                'select movement_remaining from public.battle_map_tokens where id=$1',
                [actor.id],
              )
            ).rows[0].movement_remaining,
          ),
          7.5,
        );
        await reset();
      },
    );
    await t.test('See Invisibility consumes one slot and persists on its caster', async () => {
      await reset();
      const see = spell('See invisibility');
      await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [see] });
      const result = (
        await as(player, () =>
          db.query<any>('select public.perform_battle_action($1,$2,$3) result', [
            actor.id,
            JSON.stringify({
              kind: 'spell',
              source_id: see.id,
              target: { x: actor.x, y: actor.y },
              target_ids: [actor.id],
              resource_kind: 'slot',
              resource_level: 2,
            }),
            randomUUID(),
          ]),
        )
      ).rows[0].result;
      assert.equal(result.action.status, 'success');
      const effects = result.spellEffects.filter(
        (e: any) => e.definition.entry.catalog_id === 'ver-o-invisivel',
      );
      assert.equal(effects.length, 1);
      assert.equal(effects[0].definition.shape, 'self');
      assert.ok(effects[0].definition.scene_targets.includes(actor.id));
      assert.equal((await sheet(actor.id)).slots_used['2'], 1);
      assert.equal(
        (
          await db.query<any>(
            'select private.battle43_senses(t) v from public.battle_map_tokens t where id=$1',
            [actor.id],
          )
        ).rows[0].v.seeInvisible,
        true,
      );
      await reset();
    });
    await t.test(
      'incapacitation cancels an unrolled cast without blocking the turn or spending its slot',
      async () => {
        await reset();
        const fire = spell('Fireball');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [fire], slots_used: {} });
        const result = (
          await as(player, () =>
            db.query<any>('select public.perform_battle_action($1,$2,$3) result', [
              actor.id,
              JSON.stringify({
                kind: 'spell',
                source_id: fire.id,
                target: { x: 9, y: 2 },
                target_ids: [enemy.id],
                resource_kind: 'slot',
                resource_level: 3,
              }),
              randomUUID(),
            ]),
          )
        ).rows[0].result;
        assert.equal(result.action.status, 'pending');
        await command({ operation: 'condition', condition: 'Incapacitado' }, actor.id);
        assert.equal(
          (
            await db.query<any>('select status from public.battle_action_requests where id=$1', [
              result.action.id,
            ])
          ).rows[0].status,
          'cancelled',
        );
        assert.equal(Number((await sheet(actor.id)).slots_used['3'] ?? 0), 0);
        assert.equal(
          (
            await db.query<any>(
              "select count(*) n from public.battle_decisions where request_id=$1 and status='pending'",
              [result.action.id],
            )
          ).rows[0].n,
          0,
        );
        await reset();
      },
    );
    await t.test('a caster falling to their own area damage spends exactly one slot', async () => {
      await reset();
      const fire = spell('Fireball');
      await save({
        ...make([{ class_id: 'wizard', level: 5 }]),
        hp_current: 1,
        spells: [fire],
        slots_used: {},
      });
      const result = (
        await as(player, () =>
          db.query<any>('select public.perform_battle_action($1,$2,$3) result', [
            actor.id,
            JSON.stringify({
              kind: 'spell',
              source_id: fire.id,
              target: { x: 2, y: 2 },
              target_ids: [],
              resource_kind: 'slot',
              resource_level: 3,
            }),
            randomUUID(),
          ]),
        )
      ).rows[0].result;
      for (let i = 0; i < 10; i++) {
        const decisions = (
          await db.query<any>(
            "select d.*,t.npc_id,t.character_id from public.battle_decisions d join public.battle_map_tokens t on t.id=d.token_id where d.request_id=$1 and d.status='pending' order by d.created_at,d.id",
            [result.action.id],
          )
        ).rows;
        if (!decisions.length) break;
        for (const d of decisions) {
          const user = d.npc_id ? gm : d.character_id === hero ? player : defender;
          await as(user, () =>
            db.query('select public.answer_battle_decision($1,$2,$3)', [d.id, randomUUID(), '{}']),
          );
        }
      }
      assert.equal((await sheet(actor.id)).hp_current, 0);
      assert.equal((await sheet(actor.id)).slots_used['3'], 1);
      assert.equal(
        (
          await db.query<any>('select status from public.battle_action_requests where id=$1', [
            result.action.id,
          ])
        ).rows[0].status,
        'success',
      );
      await reset();
    });
    await t.test(
      'GM-only HP commands are atomic, replayable and update NPC/PC summaries',
      async () => {
        const client = randomUUID();
        const update = await command({ operation: 'damage', amount: 12 }, enemy.id, client);
        assert.equal(update.lifeStates.find((l: any) => l.id === enemy.id).hp_current, 488);
        assert.equal(update.lifeStates.find((l: any) => l.id === enemy.id).ac, 15);
        await command({ operation: 'damage', amount: 12 }, enemy.id, client);
        assert.equal((await sheet()).hp_current, 488);
        await assert.rejects(
          () => command({ operation: 'damage', amount: 13 }, enemy.id, client),
          /identificador/i,
        );
        await assert.rejects(
          () => command({ operation: 'damage', amount: 12 }, enemy.id, randomUUID(), player),
          /mestre/i,
        );
        await command({ operation: 'temporary', amount: 8 });
        await command({ operation: 'temporary', amount: 4 });
        await command({ operation: 'damage', amount: 10 });
        assert.equal((await sheet()).hp_current, 486);
        assert.equal((await sheet()).hp_temp, 0);
        await command({ operation: 'healing', amount: 1000 });
        assert.equal((await sheet()).hp_current, 500);
        const own = (
          await as(player, () =>
            db.query<any>('select public.battle_combat_update($1) result', [map.id]),
          )
        ).rows[0].result;
        assert.equal(own.lifeStates.find((l: any) => l.id === actor.id).hp_current, 500);
        assert.equal(
          own.lifeStates.find((l: any) => l.id === enemy.id).hp_current,
          undefined,
          'players do not receive enemy HP',
        );
      },
    );
    await t.test(
      'all conditions are accepted; incapacitation and paralysis alter actions and movement',
      async () => {
        await reset();
        for (const condition of [
          'Agarrado',
          'Amedrontado',
          'Atordoado',
          'Caído',
          'Cego',
          'Enfeitiçado',
          'Envenenado',
          'Impedido',
          'Incapacitado',
          'Inconsciente',
          'Invisível',
          'Paralisado',
          'Petrificado',
          'Surdo',
        ]) {
          await command({ operation: 'condition', condition }, actor.id);
          assert.ok((await sheet(actor.id)).conditions.includes(condition));
          await command({ operation: 'remove_condition', condition }, actor.id);
        }
        await command({ operation: 'condition', condition: 'Paralisado' }, actor.id);
        assert.ok((await sheet(actor.id)).conditions.includes('Incapacitado'));
        assert.equal(
          (
            await db.query<any>('select movement_speed from public.battle_map_tokens where id=$1', [
              actor.id,
            ])
          ).rows[0].movement_speed,
          '0.0000',
        );
        await command({ operation: 'remove_condition', condition: 'Paralisado' }, actor.id);
        await command({ operation: 'condition', condition: 'Incapacitado' }, actor.id);
        assert.equal(
          Number(
            (
              await db.query<any>(
                'select movement_speed from public.battle_map_tokens where id=$1',
                [actor.id],
              )
            ).rows[0].movement_speed,
          ),
          9,
          'incapacitated alone does not set speed to zero',
        );
        await command({ operation: 'remove_condition', condition: 'Incapacitado' }, actor.id);
      },
    );
    await t.test(
      'exhaustion is cumulative: speed, rolls, maximum HP, restoration and death',
      async () => {
        await reset();
        await command({ operation: 'condition', condition: 'Exaustão', level: 4 }, actor.id);
        const result = await sheet(actor.id);
        assert.equal(result.exhaustion, 4);
        assert.equal(result.hp_current, 250);
        assert.equal(
          (
            await db.query<any>('select private.battle_hp_max(private.battle_sheet($1)) n', [
              actor.id,
            ])
          ).rows[0].n,
          250,
        );
        assert.equal(
          Number(
            (
              await db.query<any>(
                'select movement_speed from public.battle_map_tokens where id=$1',
                [actor.id],
              )
            ).rows[0].movement_speed,
          ),
          4.5,
        );
        await command({ operation: 'remove_condition', condition: 'Exaustão' }, actor.id);
        assert.equal((await sheet(actor.id)).exhaustion, 0);
        await command({ operation: 'condition', condition: 'Exaustão', level: 6 }, actor.id);
        assert.equal((await sheet(actor.id)).hp_current, 0);
        assert.ok((await sheet(actor.id)).conditions.includes('Morto'));
      },
    );
    await t.test(
      'petrification resists damage without stacking and blocks new poison',
      async () => {
        await reset();
        await command({ operation: 'condition', condition: 'Petrificado' });
        await command({ operation: 'damage', amount: 11, damage_type: 'fogo' });
        assert.equal((await sheet()).hp_current, 495);
        await assert.rejects(
          () => command({ operation: 'condition', condition: 'Envenenado' }),
          /imune/i,
        );
        await command({ operation: 'damage', amount: 100, damage_type: 'veneno' });
        assert.equal((await sheet()).hp_current, 495);
        await command({ operation: 'remove_condition', condition: 'Petrificado' });
        await db.query(
          'update public.npc_stats set resistances=\'fogo, frio\',stat_block=\'{"damage_immunities":"veneno"}\' where npc_id=$1',
          [npc],
        );
        await command({ operation: 'damage', amount: 10, damage_type: 'fogo' });
        assert.equal((await sheet()).hp_current, 490);
        await command({ operation: 'damage', amount: 10, damage_type: 'veneno' });
        assert.equal((await sheet()).hp_current, 490);
      },
    );
    await t.test(
      'fear prevents approaching its source; charm prevents harming its source',
      async () => {
        await reset();
        await command(
          { operation: 'condition', condition: 'Amedrontado', source_token_id: enemy.id },
          actor.id,
        );
        await assert.rejects(
          () =>
            db.query(
              'select private.battle43_validate_move(t,$2,false) from public.battle_map_tokens t where id=$1',
              [actor.id, JSON.stringify([{ x: 3, y: 2 }])],
            ),
          /aproximar/,
        );
        await db.query(
          'select private.battle43_validate_move(t,$2,false) from public.battle_map_tokens t where id=$1',
          [actor.id, JSON.stringify([{ x: 1, y: 2 }])],
        );
        const mode = (
          await db.query<any>(
            'select private.battle39_attack_mode(a,t,m,false) mode from public.battle_map_tokens a,public.battle_map_tokens t,public.battle_maps m where a.id=$1 and t.id=$2 and m.id=$3',
            [actor.id, enemy.id, map.id],
          )
        ).rows[0].mode;
        assert.equal(mode, 'disadvantage');
        await command({ operation: 'remove_condition', condition: 'Amedrontado' }, actor.id);
        await command(
          { operation: 'condition', condition: 'Enfeitiçado', source_token_id: enemy.id },
          actor.id,
        );
        await assert.rejects(
          () =>
            db.query(
              `insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,target_ids,definition,round,turn_index) values($1,$2,$3,$4,$5,$6,'weapon','Golpe','action','{"x":6,"y":2}',array[$7::uuid],'{"kind":"damage","shape":"single"}',1,0)`,
              [campaign, map.battle_session_id, map.id, actor.id, player, randomUUID(), enemy.id],
            ),
          /Enfeitiçado/,
        );
      },
    );
    await t.test(
      'blindsight, darkness, actual light, invisibility and walls follow observer senses',
      async () => {
        await reset();
        await db.query(
          "update public.battle_maps set vision_enabled=true,lighting='night',darkness_level='dark' where id=$1",
          [map.id],
        );
        const sees = async () =>
          (
            await db.query<any>(
              'select private.battle43_can_see(a,t,m) sees from public.battle_map_tokens a,public.battle_map_tokens t,public.battle_maps m where a.id=$1 and t.id=$2 and m.id=$3',
              [enemy.id, actor.id, map.id],
            )
          ).rows[0].sees;
        assert.equal(await sees(), false);
        await db.query(
          'update public.npc_stats set stat_block=\'{"senses":{"darkvision":18}}\' where npc_id=$1',
          [npc],
        );
        assert.equal(await sees(), true);
        await db.query("update public.battle_maps set darkness_level='magical' where id=$1", [
          map.id,
        ]);
        assert.equal(await sees(), false);
        await db.query(
          'update public.npc_stats set stat_block=\'{"senses":{"blindsight":18}}\' where npc_id=$1',
          [npc],
        );
        assert.equal(await sees(), true);
        await command({ operation: 'condition', condition: 'Cego' });
        assert.equal(await sees(), true, 'blindsight works while blinded');
        await db.query(
          'update public.npc_stats set stat_block=\'{"senses":{"trueSight":18}}\' where npc_id=$1',
          [npc],
        );
        assert.equal(await sees(), false, 'truesight does not cure blindness');
        await command({ operation: 'remove_condition', condition: 'Cego' });
        assert.equal(await sees(), true);
        await command({ operation: 'condition', condition: 'Invisível' }, actor.id);
        assert.equal(await sees(), true);
        await db.query(
          'update public.npc_stats set stat_block=\'{"senses":{"darkvision":18}}\' where npc_id=$1',
          [npc],
        );
        assert.equal(await sees(), false);
        await db.query(
          "update public.battle_maps set lighting='day',darkness_level='dark',day_darkness_level='none' where id=$1",
          [map.id],
        );
        await command({ operation: 'remove_condition', condition: 'Invisível' }, actor.id);
        assert.equal(await sees(), true);
        await db.query("update public.battle_sessions set status='preparing' where id=$1", [
          map.battle_session_id,
        ]);
        await db.query(
          'insert into public.battle_map_cells(map_id,x,y,blocked) values($1,5,2,true)',
          [map.id],
        );
        assert.equal(await sees(), false);
        await db.query('delete from public.battle_map_cells where map_id=$1', [map.id]);
      },
    );
    await t.test('narrative markers are editable, replayable and GM-only', async () => {
      await reset();
      const request = randomUUID();
      await db.query(
        `insert into public.battle_action_requests(id,campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,target_ids,definition,round,turn_index,status) values($1,$2,$3,$4,$5,$6,$7,'spell','Ilusão Menor','action','{"x":8,"y":4}','{}','{"kind":"utility","shape":"cube","origin":"point","size":1.5,"width":1.5,"duration":"1 minuto","scene":{"rounds":10},"entry":{"catalog_id":"ilusao-menor"}}',1,0,'success')`,
        [request, campaign, map.battle_session_id, map.id, actor.id, player, randomUUID()],
      );
      const options = {
          geometry: { shape: 'cube', size: 3, width: 1.5, origin: 'point', rotation: 0 },
          visual: 'arcane',
          target: { x: 8, y: 4 },
        },
        client = randomUUID();
      const keep = () =>
        as(gm, () =>
          db.query('select public.keep_narrative_spell($1,$2,$3)', [
            request,
            JSON.stringify(options),
            client,
          ]),
        );
      await keep();
      await keep();
      const effects = (
        await db.query<any>('select * from public.battle_spell_effects where request_id=$1', [
          request,
        ])
      ).rows;
      assert.equal(effects.length, 1);
      assert.equal(effects[0].definition.scene.persistent, true);
      assert.equal(effects[0].definition.size, 3);
      await assert.rejects(
        () =>
          as(player, () =>
            db.query('select public.keep_narrative_spell($1,$2,$3)', [
              request,
              JSON.stringify(options),
              randomUUID(),
            ]),
          ),
        /mestre/i,
      );
    });
    await t.test('043 reapplies safely and keeps private helpers private', async () => {
      const { readMigration } = await import('../scripts/migration-sources.mjs');
      await db.exec(readMigration('202610240043_npcs_conditions_and_vision.sql'));
      assert.equal(
        (
          await db.query<any>(
            "select has_function_privilege('authenticated','private.battle43_can_see(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps)','execute') ok",
          )
        ).rows[0].ok,
        false,
      );
    });
  } finally {
    await db.close();
  }
});
