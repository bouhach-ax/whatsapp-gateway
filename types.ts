
export interface InstanceState {
  status: 'connected' | 'disconnected' | 'pairing' | 'banned';
  qrCode?: string; 
  batteryLevel: number;
  phoneName: string;
  phoneNumber: string;
  platform: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
  contacts?: any[]; 
  mapping?: { [key: string]: string }; 
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  pendingCount?: number; // Added for pipeline visualization
  replyCount: number;
  created_at: string;
  completed_at?: string;
}

export interface WorkerLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'typing';
  message: string;
}

export type WorkerStatus = 'idle' | 'running' | 'paused';

export enum Tab {
  DASHBOARD = 'DASHBOARD',
  CAMPAIGN = 'CAMPAIGN',
  LISTS = 'LISTS',
  INSTANCE = 'INSTANCE',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS',
}