import { Campaign, InstanceState, WorkerLog, WorkerStatus } from '../types';

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const API_URL = 'https://whatsapp-gateway-vigf.onrender.com'; 
// ---------------------------------------------------------------------------

// --- LOCAL SIMULATION STATE (Fallback when Backend is offline) ---
let mockInstance: InstanceState = {
  status: 'connected', 
  batteryLevel: 100,
  phoneName: 'Browser Simulator',
  phoneNumber: 'Simulated Device',
  platform: 'Web'
};

let localCampaign: Campaign | null = null;
let localLogs: WorkerLog[] = [];
let localWorkerStatus: 'idle' | 'running' | 'paused' = 'idle';
let localProcessedIndex = 0;
let workerInterval: any = null;

// Mock Saved Lists for local testing
let mockLists: any[] = [];

// Simulate the worker loop using REAL data
const runLocalWorkerStep = () => {
    if (!localCampaign || localWorkerStatus !== 'running') return;
    
    // Check if finished
    if (localProcessedIndex >= (localCampaign.contacts?.length || 0)) {
        localCampaign.status = 'completed';
        localWorkerStatus = 'idle';
        localLogs.unshift({
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: 'All contacts processed (Offline Mode)'
        });
        if (workerInterval) clearInterval(workerInterval);
        return;
    }

    const contact = localCampaign.contacts![localProcessedIndex];
    
    // Smart phone extraction from YOUR real data
    let phone = "Unknown";
    if (localCampaign.mapping) {
            const phoneKey = Object.keys(localCampaign.mapping).find(key => localCampaign.mapping![key] === 'phone');
            if (phoneKey) phone = contact[phoneKey];
    }
    // Fallback if mapping failed
    if (phone === "Unknown" || !phone) {
            const keys = Object.keys(contact);
            const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('tele')) || keys[0];
            phone = contact[phoneKey] || "Unknown";
    }

    localProcessedIndex++;
    localCampaign.sentCount++;
    
    localLogs.unshift({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'success',
        message: `Simulated send to ${phone}`
    });
    
    // Keep logs trimmed
    if (localLogs.length > 50) localLogs.pop();
};

export const api = {

  // --- INSTANCE MANAGEMENT ---
  
  async getInstanceStatus(): Promise<InstanceState> {
    try {
        const res = await fetch(`${API_URL}/instance/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (error) {
        // Fallback: Return connected state so Dashboard works, but indicate it's mock
        return mockInstance;
    }
  },

  async initSession(): Promise<{ qrCode: string }> {
    try {
        const res = await fetch(`${API_URL}/instance/init`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } catch (e) {
        console.error("Init session failed:", e);
        return { qrCode: 'MOCK_QR_CODE_BASE64' };
    }
  },

  async logout(): Promise<void> {
    try {
        await fetch(`${API_URL}/instance/logout`, { method: 'POST' });
    } catch (e) {
        mockInstance.status = 'disconnected';
    }
  },
  
  // NEW: Hard Reset
  async resetSession(): Promise<void> {
      try {
          const res = await fetch(`${API_URL}/instance/reset`, { method: 'POST' });
          if (!res.ok) throw new Error("Reset failed");
      } catch (e) {
          console.error("Reset local not supported fully");
          mockInstance.status = 'disconnected';
      }
  },

  // --- LISTS MANAGEMENT ---

  async saveContactList(name: string, contacts: any[], mapping: any): Promise<any> {
     try {
         const res = await fetch(`${API_URL}/lists`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ name, contacts, mapping })
         });
         if (!res.ok) throw new Error("Failed to save list");
         return res.json();
     } catch (e) {
         // Local fallback
         const newList = { id: 'list_' + Date.now(), name, total_contacts: contacts.length, created_at: new Date().toISOString(), items: contacts };
         mockLists.push(newList);
         return newList;
     }
  },

  async getContactLists(): Promise<any[]> {
      try {
          const res = await fetch(`${API_URL}/lists`);
          if (!res.ok) throw new Error();
          return res.json();
      } catch (e) {
          return mockLists;
      }
  },

  async deleteContactList(listId: string): Promise<void> {
      try {
          const res = await fetch(`${API_URL}/lists/${listId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
      } catch (e) {
          mockLists = mockLists.filter(l => l.id !== listId);
      }
  },

  async getListItems(listId: string): Promise<any[]> {
      try {
          const res = await fetch(`${API_URL}/lists/${listId}/items`);
          if (!res.ok) throw new Error();
          return res.json();
      } catch (e) {
          const list = mockLists.find(l => l.id === listId);
          // Return raw structure expected by Lists.tsx now: {id, phone, data}
          return list ? list.items.map((c: any, idx: number) => ({ id: `mock_${idx}`, phone: c.phone || '000', data: c })) : [];
      }
  },

  // NEW: Add Single Item
  async addListItem(listId: string, phone: string, data: any): Promise<any> {
      try {
          const res = await fetch(`${API_URL}/lists/${listId}/items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, data })
          });
          if (!res.ok) throw new Error();
          return res.json();
      } catch (e) {
          console.error("Local add not fully supported");
          return { id: 'local_' + Date.now(), phone, data };
      }
  },

  // NEW: Update Item
  async updateListItem(itemId: string, phone: string, data: any): Promise<any> {
      try {
          const res = await fetch(`${API_URL}/lists/items/${itemId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, data })
          });
          if (!res.ok) throw new Error();
          return res.json();
      } catch (e) {
          console.error("Local update not supported");
      }
  },

  // NEW: Delete Item
  async deleteListItem(itemId: string): Promise<void> {
      try {
           const res = await fetch(`${API_URL}/lists/items/${itemId}`, { method: 'DELETE' });
           if (!res.ok) throw new Error();
      } catch (e) {
           console.error("Local delete not supported");
      }
  },

  // --- CAMPAIGNS ---

  async createCampaign(campaignData: any): Promise<Campaign> {
    try {
        const res = await fetch(`${API_URL}/campaigns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(campaignData)
        });
        if (!res.ok) throw new Error(`Backend Error: ${res.statusText}`);
        return res.json();
    } catch (e) {
        console.warn("Backend unreachable. Switching to Local Simulation.", e);
        
        // Initialize Local Campaign with REAL Data
        localCampaign = {
            ...campaignData,
            id: 'local_' + Date.now(),
            status: 'running',
            sentCount: 0,
            failedCount: 0,
            replyCount: 0,
            totalContacts: campaignData.contacts?.length || 0,
            created_at: new Date().toISOString() // Fixed property name
        };
        localProcessedIndex = 0;
        localLogs = [{
            id: 'init', 
            timestamp: new Date().toLocaleTimeString(), 
            type: 'warning', 
            message: `Connection to ${API_URL} failed. Running in Offline Mode.`
        }];
        localWorkerStatus = 'running';
        
        // Start Local Worker
        if (workerInterval) clearInterval(workerInterval);
        workerInterval = setInterval(runLocalWorkerStep, 1500); 

        return localCampaign as Campaign;
    }
  },

  async getCurrentCampaignStatus(): Promise<any> {
      try {
          const res = await fetch(`${API_URL}/campaigns/current`);
          if (!res.ok) throw new Error();
          return res.json();
      } catch (e) {
          // Return local state
          if (!localCampaign) return { active: false };
          return {
              active: true,
              campaign: { ...localCampaign },
              logs: [...localLogs],
              workerStatus: localWorkerStatus,
              progress: localProcessedIndex
          };
      }
  },

  async toggleCampaign(): Promise<any> {
      try {
         const res = await fetch(`${API_URL}/campaigns/toggle`, { method: 'POST' });
         return res.json();
      } catch (e) {
         if (localCampaign) {
             localWorkerStatus = localWorkerStatus === 'running' ? 'paused' : 'running';
             localCampaign.status = localWorkerStatus === 'running' ? 'running' : 'paused';
             localLogs.unshift({
                 id: Date.now().toString(),
                 timestamp: new Date().toLocaleTimeString(),
                 type: 'warning',
                 message: localWorkerStatus === 'running' ? 'Resumed (Offline)' : 'Paused (Offline)'
             });
             return { status: localCampaign.status };
         }
         return {};
      }
  },

  async stopCampaign(): Promise<any> {
      try {
          const res = await fetch(`${API_URL}/campaigns/stop`, { method: 'POST' });
          return res.json();
      } catch (e) {
          if (localCampaign) {
              localWorkerStatus = 'idle';
              localCampaign.status = 'stopped';
              if (workerInterval) clearInterval(workerInterval);
              return { success: true };
          }
          return {};
      }
  },

  // NEW: Test Message
  async sendTestMessage(phone: string, message: string): Promise<any> {
     try {
         const res = await fetch(`${API_URL}/campaigns/test`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ phone, message })
         });
         if (!res.ok) throw new Error("Failed");
         return res.json();
     } catch (e) {
         console.log("Mock sent test message");
         return { success: true };
     }
  },
  
  async getHistory(): Promise<Campaign[]> {
    try {
        const res = await fetch(`${API_URL}/campaigns/history`);
        if (!res.ok) throw new Error();
        return res.json();
    } catch (e) {
        return [];
    }
  },
  
  async deleteCampaign(id: string): Promise<void> {
      try {
          const res = await fetch(`${API_URL}/campaigns/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
      } catch (e) {
          // fallback
      }
  }
};