import { Campaign, InstanceState, WorkerStatus } from '../types';

// ---------------------------------------------------------------------------
// CONFIGURATION CRITIQUE
// ---------------------------------------------------------------------------
// 1. Mettre à FALSE pour utiliser le vrai serveur Render
const MOCK_MODE = true; 

// 2. Mettre ici l'URL que Render te donnera (ex: https://mon-api.onrender.com)
// Pour le développement local, garde http://localhost:3000
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';
// ---------------------------------------------------------------------------


// Mock Data Store (Simulates Backend Database)
let mockInstance: InstanceState = {
  status: 'disconnected',
  batteryLevel: 0,
  phoneName: '',
  phoneNumber: '',
  platform: ''
};

export const api = {
  // --- INSTANCE MANAGEMENT ---
  
  async getInstanceStatus(): Promise<InstanceState> {
    if (MOCK_MODE) {
      return new Promise(resolve => setTimeout(() => resolve({ ...mockInstance }), 500));
    }
    try {
        const res = await fetch(`${API_URL}/instance/status`);
        if (!res.ok) throw new Error('Server unreachable');
        return await res.json();
    } catch (error) {
        console.error("API Error:", error);
        // Fallback to disconnected if server is down
        return { status: 'disconnected', batteryLevel: 0, phoneName: '', phoneNumber: '', platform: '' };
    }
  },

  async initSession(): Promise<{ qrCode: string }> {
    if (MOCK_MODE) {
        mockInstance.status = 'pairing';
        return new Promise(resolve => setTimeout(() => resolve({ qrCode: 'MOCK_QR_CODE_BASE64' }), 1000));
    }
    const res = await fetch(`${API_URL}/instance/init`, { method: 'POST' });
    return res.json();
  },

  async logout(): Promise<void> {
    if (MOCK_MODE) {
        mockInstance = { status: 'disconnected', batteryLevel: 0, phoneName: '', phoneNumber: '', platform: '' };
        return;
    }
    await fetch(`${API_URL}/instance/logout`, { method: 'POST' });
  },

  // --- CAMPAIGNS ---

  async createCampaign(campaignData: any): Promise<Campaign> {
    if (MOCK_MODE) {
        return new Promise(resolve => setTimeout(() => resolve({
            id: 'cmp_' + Date.now(),
            name: campaignData.name,
            status: 'running',
            totalContacts: campaignData.contacts.length,
            sentCount: 0,
            failedCount: 0,
            replyCount: 0,
            createdAt: new Date().toISOString()
        }), 800));
    }
    const res = await fetch(`${API_URL}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData)
    });
    return res.json();
  },

  async getCampaignStats(campaignId: string): Promise<Campaign> {
     if (MOCK_MODE) {
         return {
             id: campaignId,
             name: 'Mock Campaign',
             status: 'running',
             totalContacts: 100,
             sentCount: Math.floor(Math.random() * 50),
             failedCount: 0,
             replyCount: 0,
             createdAt: new Date().toISOString()
         } as Campaign;
     }
     const res = await fetch(`${API_URL}/campaigns/${campaignId}`);
     return res.json();
  },

  // --- WORKER ---
  
  async getWorkerLogs(): Promise<any[]> {
      if (MOCK_MODE) return [];
      // In real backend, you'd expose a GET /logs endpoint
      return []; 
  },

  // Helper for demo simulation (To be removed in production)
  _simulateConnectionSuccess() {
      if (MOCK_MODE) {
          mockInstance = {
              status: 'connected',
              batteryLevel: 98,
              phoneName: "Real WhatsApp Device",
              phoneNumber: "+212 661 99 99 99",
              platform: "iOS"
          };
      }
  }
};