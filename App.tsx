import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { Instance } from './views/Instance';
import { CampaignBuilder } from './views/CampaignBuilder';
import { History } from './views/History';
import { Lists } from './views/Lists';
import { Tab, Campaign, InstanceState } from './types';
import { Menu } from 'lucide-react';

const SettingsView = () => (
    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-3xl">
        <h2 className="text-xl font-bold mb-6">Configuration</h2>
        <p className="text-slate-500">Database Connection: Supabase Active</p>
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
                <button onClick={() => { setActiveTab(Tab.LISTS); setMobileMenuOpen(false); }} className="block py-3 border-b border-slate-700 w-full text-left">Mes Listes</button>
                <button onClick={() => { setActiveTab(Tab.HISTORY); setMobileMenuOpen(false); }} className="block py-3 border-b border-slate-700 w-full text-left">History</button>
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
          {activeTab === Tab.LISTS && <Lists />}
          {activeTab === Tab.HISTORY && <History onNavigate={setActiveTab} />}
          {activeTab === Tab.SETTINGS && <SettingsView />}
        </main>
      </div>
    </div>
  );
}