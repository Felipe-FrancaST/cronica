export type MapAssetKind = 'symbol' | 'token' | 'background';
export type MapAssetScope = 'personal' | 'system';
export interface MapAsset {
  id: string;
  scope: MapAssetScope;
  owner_id: string | null;
  created_by: string | null;
  kind: MapAssetKind;
  name: string;
  tags: string[];
  image_path: string;
  thumbnail_path: string;
  ready: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export const ASSET_LABELS: Record<MapAssetKind, string> = {
  symbol: 'Símbolos',
  token: 'Tokens',
  background: 'Fundos para grids',
};
