import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../../scripts/migration-sources.mjs';
/** Existing gameplay fixtures explicitly run with free access; billing tests use the paid defaults. */
export async function applyGameMigration(db: PGlite, name: string) {
  await db.exec(readMigration(name));
  if (name === '202610180029_subscriptions_and_site_admin.sql')
    await db.exec('update public.site_billing_settings set billing_enabled=false where id=1');
}
export async function billingDatabase() {
  const db = new PGlite();
  await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;create role service_role nologin nosuperuser bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
  for (const name of migrationNames()) await db.exec(readMigration(name));
  return db;
}
