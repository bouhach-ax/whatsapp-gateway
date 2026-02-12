import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { Instance } from './views/Instance';
import { CampaignBuilder } from './views/CampaignBuilder';
import { Tab, Campaign, InstanceState } from './types';
import { Menu } from 'lucide-react';

const SettingsView = () => (
    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-3xl">
        <h2 className="text-xl font-bold mb-6">Anti-Ban Configuration</h2>
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Random Delay Interval (seconds)</label>
                <div className="flex items-center gap-4">
                    <input type="number" className="border rounded px-3 py-2 w-24" defaultValue={40} />
                    <span className="text-slate-400">to</span>
                    <input type="number" className="border rounded px-3 py-2 w-24" defaultValue={120} />
                </div>
                <p className="text-xs text-slate-500 mt-1">Random wait time between messages to simulate human behavior.</p>
            </div>
            <div className="border-t pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Coffee Break (Soft Pause)</label>
                <div className="flex items-center gap-4">
                    <span>Pause for</span>
                    <input type="number" className="border rounded px-3 py-2 w-20" defaultValue={20} />
                    <span>minutes after every</span>
                    <input type="number" className="border rounded px-3 py-2 w-20" defaultValue={50} />
                    <span>messages.</span>
                </div>
            </div>
            <div className="border-t pt-6 flex justify-end">
                <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Save Config</button>
            </div>
        </div>
    </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global State for Instance
  const [instance, setInstance] = useState<InstanceState>({
    status: 'disconnected',
    batteryLevel: 0,
    phoneName: "",
    phoneNumber: "",
    platform: ''
  });

  // Global State for Campaigns
  // Initial state is empty to force user to create one
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  const handleCreateCampaign = (newCampaign: Campaign) => {
    setActiveCampaign(newCampaign);
    setActiveTab(Tab.DASHBOARD);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-30">
           <h1 className="font-bold">Smartdoc Gateway</h1>
           <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
             <Menu />
           </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
            <div className="md:hidden bg-slate-800 text-white p-4 absolute top-14 w-full z-40 shadow-xl">
                <button onClick={() => { setActiveTab(Tab.DASHBOARD); setMobileMenuOpen(false); }} className="block py-3 border-b border-slate-700 w-full text-left">Monitor</button>
                <button onClick={() => { setActiveTab(Tab.CAMPAIGN); setMobileMenuOpen(false); }} className="block py-3 border-b border-slate-700 w-full text-left">Campaigns</button>
                <button onClick={() => { setActiveTab(Tab.INSTANCE); setMobileMenuOpen(false); }} className="block py-3 border-b border-slate-700 w-full text-left">Instance</button>
                <button onClick={() => { setActiveTab(Tab.SETTINGS); setMobileMenuOpen(false); }} className="block py-3 w-full text-left">Settings</button>
            </div>
        )}

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {activeTab === Tab.DASHBOARD && (
            <Dashboard 
              activeCampaign={activeCampaign} 
              onCampaignUpdate={setActiveCampaign}
              instanceStatus={instance.status}
            />
          )}
          {activeTab === Tab.INSTANCE && (
            <Instance 
              instance={instance} 
              setInstance={setInstance} 
            />
          )}
          {activeTab === Tab.CAMPAIGN && (
            <CampaignBuilder 
              onCreateCampaign={handleCreateCampaign} 
            />
          )}
          {activeTab === Tab.SETTINGS && <SettingsView />}
        </main>
      </div>
    </div>
  );
}