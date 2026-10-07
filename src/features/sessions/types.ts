export type SessionStatus = 'planned' | 'active' | 'ended';
export interface CampaignSession {
  id: string;
  campaign_id: string;
  name: string;
  number: number;
  status: SessionStatus;
  summary: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
}
export interface SessionEvent {
  id: string;
  campaign_id: string;
  adventure_session_id: string;
  kind: string;
  title: string;
  description: string;
  image_path: string | null;
  visibility: 'players' | 'gm';
  data: Record<string, unknown>;
  created_at: string;
}
export interface CampaignRules {
  campaign_id: string;
  party_level: number;
  lock_player_level: boolean;
  players_can_create_characters: boolean;
  players_can_edit_sheets: boolean;
  players_can_end_turn: boolean;
  default_restrict_movement: boolean;
  default_failed_actions_consume: boolean;
  allow_multiclass: boolean;
  hit_point_method: 'average' | 'maximum' | 'rolled';
  attribute_method: 'choice' | 'standard' | 'point-buy' | 'rolled' | 'manual';
  players_can_rest: boolean;
  players_can_create_custom_items: boolean;
  updated_at: string | null;
}
export const defaultRules = (campaignId: string): CampaignRules => ({
  campaign_id: campaignId,
  party_level: 1,
  lock_player_level: false,
  players_can_create_characters: true,
  players_can_edit_sheets: true,
  players_can_end_turn: true,
  default_restrict_movement: true,
  default_failed_actions_consume: true,
  allow_multiclass: true,
  hit_point_method: 'average',
  attribute_method: 'choice',
  players_can_rest: true,
  players_can_create_custom_items: true,
  updated_at: null,
});
export const rulesFor = (
  rules: CampaignRules[] | undefined,
  campaignId: string,
): CampaignRules => ({
  ...defaultRules(campaignId),
  ...rules?.find((rule) => rule.campaign_id === campaignId),
});
export const SESSION_STATUS: Record<SessionStatus, string> = {
  planned: 'Em preparação',
  active: 'Em andamento',
  ended: 'Encerrada',
};
export function defaultSession(items: CampaignSession[], master: boolean) {
  return (
    items.find((s) => s.status === 'active') ??
    (master ? items.find((s) => s.status === 'planned') : undefined) ??
    items.find((s) => s.status === 'ended')
  );
}
