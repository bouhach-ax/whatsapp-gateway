import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'slate';
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, subValue, icon: Icon, color = 'slate' }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-600',
    yellow: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
        <Icon size={20} />
      </div>
    </div>
  );
};