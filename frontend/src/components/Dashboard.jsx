import { useState, useEffect } from 'react';
import api from '../services/api';
import { LogOut, Activity, ShieldAlert, Clock, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import InventoryUpload from './InventoryUpload';

export default function Dashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/alerts');
      setAlerts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // Poll every minute
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 pb-12">
      {/* Navbar */}
      <nav className="glass border-b border-slate-800 sticky top-0 z-10 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Activity className="text-cyan-400 w-6 h-6" />
          <h1 className="text-xl font-bold tracking-wide">Threat Intel <span className="text-cyan-400">Dashboard</span></h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* Top Section */}
        <section>
          <InventoryUpload />
        </section>

        {/* Alerts Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <ShieldAlert className="text-rose-500 w-6 h-6" />
            <h2 className="text-2xl font-semibold">Recent Alerts</h2>
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <Clock size={14} />
              <span>Auto-updating</span>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="glass p-6 rounded-xl animate-pulse h-48"></div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="glass p-12 rounded-xl text-center flex flex-col items-center">
              <ShieldAlert className="w-16 h-16 text-slate-700 mb-4" />
              <h3 className="text-lg font-medium text-slate-300">No active threats found</h3>
              <p className="text-slate-500 mt-2 max-w-md">Your uploaded inventory currently has no matches in our intelligence feeds. We will continue monitoring.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="glass p-6 rounded-xl border border-slate-700/50 hover:border-cyan-500/30 transition-all flex flex-col group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="flex justify-between items-start mb-4 mt-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      {alert.source}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      {formatDistanceToNow(new Date(alert.published_at), { addSuffix: true })}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-slate-100 mb-2 line-clamp-2" title={alert.title}>
                    {alert.title}
                  </h3>
                  
                  <p className="text-sm text-slate-400 mb-4 line-clamp-3 flex-grow">
                    {alert.description}
                  </p>
                  
                  <div className="mt-auto pt-4 border-t border-slate-800 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Matched Inventory</span>
                      <span className="text-sm font-medium text-cyan-400">{alert.matched_on}</span>
                    </div>
                    {alert.url && (
                      <a 
                        href={alert.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                        title="View Source"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
