import { Campaign, InstanceState, WorkerStatus } from '../types';

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const MOCK_MODE = false; 
const API_URL = 'http://localhost:3000'; // Or your Render URL
// ---------------------------------------------------------------------------

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
    const res = await fetch(`${API_URL}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData)
    });
    return res.json();
  },

  async getCampaignStats(campaignId: string): Promise<Campaign> {
     // Not used currently, we use getCurrentCampaignStatus
     const res = await fetch(`${API_URL}/campaigns/${campaignId}`);
     return res.json();
  },

  // NEW: Poll real status
  async getCurrentCampaignStatus(): Promise<any> {
      const res = await fetch(`${API_URL}/campaigns/current`);
      return res.json();
  },

  async toggleCampaign(): Promise<any> {
      const res = await fetch(`${API_URL}/campaigns/toggle`, { method: 'POST' });
      return res.json();
  }
};