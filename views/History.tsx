import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Campaign } from '../types';
import { Calendar, Clock } from 'lucide-react';

export const History: React.FC = () => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getHistory().then(data => {
            setCampaigns(data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="p-8 text-center text-slate-500">Loading history...</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">Campaign History</h2>
            <div className="grid gap-4">
                {campaigns.length === 0 && (
                    <div className="p-8 bg-white rounded-lg border text-center text-slate-500">No history found in database.</div>
                )}
                {campaigns.map(c => (
                    <div key={c.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex-1">
                            <h3 className="font-bold text-lg text-slate-800">{c.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                {/* Fixed createdAt to created_at */}
                                <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(c.created_at).toLocaleDateString()}</span>
                                <span className="flex items-center gap-1"><Clock size={14}/> {new Date(c.created_at).toLocaleTimeString()}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                                c.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                c.status === 'running' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-600'
                            }`}>
                                {c.status}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};