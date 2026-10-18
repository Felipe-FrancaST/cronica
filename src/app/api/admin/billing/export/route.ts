import { apiError, authenticated, json } from '@/features/billing/server';
import { csvCell } from '@/features/billing/model';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const { client } = await authenticated(undefined, true);
    const params = new URL(request.url).searchParams;
    const from = params.get('from') ?? '',
      to = params.get('to') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return json({ error: 'Selecione o período do relatório.' }, 400);
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const { data, error } = await client.rpc('site_admin_read', {
        p_view: 'finance',
        p_options: { from, to, offset, limit: 100 },
      });
      if (error) return json({ error: error.message }, 400);
      if (data.total > 10000)
        return json({ error: 'O relatório excede 10.000 pagamentos. Reduza o período.' }, 400);
      rows.push(...data.rows);
      if (rows.length >= data.total) break;
    }
    const columns = [
      'provider_payment_id',
      'email',
      'status',
      'amount_cents',
      'refunded_cents',
      'fee_cents',
      'net_cents',
      'approved_at',
      'period_end',
    ];
    const labels = [
      'Pagamento',
      'E-mail',
      'Situação',
      'Bruto (centavos)',
      'Reembolso (centavos)',
      'Taxas (centavos)',
      'Líquido informado (centavos)',
      'Aprovação UTC',
      'Acesso até UTC',
    ];
    const csv =
      '\uFEFF' +
      [labels, ...rows.map((row) => columns.map((key) => row[key]))]
        .map((row) => row.map(csvCell).join(';'))
        .join('\r\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pagamentos-${from}-${to}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
