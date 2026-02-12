export interface InstanceState {
  status: 'connected' | 'disconnected' | 'pairing' | 'banned';
  qrCode?: string; // Base64 string
  batteryLevel: number;
  phoneName: string;
  phoneNumber: string;
  platform: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
  contacts?: any[]; // Array of CSV rows
  mapping?: { [key: string]: string }; // Map CSV headers to variables
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  replyCount: number;
  createdAt: string;
}

export interface WorkerLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'typing';
  message: string;
}

export interface WorkerStatus {
  state: 'idle' | 'fetching' | 'checking_presence' | 'typing' | 'waiting' | 'sending' | 'cooldown' | 'stopped';
  currentContact?: string;
  nextActionIn?: number; // seconds
}

export enum Tab {
  DASHBOARD = 'DASHBOARD',
  CAMPAIGN = 'CAMPAIGN',
  INSTANCE = 'INSTANCE',
  SETTINGS = 'SETTINGS',
}