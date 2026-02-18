import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, Activity, Send, AlertTriangle, 
  Smartphone, Terminal, CheckCircle2, ShieldCheck, Flame, 
  PauseCircle, Database, Layers, Square, Hourglass, WifiOff, HelpCircle, Loader2, Zap, RotateCcw, Ghost
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { WorkerLog, Campaign } from '../types';
import { api } from '../services/api';

interface DashboardProps {
    activeCampaign: Campaign | null;
    onCampaignUpdate: (campaign: Campaign) => void;
    instanceStatus: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ activeCampaign, onCampaignUpdate, instanceStatus }) => {
  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [workerStatus, setWorkerStatus] = useState<'idle'|'running'|'paused'>('idle');
  const [dailyStats, setDailyStats] = useState({ sent: 0, cap: 200 }); 
  const [stopping, setStopping] = useState(false);
  const [isForcing, setIsForcing] = useState(false);
  
  // Modal State
  const [showStopModal, setShowStopModal] = useState(false);

  // Poll for REAL updates from Backend
  useEffect(() => {
    const intervalTime = instanceStatus === 'connected' ? 3000 : 8000;
    
    const interval = setInterval(async () => {
        try {
            const data = await api.getCurrentCampaignStatus();
            
            // Always update global daily stats if available
            if (data.dailyCap) {
                setDailyStats({ sent: data.dailySent || 0, cap: data.dailyCap });
            }

            if (data && data.active) {
                onCampaignUpdate(data.campaign);
                if (data.logs) setLogs(data.logs);
                setWorkerStatus(data.workerStatus);
            } else if (activeCampaign && !data.active) {
                window.location.reload(); 
            }
        } catch (e) {
            console.error("Failed to fetch campaign status");
        }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [instanceStatus, onCampaignUpdate, activeCampaign]);

  const toggleCampaign = async () => {
    await api.toggleCampaign();
  };

  const handleForceRecalc = async () => {
    setIsForcing(true);
    try {
        await api.forceContinue();
        setTimeout(() => setIsForcing(false), 1000);
    } catch (e) {
        setIsForcing(false);
    }
  };

  const handleStopClick = () => {
      setShowStopModal(true);
  };

  const confirmStop = async () => {
      setStopping(true);
      setShowStopModal(false);
      try {
        await api.stopCampaign();
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        alert("Erreur lors de l'arrêt.");
        setStopping(false);
      }
  };

  if (!activeCampaign) {
      return (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-8 animate-in fade-in duration-700">
              <div className="relative">
                  <div className="absolute inset-0 bg-orange-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                  <div className="w-24 h-24 bg-slate-900 rounded-2xl flex items-center justify-center relative z-10 shadow-xl border border-slate-700">
                      <Flame size={48} className="text-orange-500" />
                  </div>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-slate-900">V9 HIGH VELOCITY</h2>
                <p className="text-slate-500 max-w-md mt-4 text-lg">Mode "Burst" Activé. Envoi par salves rapides avec refroidissement forcé.</p>
                <div className="mt-8 grid grid-cols-2 gap-4 max-w-sm mx-auto">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                        <span className="text-sm text-slate-400 uppercase font-bold">Today</span>
                        <span className="text-2xl font-mono font-bold text-slate-700">{dailyStats.sent}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center border-orange-200 bg-orange-50">
                        <span className="text-sm text-orange-700 uppercase font-bold">Velocity Cap</span>
                        <span className="text-2xl font-mono font-bold text-orange-900">{dailyStats.cap}</span>
                    </div>
                </div>
              </div>
          </div>
      );
  }

  // Visual Calcs
  const total = activeCampaign.totalContacts || 1;
  const processed = (activeCampaign.sentCount || 0) + (activeCampaign.failedCount || 0);
  const pending = activeCampaign.pendingCount || (total - processed);
  
  const currentSent = dailyStats.sent || 0;
  const currentCap = dailyStats.cap || 200;
  
  const isDailyLimitReached = currentSent >= currentCap;
  const isStandby = isDailyLimitReached && workerStatus === 'running';
  const isWaitingForConnection = workerStatus === 'running' && instanceStatus !== 'connected';
  
  const gaugeColor = '#f97316'; // Orange
  const gaugeData = [
      { name: 'Sent', value: currentSent, color: gaugeColor },
      { name: 'Remaining', value: Math.max(0, currentCap - currentSent), color: '#1e293b' }
  ];

  return (
    <div className="space-y-6 pb-20 relative">
      
      {/* 1. TOP HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
        {workerStatus === 'running' && !isStandby && !isWaitingForConnection && (
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-shimmer"></div>
        )}

        <div className="flex items-center gap-6 z-10">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner ${
                isStandby ? 'bg-amber-50 text-amber-500' :
                isWaitingForConnection ? 'bg-red-50 text-red-500' :
                workerStatus === 'running' ? 'bg-orange-50 text-orange-600' : 
                'bg-slate-100 text-slate-400'
            }`}>
                {isStandby ? (
                    <Hourglass size={32} className="animate-pulse" />
                ) : isWaitingForConnection ? (
                    <WifiOff size={32} className="animate-pulse" />
                ) : (
                    <Zap size={32} className={workerStatus === 'running' ? 'animate-pulse' : ''} />
                )}
            </div>
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{activeCampaign.name}</h1>
                    <span className="bg-orange-100 text-orange-800 text-[10px] px-2 py-0.5 rounded border border-orange-200 font-mono">V9-BURST</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                        isStandby ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        isWaitingForConnection ? 'bg-red-100 text-red-700 border-red-200' :
                        workerStatus === 'running' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                        workerStatus === 'paused' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                        <div className={`w-2 h-2 rounded-full ${
                            isStandby ? 'bg-amber-500 animate-pulse' :
                            isWaitingForConnection ? 'bg-red-500 animate-pulse' :
                            workerStatus === 'running' ? 'bg-orange-500 animate-pulse' : 'bg-slate-400'
                        }`}></div>
                        {isStandby ? 'DAILY CAP REACHED' : isWaitingForConnection ? 'WAITING NETWORK' : workerStatus === 'running' ? 'HIGH VELOCITY' : workerStatus}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Flame size={12} className="text-orange-600" /> Aggressive Mode
                    </span>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-2 z-10">
            {isStandby ? (
                 <div className="flex flex-col items-center">
                    <button 
                        onClick={handleForceRecalc}
                        disabled={instanceStatus !== 'connected' || isForcing}
                        className="flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-lg bg-amber-100 text-amber-800 border-2 border-amber-200 hover:bg-amber-200 hover:border-amber-300 transition-all shadow-xl hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                    >
                        {isForcing ? <Loader2 className="animate-spin" size={24} /> : <RotateCcw size={24} />}
                        {isForcing ? 'IGNITING...' : 'FORCE IGNITE'}
                    </button>
                    <span className="text-[10px] text-amber-700 mt-1 uppercase font-semibold">
                        Limite ({dailyStats.cap}). Forcer risque un ban.
                    </span>
                 </div>
            ) : isWaitingForConnection ? (
                 <div className="px-6 py-4 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold text-sm flex items-center gap-2">
                     <WifiOff size={20} />
                     En attente de connexion...
                 </div>
            ) : (
                <div className="flex flex-col items-center">
                    <button 
                        onClick={toggleCampaign}
                        disabled={instanceStatus !== 'connected'}
                        className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 active:scale-95 ${
                        workerStatus === 'running'
                            ? 'bg-white text-orange-600 border-2 border-orange-200 hover:border-orange-300' 
                            : 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {workerStatus === 'running' ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                        {workerStatus === 'running' ? 'PAUSE' : 'ENGAGE V9'}
                    </button>
                </div>
            )}
            
            <div className="flex flex-col items-center">
                <button 
                    onClick={handleStopClick}
                    disabled={stopping}
                    className="bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 p-4 rounded-xl transition-colors disabled:opacity-50"
                >
                    {stopping ? <Loader2 className="animate-spin" size={24}/> : <Square size={24} fill="currentColor" />}
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Flame size={16} className="text-orange-600" />
                    Burst Performance
                </h3>
                <div className="flex items-center justify-center relative h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={gaugeData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                startAngle={180}
                                endAngle={0}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {gaugeData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 text-center">
                        <div className="text-3xl font-black text-slate-800">{currentSent}</div>
                        <div className="text-xs text-slate-400 font-medium">sur {currentCap}</div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10"><Database size={120} /></div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Pipeline</h3>
                
                <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><Layers size={18} /></div>
                            <div>
                                <div className="text-xs text-slate-400">En attente</div>
                                <div className="font-bold text-lg">{pending}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><CheckCircle2 size={18} /></div>
                            <div>
                                <div className="text-xs text-slate-400">Succès (24h)</div>
                                <div className="font-bold text-lg">{activeCampaign.sentCount}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-black rounded-2xl border border-slate-800 shadow-2xl p-0 overflow-hidden flex flex-col h-[400px] font-mono relative">
                <div className="bg-slate-900/80 p-3 border-b border-slate-800 flex justify-between items-center backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-orange-500" />
                        <span className="text-xs text-slate-300 font-bold">V9_VELOCITY_ENGINE</span>
                    </div>
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                    </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-2 scrollbar-hide bg-black/90">
                    {logs.length === 0 && (
                        <div className="text-slate-600 text-xs italic opacity-50 text-center mt-20">System ready. Waiting for engage command...</div>
                    )}
                    {logs.map((log) => (
                        <div key={log.id} className="flex gap-3 text-xs animate-in fade-in slide-in-from-left-2 duration-300">
                            <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                            <span className={`break-all font-medium ${
                                log.type === 'error' ? 'text-red-500' :
                                log.type === 'success' ? 'text-emerald-400' :
                                log.type === 'warning' ? 'text-amber-400' :
                                'text-blue-400'
                            }`}>
                                {log.type === 'success' && '➜ '}
                                {log.message}
                            </span>
                        </div>
                    ))}
                    
                    {workerStatus === 'running' && !isStandby && !isWaitingForConnection && (
                         <div className="text-orange-500 text-xs animate-pulse mt-2">_ burst mode active. cooling systems monitoring...</div>
                    )}
                </div>

                <div className="bg-slate-900 border-t border-slate-800 p-2 text-[10px] text-slate-500 flex justify-between">
                    <span>MODE: AGGRESSIVE</span>
                    <span>BURST LOGIC</span>
                    <span>FAST TYPING</span>
                </div>
            </div>
        </div>
      </div>

      {showStopModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                  <div className="p-6">
                      <h3 className="text-xl font-bold text-center text-slate-900 mb-2">Arrêt d'Urgence</h3>
                      <p className="text-center text-slate-500 text-sm">Arrêter définitivement ?</p>
                  </div>
                  <div className="flex border-t border-slate-100">
                      <button onClick={() => setShowStopModal(false)} className="flex-1 py-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
                      <button onClick={confirmStop} className="flex-1 py-4 text-sm font-bold text-red-600 hover:bg-red-50">Confirmer</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};