import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, OctagonX, Activity, Send, MessageSquare, AlertTriangle, 
  Smartphone, Coffee, UserCheck, Terminal, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { StatCard } from '../components/StatCard';
import { WorkerLog, WorkerStatus, Campaign } from '../types';

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

interface TransmissionLog {
    id: string;
    phone: string;
    status: 'sent' | 'failed' | 'pending';
    time: string;
    info?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ activeCampaign, onCampaignUpdate, instanceStatus }) => {
  const [workerState, setWorkerState] = useState<WorkerStatus>({
    state: 'idle',
    currentContact: undefined,
    nextActionIn: 0
  });

  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [chartData, setChartData] = useState(MOCK_CHART_DATA);
  const [transmissionLogs, setTransmissionLogs] = useState<TransmissionLog[]>([]);

  // Simulate worker activity visually if campaign is running and instance connected
  useEffect(() => {
    if (!activeCampaign || activeCampaign.status !== 'running' || instanceStatus !== 'connected') {
        setWorkerState({ state: 'idle' });
        return;
    }

    const interval = setInterval(() => {
      setWorkerState(prev => {
        if (prev.nextActionIn && prev.nextActionIn > 0) {
          return { ...prev, nextActionIn: prev.nextActionIn - 1 };
        }
        
        // State machine simulation
        let nextState = prev.state;
        let nextDelay = 0;
        let logMsg: WorkerLog | null = null;
        let updateCampaign = false;
        let newTransmission: TransmissionLog | null = null;
        let nextContactPhone = prev.currentContact;

        switch (prev.state) {
          case 'idle':
          case 'waiting':
            nextState = 'fetching';
            nextDelay = 1;
            break;
            
          case 'fetching':
            // LOGIC TO FETCH REAL NEXT CONTACT
            const totalProcessed = (activeCampaign.sentCount || 0) + (activeCampaign.failedCount || 0);
            
            // If we have contacts and haven't finished the list
            if (activeCampaign.contacts && totalProcessed < activeCampaign.contacts.length) {
                const contactRow = activeCampaign.contacts[totalProcessed];
                
                // Find phone using mapping or fallback
                let foundPhone = 'Unknown';
                if (activeCampaign.mapping) {
                    const phoneKey = Object.keys(activeCampaign.mapping).find(key => activeCampaign.mapping![key] === 'phone');
                    if (phoneKey && contactRow[phoneKey]) foundPhone = contactRow[phoneKey];
                } 
                
                // Fallback if mapping failed or not present
                if (foundPhone === 'Unknown') {
                    const keys = Object.keys(contactRow);
                    const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('tele')) || keys[0];
                    foundPhone = contactRow[phoneKey];
                }

                nextContactPhone = foundPhone;
                nextState = 'checking_presence';
                nextDelay = 1;
            } else if (activeCampaign.contacts && totalProcessed >= activeCampaign.contacts.length) {
                // Campaign Finished
                nextState = 'idle';
                logMsg = { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Campaign Completed. All contacts processed.' };
                // We should ideally update campaign status to 'completed' here, but let's just idle for now to avoid loop
            } else {
                 // Fallback Mock if no contacts (should not happen if flow is correct)
                 nextContactPhone = `+212 6${Math.floor(Math.random()*80)+10} ... (Mock)`;
                 nextState = 'checking_presence';
                 nextDelay = 1;
            }
            break;

          case 'checking_presence':
            nextState = 'typing';
            nextDelay = 2; // Short presence check
            break;

          case 'typing':
            nextState = 'sending';
            nextDelay = 1;
            logMsg = { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'typing', message: `Typing for ${prev.currentContact}...` };
            break;

          case 'sending':
            nextState = 'waiting';
            nextDelay = Math.floor(Math.random() * 5) + 5; // Faster for demo purposes
            updateCampaign = true;
            const isSuccess = Math.random() > 0.05; // 95% success rate mock
            logMsg = { 
                id: Date.now().toString(), 
                timestamp: new Date().toLocaleTimeString(), 
                type: isSuccess ? 'success' : 'error', 
                message: isSuccess ? 'Message dispatched.' : 'Failed to send.' 
            };
            
            newTransmission = {
                id: Date.now().toString(),
                phone: prev.currentContact || 'Unknown',
                status: isSuccess ? 'sent' : 'failed',
                time: new Date().toLocaleTimeString(),
                info: isSuccess ? 'Delivered' : 'Invalid Number'
            };
            break;
        }

        if (updateCampaign && activeCampaign) {
            onCampaignUpdate({
                ...activeCampaign,
                sentCount: (activeCampaign.sentCount || 0) + (logMsg?.type === 'success' ? 1 : 0),
                failedCount: (activeCampaign.failedCount || 0) + (logMsg?.type === 'error' ? 1 : 0)
            });
            
            // Update chart data roughly (FIXED: immutably update the object)
            setChartData(curr => {
                const newData = [...curr];
                if (newData.length > 0) {
                    const lastIndex = newData.length - 1;
                    const lastItem = { ...newData[lastIndex] };
                    if (logMsg?.type === 'success') {
                        lastItem.sent += 1;
                    } else {
                        lastItem.failed += 1;
                    }
                    newData[lastIndex] = lastItem;
                }
                return newData;
            });
        }

        if (logMsg) setLogs(prevLogs => [logMsg!, ...prevLogs].slice(0, 50));
        if (newTransmission) setTransmissionLogs(prev => [newTransmission!, ...prev].slice(0, 20));
        
        return {
          ...prev,
          state: nextState,
          nextActionIn: nextDelay,
          currentContact: nextContactPhone
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCampaign, instanceStatus]);

  const toggleCampaign = () => {
    if (!activeCampaign) return;
    onCampaignUpdate({
      ...activeCampaign,
      status: activeCampaign.status === 'running' ? 'paused' : 'running'
    });
    setLogs(prev => [{
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'warning',
      message: activeCampaign.status === 'running' ? 'Campaign Paused by User' : 'Campaign Resumed'
    }, ...prev]);
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
          
          <button className="p-3 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition-colors" title="Emergency Stop">
            <OctagonX size={20} />
          </button>
        </div>
      </div>

        {instanceStatus !== 'connected' && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-pulse">
                <AlertTriangle size={20} />
                <span className="font-bold">CRITICAL: Instance Disconnected.</span>
                <span className="text-sm">The campaign worker is halted. Please reconnect in the Instance tab immediately.</span>
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
            title="Replies Received" 
            value={activeCampaign.replyCount || 0} 
            icon={MessageSquare} 
            color="green" 
            subValue="Human intervention needed" 
        />
        <StatCard 
            title="Target List" 
            value={activeCampaign.totalContacts || 0} 
            icon={Clock} 
            color="slate" 
            subValue={`${activeCampaign.totalContacts - processed} remaining`} 
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
              WORKER_NODE_01
            </h3>
            <div className="flex items-center gap-2">
                 <span className={`w-2 h-2 rounded-full ${workerState.state === 'idle' ? 'bg-slate-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                 <span className="text-xs font-bold text-slate-400">{workerState.state === 'idle' ? 'IDLE' : 'BUSY'}</span>
            </div>
          </div>
          
          {/* Current Action Visualizer */}
          <div className="p-6 flex flex-col items-center justify-center border-b border-slate-800 bg-slate-900 min-h-[140px]">
             {workerState.state === 'typing' && (
                <div className="flex flex-col items-center animate-in fade-in">
                    <Smartphone size={32} className="text-amber-400 mb-2" />
                    <div className="flex gap-1 mb-2">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce delay-75"></span>
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce delay-150"></span>
                    </div>
                    <p className="text-xs text-amber-400 font-mono">SIMULATING_TYPING</p>
                </div>
             )}
             {workerState.state === 'waiting' && (
                <div className="flex flex-col items-center">
                    <Coffee size={32} className="text-blue-400 mb-2" />
                    <div className="text-3xl font-mono font-bold text-white mb-1">{workerState.nextActionIn}s</div>
                    <p className="text-xs text-blue-400 font-mono">ANTI_BAN_DELAY</p>
                </div>
             )}
             {workerState.state === 'sending' && (
                 <div className="flex flex-col items-center animate-pulse">
                     <Send size={32} className="text-emerald-400 mb-2" />
                     <p className="text-xs text-emerald-400 font-mono">DISPATCHING...</p>
                 </div>
             )}
             {workerState.state === 'idle' && (
                 <div className="text-slate-600 font-mono text-xs">WAITING FOR TASKS...</div>
             )}
             
             {workerState.currentContact && (
                 <div className="mt-4 bg-slate-800 px-3 py-1 rounded text-xs font-mono text-slate-300">
                     Target: {workerState.currentContact}
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

      {/* Live Transmission Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Activity size={18} className="text-blue-600" />
                  Live Transmission Log
              </h3>
              <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">
                  Showing last 20 events
              </span>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                          <th className="px-6 py-3">Timestamp</th>
                          <th className="px-6 py-3">Phone Number</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Details</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {transmissionLogs.length === 0 ? (
                          <tr>
                              <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">
                                  Waiting for worker to start dispatching...
                              </td>
                          </tr>
                      ) : (
                          transmissionLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-3 text-slate-500 font-mono text-xs">{log.time}</td>
                                  <td className="px-6 py-3 font-medium text-slate-700">{log.phone}</td>
                                  <td className="px-6 py-3">
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                          log.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                          log.status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                          'bg-slate-100 text-slate-600'
                                      }`}>
                                          {log.status === 'sent' && <CheckCircle2 size={12} />}
                                          {log.status === 'failed' && <XCircle size={12} />}
                                          {log.status === 'pending' && <Clock size={12} />}
                                          {log.status.toUpperCase()}
                                      </span>
                                  </td>
                                  <td className="px-6 py-3 text-slate-500">{log.info}</td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};