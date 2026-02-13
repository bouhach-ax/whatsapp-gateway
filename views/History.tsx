import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Campaign, Tab } from '../types';
import { Calendar, Clock, CheckCircle2, AlertTriangle, Trash2, Loader2, BarChart2, RotateCcw } from 'lucide-react';

interface HistoryProps {
    onNavigate: (tab: Tab) => void;
}

export const History: React.FC<HistoryProps> = ({ onNavigate }) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [rerunningId, setRerunningId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        setLoading(true);
        api.getHistory().then(data => {
            setCampaigns(data);
            setLoading(false);
        }).catch(() => setLoading(false));
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Supprimer l'historique de la campagne "${name}" ?`)) return;
        setDeletingId(id);
        try {
            await api.deleteCampaign(id);
            setCampaigns(prev => prev.filter(c => c.id !== id));
        } catch (e) {
            alert("Erreur lors de la suppression");
        } finally {
            setDeletingId(null);
        }
    };

    const handleRerun = async (campaign: Campaign) => {
        if (!confirm(`Relancer la campagne "${campaign.name}" avec les mêmes contacts et le même message ?`)) return;
        
        setRerunningId(campaign.id);
        try {
            // 1. Fetch old contacts from backend
            const rawContacts = await api.getCampaignContacts(campaign.id);
            if (!rawContacts || rawContacts.length === 0) {
                alert("Impossible de relancer : aucun contact trouvé pour cette campagne.");
                return;
            }

            // 2. Format contacts for createCampaign. 
            // The backend's createCampaign expects a structure it can re-map, OR if we send 
            // pre-structured data, we avoid mapping.
            // Since we get { phone: '...', data: { Nom: '...' } }, we flatten it so the backend 
            // logic (which defaults phone to 'phone' key) works perfectly.
            const formattedContacts = rawContacts.map((c: any) => ({
                phone: c.phone,
                ...c.data
            }));

            // 3. Create new campaign
            await api.createCampaign({
                name: `${campaign.name} (Relance ${new Date().toLocaleDateString()})`,
                template: campaign.template,
                contacts: formattedContacts,
                mapping: {} // No mapping needed as we pre-formatted 'phone' and keys are already in data
            });

            // 4. Redirect to Dashboard
            onNavigate(Tab.DASHBOARD);

        } catch (e) {
            console.error(e);
            alert("Erreur lors de la relance de la campagne.");
        } finally {
            setRerunningId(null);
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64 text-slate-500 gap-2">
            <Loader2 className="animate-spin" /> Chargement de l'historique...
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
                    <BarChart2 size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Historique des Campagnes</h2>
                    <p className="text-slate-500 text-sm">Consultez les performances de vos envois précédents.</p>
                </div>
            </div>

            <div className="grid gap-4">
                {campaigns.length === 0 && (
                    <div className="p-12 bg-white rounded-xl border border-dashed border-slate-300 text-center">
                        <div className="mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <Clock className="text-slate-400" size={32} />
                        </div>
                        <h3 className="text-slate-900 font-medium">Aucun historique</h3>
                        <p className="text-slate-500 text-sm">Les campagnes terminées apparaîtront ici.</p>
                    </div>
                )}
                
                {campaigns.map(c => {
                    const total = c.totalContacts || 1; // Avoid division by zero
                    const sent = c.sentCount || 0;
                    const failed = c.failedCount || 0;
                    const successRate = Math.round((sent / total) * 100);
                    const isCompleted = c.status === 'completed';

                    return (
                        <div key={c.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                {/* Left: Info */}
                                <div className="flex-1 min-w-[200px]">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-bold text-lg text-slate-900 truncate">{c.name}</h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                            isCompleted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            c.status === 'running' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
                                            'bg-slate-50 text-slate-500 border-slate-200'
                                        }`}>
                                            {c.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(c.created_at).toLocaleDateString()}</span>
                                        <span className="flex items-center gap-1"><Clock size={12}/> {new Date(c.created_at).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                                
                                {/* Middle: Metrics */}
                                <div className="flex-1 w-full md:w-auto">
                                    <div className="flex justify-between text-xs font-medium text-slate-600 mb-2">
                                        <span>Progression</span>
                                        <span className="text-slate-900 font-bold">{successRate}%</span>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                        <div style={{ width: `${(sent/total)*100}%` }} className="bg-emerald-500 h-full"></div>
                                        <div style={{ width: `${(failed/total)*100}%` }} className="bg-red-400 h-full"></div>
                                    </div>
                                    
                                    <div className="flex justify-between mt-2 text-xs">
                                        <div className="flex items-center gap-1 text-emerald-600 font-medium">
                                            <CheckCircle2 size={12} /> {sent.toLocaleString()} Envoyés
                                        </div>
                                        <div className="flex items-center gap-1 text-red-500 font-medium">
                                            <AlertTriangle size={12} /> {failed.toLocaleString()} Échecs
                                        </div>
                                        <div className="text-slate-400">
                                            Total: {total.toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleRerun(c)}
                                        disabled={rerunningId === c.id || c.status === 'running'}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Relancer cette campagne"
                                    >
                                        {rerunningId === c.id ? <Loader2 size={16} className="animate-spin"/> : <RotateCcw size={16} />}
                                        Relancer
                                    </button>

                                    <button 
                                        onClick={() => handleDelete(c.id, c.name)}
                                        disabled={deletingId === c.id}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Supprimer l'historique"
                                    >
                                        {deletingId === c.id ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};