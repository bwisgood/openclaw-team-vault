export type OrderField = '5h' | 'week' | '5h-resets' | 'week-resets' | 'ttl' | 'query';

export type Usage = {
  fiveHourLeft: number | null;
  fiveHourReset: string | null;
  weekLeft: number | null;
  weekReset: string | null;
  raw?: string;
  error?: string;
};

export type ProfileMeta = {
  label?: string;
  file?: string;
  savedAt?: string;
  sourceProfileId?: string;
  accountId?: string;
  status?: string;
  expiresInDays?: number;
  expiresAt?: string;
  expiresAtMs?: number;
  lastKnownUsage?: Usage;
  lastVerifiedAt?: string;
};

export type VaultIndex = {
  activeVaultProfile: string | null;
  profiles: Record<string, ProfileMeta>;
};

export type Flags = {
  refresh: boolean;
  keep: boolean;
  less: boolean;
  order: OrderField;
  days?: number;
};

export type Parsed = {
  positionals: string[];
  flags: Flags;
};

export type Row = {
  name: string;
  data: { usage: Usage | null; refreshedAt: string | null };
  isActive: boolean;
  meta: ProfileMeta;
};
