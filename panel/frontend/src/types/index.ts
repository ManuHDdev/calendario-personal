export interface UserOut {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
  roles: string[];
}

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface Presence {
  status: PresenceStatus;
  lastActivity: number | null;
}

export interface UserFormData {
  username: string;
  email: string;
  password: string;
  roles: string[];
  enabled: boolean;
}

export interface ApiUsageEntry {
  api: string;
  label: string;
  callsToday: number | null;
  dailyLimit: number | null;
  remaining: number | null;
  resetsAt: string | null;
  unavailable: boolean;
}
