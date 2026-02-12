import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, OctagonX, Activity, Send, MessageSquare, AlertTriangle, 
  Smartphone, Coffee, UserCheck, Terminal, PlusCircle 
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

export const Dashboard: React.FC<DashboardProps> = ({ activeCampaign, onCampaignUpdate, instanceStatus }) => {
  const [workerState, setWorkerState] = useState<WorkerStatus>({
    state: 'idle',
    currentContact: undefined,
    nextActionIn: 0
  });

  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [chartData, setChartData] = useState(MOCK_CHART_DATA);

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

        switch (prev.state) {
          case 'idle':
          case 'waiting':
            nextState = 'fetching';
            nextDelay = 1;
            break;
          case 'fetching':
            nextState = 'checking_presence';
            nextDelay = 1;
            // logMsg = { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Fetching next contact from BullMQ...' };
            break;
          case 'checking_presence':
            nextState = 'typing';
            nextDelay = 4;
            // logMsg = { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Presence Check: WhatsApp account exists.' };
            break;
          case 'typing':
            nextState = 'sending';
            nextDelay = 1;
            logMsg = { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'typing', message: `Simulating human typing for +2126...${Math.floor(Math.random()*9000)+1000}` };
            break;
          case 'sending':
            nextState = 'waiting';
            nextDelay = Math.floor(Math.random() * 5) + 5; // Faster for demo purposes
            updateCampaign = true;
            logMsg = { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'success', message: 'Message dispatched successfully.' };
            break;
        }

        if (updateCampaign && activeCampaign) {
            onCampaignUpdate({
                ...activeCampaign,
                sentCount: activeCampaign.sentCount + 1
            });
            // Update chart data roughly
            setChartData(curr => {
                const newData = [...curr];
                const last = newData[newData.length -1];
                last.sent += 1;
                return newData;
            });
        }

        if (logMsg) setLogs(prevLogs => [logMsg!, ...prevLogs].slice(0, 50));
        
        return {
          ...prev,
          state: nextState,
          nextActionIn: nextDelay
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

  const getStatusBadge = () => {
    const styles = {
      idle: 'bg-slate-100 text-slate-600',
      fetching: 'bg-blue-100 text-blue-600',
      checking_presence: 'bg-purple-100 text-purple-600',
      typing: 'bg-amber-100 text-amber-600 animate-pulse',
      waiting: 'bg-slate-100 text-slate-500',
      sending: 'bg-green-100 text-green-600',
      cooldown: 'bg-orange-100 text-orange-600',
      stopped: 'bg-red-100 text-red-600',
    };
    return styles[workerState.state] || styles.idle;
  };

  const getStatusLabel = () => {
    const labels = {
      idle: 'Idle',
      fetching: 'Queue Fetch',
      checking_presence: 'Checking',
      typing: 'Typing...',
      waiting: `Wait (${workerState.nextActionIn}s)`,
      sending: 'Sending',
      cooldown: 'Break',
      stopped: 'STOPPED',
    };
    return labels[workerState.state] || 'Unknown';
  };

  if (!activeCampaign) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
              <div className="bg-slate-100 p-6 rounded-full">
                  <Send size={48} className="text-slate-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">No Active Campaign</h2>
              <p className="text-slate-500 max-w-md">You haven't launched any campaign yet. Go to the Campaign Builder to upload your list and start sending.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaign Monitor</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-block w-2 h-2 rounded-full ${activeCampaign.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
            <span className="text-slate-500 text-sm font-medium">{activeCampaign.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleCampaign}
            disabled={instanceStatus !== 'connected' && activeCampaign.status !== 'running'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeCampaign.status === 'running' 
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {activeCampaign.status === 'running' ? <Pause size={18} /> : <Play size={18} />}
            {activeCampaign.status === 'running' ? 'Pause' : 'Resume'}
          </button>
          
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200">
            <OctagonX size={18} />
            STOP
          </button>
        </div>
      </div>

        {instanceStatus !== 'connected' && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <AlertTriangle size={20} />
                <span className="font-medium">Instance Disconnected. The campaign worker cannot dispatch messages. Please reconnect in the Instance tab.</span>
            </div>
        )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Messages Sent" value={activeCampaign.sentCount.toLocaleString()} icon={Send} color="blue" subValue={`${Math.round((activeCampaign.sentCount / activeCampaign.totalContacts) * 100)}% Complete`} />
        <StatCard title="Failed / Invalid" value={activeCampaign.failedCount} icon={AlertTriangle} color="red" subValue="Wait list or Invalid" />
        <StatCard title="Replies Received" value={activeCampaign.replyCount} icon={MessageSquare} color="green" subValue="Human intervention needed" />
        <StatCard title="Coffee Breaks" value="0" icon={Coffee} color="yellow" subValue="Next in 50 msgs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Throughput (Messages/Hr)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Worker Live Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-0 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal size={18} className="text-slate-500" />
              Worker Node
            </h3>
            <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${getStatusBadge()}`}>
              {getStatusLabel()}
            </div>
          </div>
          
          {/* Current Action Visualizer */}
          <div className="p-6 flex flex-col items-center justify-center border-b border-slate-100 bg-white min-h-[120px]">
             {workerState.state === 'typing' && (
                <div className="flex gap-1 mb-2">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                </div>
             )}
             {workerState.state === 'waiting' && (
                <div className="text-2xl font-mono font-bold text-slate-700">{workerState.nextActionIn}s</div>
             )}
             {workerState.state === 'idle' && (
                 <div className="text-slate-300">No active job</div>
             )}
             <p className="text-sm text-slate-500 mt-2 text-center">
               {workerState.state === 'idle' ? 'Worker is ready for jobs' : `Processing: ${workerState.currentContact}`}
             </p>
          </div>

          {/* Scrolling Logs */}
          <div className="flex-1 overflow-y-auto max-h-[300px] p-4 bg-slate-900 font-mono text-xs">
            {logs.length === 0 ? <span className="text-slate-600">// System ready. Logs will appear here.</span> : logs.map((log) => (
              <div key={log.id} className="mb-2 last:mb-0">
                <span className="text-slate-500 mr-2">[{log.timestamp}]</span>
                <span className={
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-emerald-400' :
                  log.type === 'typing' ? 'text-amber-400' :
                  log.type === 'warning' ? 'text-orange-400' :
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