import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { migrationNames, readMigration } from './migration-sources.mjs';

const db = new PGlite();
const gm = randomUUID(), player = randomUUID(), foreign = randomUUID();
const campaign = randomUUID(), otherCampaign = randomUUID();
const region = randomUUID(), foreignRegion = randomUUID(), city = randomUUID(), location = randomUUID();
const as = async (id, fn) => {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try { return await fn(); }
  finally { await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)"); }
};
const save = (value, expected = null, who = gm) => as(who, async () =>
  (await db.query('select public.save_world_entry_checked($1::jsonb,$2::timestamptz) a', [JSON.stringify(value), expected])).rows[0].a);
const base = (kind,id,name,cid=campaign) => ({ id, kind, campaign_id:cid, name, description:'', type:'', location:'', notes:'', region_id:null, city_id:null, visible_to_players:false });
try {
  await db.exec(`create role authenticated nologin nosuperuser nobypassrls;
    create role anon nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  for (const name of migrationNames()) {
    try { await db.exec(readMigration(name)); }
    catch (error) { throw new Error(`Migração ${name}: ${error.message}`, {cause: error}); }
    if (name.includes('202610180029_subscriptions_and_site_admin')) await db.exec('update public.site_billing_settings set billing_enabled=false where id=1');
  }
  for (const id of [gm, player, foreign]) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@test.local`]);
  for (const [cid,owner] of [[campaign,gm],[otherCampaign,foreign]])
    await db.query("insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Mundo 055')",[cid,owner]);
  await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)',[campaign,player]);
  const firstRegion = await save(base('region',region,'Vale'));
  assert.deepEqual(await save(base('region',region,'Vale')), firstRegion);
  await save(base('region',foreignRegion,'Invasora',otherCampaign),null,foreign);
  const firstCity = await save({...base('city',city,'Porto'),region_id:region});
  assert.deepEqual(await save({...base('city',city,'Porto'),region_id:region}), firstCity);
  const first = await save({...base('location',location,'Taverna'),city_id:city,description:'Visível', secrets:'Privado'});
  assert.ok(first.updated_at);
  assert.deepEqual(await save({...base('location',location,'Taverna'),city_id:city,description:'Visível', secrets:'Privado'}),first);
  let row = (await db.query('select city_id,region_id from public.world_locations where id=$1',[location])).rows[0];
  assert.equal(row.city_id,city); assert.equal(row.region_id,null);
  await assert.rejects(save({...base('location',location,'Taverna'),city_id:city,region_id:region},first.updated_at),/parent_055|check/);
  await assert.rejects(save({...base('location',location,'Taverna'),city_id:city},'2000-01-01T00:00:00Z'),/mudou|removido/);
  await assert.rejects(save({...base('location',location,'Taverna'),city_id:city},first.updated_at,player),/mestre/);
  await assert.rejects(save({...base('location',location,'Taverna'),region_id:foreignRegion},first.updated_at),/foreign key|world_locations_region_id_campaign_id/);
  const moved = await save({...base('location',location,'Taverna'),region_id:region},first.updated_at);
  row = (await db.query('select city_id,region_id from public.world_locations where id=$1',[location])).rows[0];
  assert.equal(row.city_id,null); assert.equal(row.region_id,region);
  await save({...base('location',location,'Taverna'),city_id:city},moved.updated_at);
  await as(gm,() => db.query('delete from public.world_cities where id=$1',[city]));
  row = (await db.query('select city_id,region_id from public.world_locations where id=$1',[location])).rows[0];
  assert.equal(row.city_id,null); assert.equal(row.region_id,null);
  console.log('055: vínculo, exclusividade, versão, RLS, campanha e exclusão da cidade aprovados.');
} finally { await db.close(); }
