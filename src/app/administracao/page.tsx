import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import { AdminDashboard } from '@/features/billing/admin-dashboard';
export const dynamic = 'force-dynamic';
export default async function AdministrationPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    redirect('/entrar');
  const client = await serverSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/entrar');
  const check = await client.rpc('site_is_admin');
  if (check.error || check.data !== true) redirect('/escolher-modo');
  return <AdminDashboard />;
}
