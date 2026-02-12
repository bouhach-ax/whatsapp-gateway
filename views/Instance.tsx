import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, Wifi, WifiOff, Battery, ShieldCheck, LogOut, AlertCircle } from 'lucide-react';
import { InstanceState } from '../types';
import { api } from '../services/api';

interface InstanceProps {
    instance: InstanceState;
    setInstance: React.Dispatch<React.SetStateAction<InstanceState>>;
}

export const Instance: React.FC<InstanceProps> = ({ instance, setInstance }) => {
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Poll for status updates
  useEffect(() => {
    let interval = setInterval(async () => {
        try {
            const status = await api.getInstanceStatus();
            // Only update if status changed to avoid re-renders
            if (status.status !== instance.status || (status.status === 'connected' && instance.batteryLevel !== status.batteryLevel)) {
                setInstance(status);
            }
            // Always update QR if it exists and we are pairing (it might have rotated)
            if (status.status === 'pairing' && status.qrCode) {
                 setQrCode(status.qrCode);
            }
            if (status.status === 'connected') {
                setQrCode(null);
            }
        } catch (e) {
            console.error("Connection lost to backend");
        }
    }, 2000); // Faster poll for QR updates

    return () => clearInterval(interval);
  }, [instance.status, instance.batteryLevel, setInstance]);

  const handleDisconnect = async () => {
    if (confirm("Are you sure you want to disconnect?")) {
      setLoading(true);
      await api.logout();
      setInstance(await api.getInstanceStatus());
      setLoading(false);
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    try {
        // We trigger init, but we rely on the polling (useEffect) to get the actual QR image
        // This prevents race conditions where init returns 'pairing' but QR isn't generated yet
        await api.initSession();
        setInstance(prev => ({ ...prev, status: 'pairing' }));
    } catch (e) {
        alert("Failed to reach backend server");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Smartphone className="text-slate-500" />
            Instance Connection
          </h2>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${
              instance.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
              instance.status === 'pairing' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
            }`}></span>
            <span className="text-sm font-medium uppercase text-slate-600">{instance.status}</span>
          </div>
        </div>

        <div className="p-8">
          {instance.status === 'connected' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
               <div className="flex flex-col items-center justify-center p-8 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <Smartphone size={64} className="text-emerald-600 mb-4" />
                  <h3 className="text-lg font-bold text-emerald-900">Device Paired</h3>
                  <p className="text-emerald-700 text-sm mt-1">Ready to send messages</p>
                  
                  <div className="mt-6 flex items-center gap-6 w-full max-w-xs bg-white p-4 rounded-xl shadow-sm">
                    <div className="flex flex-col items-center">
                      <Battery size={24} className={instance.batteryLevel < 20 ? 'text-red-500' : 'text-slate-700'} />
                      <span className="text-xs font-bold mt-1">{instance.batteryLevel}%</span>
                    </div>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Device</p>
                      <p className="font-semibold text-slate-900">{instance.phoneName || 'Linked Device'}</p>
                      <p className="text-xs text-slate-500">{instance.platform || 'WhatsApp Web'} • Baileys MD</p>
                    </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h4 className="flex items-center gap-2 font-semibold text-blue-800 mb-2">
                      <ShieldCheck size={18} />
                      Session Persistence Active
                    </h4>
                    <p className="text-sm text-blue-700 leading-relaxed">
                      Your keys are stored in the secure backend database. Connection is maintained via WebSocket 24/7 on the Render server.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <button 
                      onClick={handleDisconnect}
                      disabled={loading}
                      className="w-full py-3 px-4 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      {loading ? <RefreshCw className="animate-spin" size={20} /> : <LogOut size={20} />}
                      Disconnect Session
                    </button>
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              {instance.status === 'pairing' ? (
                 <div className="flex flex-col items-center animate-in fade-in duration-500">
                     <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-200 mb-6 relative">
                        {/* High Contrast Container for QR */}
                        <div className="w-[280px] h-[280px] bg-white flex items-center justify-center overflow-hidden border-4 border-white">
                           {qrCode && qrCode !== 'MOCK_QR_CODE_BASE64' ? (
                               <img 
                                src={qrCode} 
                                alt="Scan with WhatsApp" 
                                className="w-full h-full object-contain rendering-pixelated" 
                               />
                           ) : (
                               <div className="flex flex-col items-center gap-3 text-slate-400">
                                   <RefreshCw size={32} className="animate-spin text-blue-500" />
                                   <span className="text-sm font-medium">Generating QR...</span>
                               </div>
                           )}
                        </div>
                     </div>
                     <div className="flex items-center gap-2 text-slate-600 text-sm bg-slate-100 px-4 py-2 rounded-full mb-4">
                        <AlertCircle size={16} />
                        <span>Increase your screen brightness for better scanning</span>
                     </div>
                 </div>
              ) : (
                <div className="mb-8 p-6 bg-slate-50 rounded-full">
                  <WifiOff size={48} className="text-slate-400" />
                </div>
              )}

              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {instance.status === 'pairing' ? 'Scan QR Code' : 'Instance Disconnected'}
              </h3>
              <p className="text-slate-500 max-w-md mb-8">
                {instance.status === 'pairing' 
                  ? 'Open WhatsApp on your phone > Settings > Linked Devices > Link a Device. Point your camera at the code above.'
                  : 'Start the handshake to generate a secure QR code from the backend.'}
              </p>

              {instance.status === 'disconnected' && (
                <button 
                  onClick={handleReconnect}
                  disabled={loading}
                  className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center gap-2 transition-all hover:-translate-y-0.5"
                >
                   {loading ? <RefreshCw className="animate-spin" /> : <Wifi />}
                   Connect to Server
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};