import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, OctagonX, Activity, Send, MessageSquare, AlertTriangle, 
  Smartphone, Coffee, Terminal, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { StatCard } from '../components/StatCard';
import { WorkerLog, Campaign } from '../types';
import { api } from '../services/api';

interface DashboardProps {
    activeCampaign: Campaign | null;
    onCampaignUpdate: (campaign: Campaign) => void;
    instanceStatus: string;
}

const MOCK_CHART_DATA = [
  { time: '10:00', sent: 0, failed: 0 },
  { time: '11:00', sent: 0, failed: 0 },
  { time: '12:00', sent: 0, failed: 0 },
  { time: '13:00', sent: 0, failed: 0 },
  { time: '14:00', sent: 0, failed: 0 },
  { time: '15:00', sent: 0, failed: 0 },
];

export const Dashboard: React.FC<DashboardProps> = ({ activeCampaign, onCampaignUpdate, instanceStatus }) => {
  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [chartData, setChartData] = useState(MOCK_CHART_DATA);
  const [workerStatus, setWorkerStatus] = useState<'idle'|'running'|'paused'>('idle');

  // Poll for REAL updates from Backend
  useEffect(() => {
    if (instanceStatus !== 'connected') return;

    const interval = setInterval(async () => {
        try {
            const data = await api.getCurrentCampaignStatus();
            
            if (data && data.active) {
                // Update parent state with real progress
                onCampaignUpdate(data.campaign);
                
                // Update local logs
                if (data.logs) {
                    setLogs(data.logs);
                }
                
                setWorkerStatus(data.workerStatus);

                // Update chart (simplified)
                setChartData(curr => {
                    const newData = [...curr];
                    if (newData.length > 0) {
                        const last = { ...newData[newData.length - 1] };
                        last.sent = data.campaign.sentCount;
                        last.failed = data.campaign.failedCount;
                        newData[newData.length - 1] = last;
                    }
                    return newData;
                });
            }
        } catch (e) {
            console.error("Failed to fetch campaign status", e);
        }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [instanceStatus, onCampaignUpdate]);

  const toggleCampaign = async () => {
    await api.toggleCampaign();
  };

  if (!activeCampaign) {
      return (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-6">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                  <Send size={40} className="text-slate-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Campaign Cockpit Idle</h2>
                <p className="text-slate-500 max-w-md mt-2">No active campaign detected. Go to the Campaign Builder to verify your list and launch your first campaign.</p>
              </div>
          </div>
      );
  }

  // Helper calculation for progress bar
  const total = activeCampaign.totalContacts || 1;
  const processed = (activeCampaign.sentCount || 0) + (activeCampaign.failedCount || 0);
  const progressPercent = Math.min(100, Math.round((processed / total) * 100));

  return (
    <div className="space-y-6 pb-20">
      {/* Header Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${activeCampaign.status === 'running' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                <Activity size={24} className={activeCampaign.status === 'running' ? 'animate-pulse' : ''} />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900">{activeCampaign.name}</h1>
                <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${activeCampaign.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                        Status: {activeCampaign.status}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500 text-xs">ID: {activeCampaign.id}</span>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleCampaign}
            disabled={instanceStatus !== 'connected' && activeCampaign.status !== 'running'}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${
              activeCampaign.status === 'running' 
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {activeCampaign.status === 'running' ? <Pause size={18} /> : <Play size={18} />}
            {activeCampaign.status === 'running' ? 'Pause Campaign' : 'Resume Campaign'}
          </button>
        </div>
      </div>

        {instanceStatus !== 'connected' && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-pulse">
                <AlertTriangle size={20} />
                <span className="font-bold">CRITICAL: Instance Disconnected.</span>
                <span className="text-sm">The campaign worker is paused. Reconnect to resume.</span>
            </div>
        )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
            title="Messages Sent" 
            value={(activeCampaign.sentCount || 0).toLocaleString()} 
            icon={Send} 
            color="blue" 
            subValue={`${progressPercent}% Complete`} 
        />
        <StatCard 
            title="Failed / Invalid" 
            value={activeCampaign.failedCount || 0} 
            icon={AlertTriangle} 
            color="red" 
            subValue="Non-WhatsApp Numbers" 
        />
        <StatCard 
            title="Queue Status" 
            value={workerStatus === 'running' ? 'Processing' : 'Paused'} 
            icon={Activity} 
            color={workerStatus === 'running' ? 'green' : 'yellow'} 
            subValue="Real-time worker" 
        />
        <StatCard 
            title="Target List" 
            value={activeCampaign.totalContacts || 0} 
            icon={Clock} 
            color="slate" 
            subValue={`${Math.max(0, (activeCampaign.totalContacts || 0) - processed)} remaining`} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Throughput (Messages/Hr)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Worker Live Status */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-lg p-0 overflow-hidden flex flex-col text-white">
          <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
            <h3 className="font-mono text-sm text-emerald-400 flex items-center gap-2">
              <Terminal size={16} />
              SERVER_LOGS
            </h3>
            <div className="flex items-center gap-2">
                 <span className={`w-2 h-2 rounded-full ${workerStatus === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                 <span className="text-xs font-bold text-slate-400">{workerStatus.toUpperCase()}</span>
            </div>
          </div>
          
          {/* Current Action Visualizer - Simplified for Real Mode */}
          <div className="p-6 flex flex-col items-center justify-center border-b border-slate-800 bg-slate-900 min-h-[100px]">
             {workerStatus === 'running' ? (
                <div className="flex flex-col items-center">
                    <Smartphone size={32} className="text-emerald-400 mb-2 animate-pulse" />
                    <p className="text-xs text-emerald-400 font-mono">PROCESSING QUEUE...</p>
                </div>
             ) : (
                <div className="flex flex-col items-center">
                    <Coffee size={32} className="text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 font-mono">WORKER IDLE</p>
                </div>
             )}
          </div>

          {/* Scrolling Logs */}
          <div className="flex-1 overflow-y-auto h-[200px] p-4 font-mono text-[10px] space-y-1 scrollbar-hide">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2 opacity-80 hover:opacity-100 transition-opacity">
                <span className="text-slate-500">[{log.timestamp}]</span>
                <span className={
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-emerald-400' :
                  log.type === 'typing' ? 'text-amber-400' :
                  'text-blue-300'
                }>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};