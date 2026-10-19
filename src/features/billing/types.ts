export type BillingScope = 'master' | 'player';
export type BillingPaymentMethod = 'recurring' | 'pix';
export type ContractStatus =
  | 'creating'
  | 'uncertain'
  | 'pending'
  | 'authorized'
  | 'paused'
  | 'cancelled'
  | 'failed'
  | 'completed'
  | 'expired';
export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  amount_cents: number;
  interval_months: number;
  scopes: BillingScope[];
  max_campaigns: number | null;
  max_players_per_campaign: number | null;
  active: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface BillingSettings {
  id: number;
  site_name: string;
  billing_enabled: boolean;
  require_master: boolean;
  require_player: boolean;
  maintenance: boolean;
  maintenance_message: string;
  support_email: string;
  terms_url: string;
  privacy_url: string;
  grace_days: number;
  version: number;
  updated_at: string;
}
export interface BillingContract {
  payment_method?: BillingPaymentMethod;
  payment_expires_at?: string | null;
  id: string;
  user_id: string;
  plan_id: string;
  plan_snapshot: BillingPlan;
  scope: BillingScope;
  status: ContractStatus;
  provider_id: string | null;
  checkout_url: string | null;
  payer_email: string;
  error_code: string | null;
  next_payment_at: string | null;
  provider_updated_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface BillingPayment {
  payment_method?: BillingPaymentMethod;
  provider_payment_id: string;
  invoice_id: string;
  contract_id: string;
  user_id: string;
  status: string;
  amount_cents: number;
  refunded_cents: number;
  fee_cents: number | null;
  net_cents: number | null;
  approved_at: string | null;
  period_start: string | null;
  period_end: string | null;
  provider_updated_at: string;
  created_at: string;
}
export interface BillingEntitlement {
  allowed: boolean;
  reason: 'paid' | 'courtesy' | 'free' | 'required' | 'blocked' | 'maintenance' | 'admin';
  paid_until: string | null;
}
export interface BillingContext {
  is_admin: boolean;
  blocked: boolean;
  settings: BillingSettings;
  plans: BillingPlan[];
  contracts: BillingContract[];
  payments: BillingPayment[];
  access: Record<BillingScope, BillingEntitlement>;
}
export interface BillingWebhook {
  id: string;
  topic: string;
  resource_id: string;
  attempts: number;
}
export interface BillingPix {
  contract_id: string;
  status: ContractStatus;
  expires_at: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
}
