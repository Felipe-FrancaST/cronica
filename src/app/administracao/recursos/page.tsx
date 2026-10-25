import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import { AdminMapAssets } from '@/features/map-assets/admin-page';
export const dynamic = 'force-dynamic';
export default async function AdminResourcesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    redirect('/entrar');
  const client = await serverSupabase(),
    { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/entrar');
  const admin = await client.rpc('site_is_admin');
  if (admin.error || admin.data !== true) redirect('/escolher-modo');
  return <AdminMapAssets />;
}
