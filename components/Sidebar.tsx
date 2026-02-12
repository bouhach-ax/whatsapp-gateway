import React from 'react';
import { LayoutDashboard, Send, Settings, Smartphone, MessageCircle, History, Users } from 'lucide-react';
import { Tab } from '../types';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    { id: Tab.DASHBOARD, label: 'Monitor', icon: LayoutDashboard },
    { id: Tab.CAMPAIGN, label: 'New Campaign', icon: Send },
    { id: Tab.LISTS, label: 'Mes Listes', icon: Users },
    { id: Tab.HISTORY, label: 'History', icon: History },
    { id: Tab.INSTANCE, label: 'Instance', icon: Smartphone },
    { id: Tab.SETTINGS, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col z-20 hidden md:flex">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="bg-emerald-500 p-2 rounded-lg">
          <MessageCircle size={20} className="text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight">Smartdoc</h1>
          <p className="text-xs text-slate-400">Gateway v2.2 (DB)</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === item.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">System Status</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-semibold text-emerald-400">Supabase: Linked</span>
          </div>
        </div>
      </div>
    </div>
  );
};