import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (token && (type === 'signup' || type === 'recovery' || type === 'email')) {
    const s = await serverSupabase();
    const { error } = await s.auth.verifyOtp({ token_hash: token, type });
    if (!error)
      return NextResponse.redirect(
        new URL(type === 'recovery' ? '/alterar-senha' : '/escolher-modo', url.origin),
      );
  }
  return NextResponse.redirect(new URL('/entrar?erro=link-expirado', url.origin));
}
