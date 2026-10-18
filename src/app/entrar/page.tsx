import { AuthForm } from '@/components/auth-form';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string }>;
}) {
  return <AuthForm kind="login" accountDeleted={(await searchParams).conta === 'excluida'} />;
}
