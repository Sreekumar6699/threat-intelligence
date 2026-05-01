import { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import { Upload, RefreshCw, CheckCircle, AlertCircle, Plus, Info, X } from 'lucide-react';

export default function InventoryUpload() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [manualItem, setManualItem] = useState('');
  const [manualStatus, setManualStatus] = useState('');
  const [inventoryItems, setInventoryItems] = useState([]);
  const fileInputRef = useRef(null);

  const fetchInventory = async () => {
    try {
      const res = await api.get('/inventory');
      setInventoryItems(res.data.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setStatus('uploading');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      await api.post('/inventory/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStatus('success');
      fetchInventory();
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await api.post('/sync/force');
      setTimeout(() => setIsSyncing(false), 2000); // Visual delay
    } catch (err) {
      console.error(err);
      setIsSyncing(false);
    }
  };

  const handleAddManualItem = async (e) => {
    e.preventDefault();
    if (!manualItem.trim()) return;
    
    setManualStatus('adding');
    try {
      await api.post('/inventory/add', { item: manualItem.trim() });
      setManualStatus('success');
      setManualItem('');
      fetchInventory();
      setTimeout(() => setManualStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setManualStatus('error');
    }
  };

  const handleRemoveItem = async (itemToRemove) => {
    try {
      await api.post('/inventory/remove', { item: itemToRemove });
      fetchInventory();
    } catch (err) {
      console.error("Failed to remove item", err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Informational Banner */}
      <div className="glass p-4 rounded-xl flex items-start gap-3 border-l-4 border-cyan-500 bg-cyan-900/10">
        <Info className="text-cyan-400 mt-0.5 shrink-0" size={20} />
        <div>
          <h3 className="text-slate-200 font-medium mb-1">How to Monitor Threats</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            Upload a JSON file containing a flat array of vendors and products (e.g., <code>["Microsoft", "Cisco", "vCenter"]</code>), or add them manually below. The background worker will scan real-time threat intelligence feeds and alert you if any vulnerabilities or ransomware attacks mention these terms.
          </p>
        </div>
      </div>

      <div className="glass p-6 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <input 
          type="file" 
          accept=".json" 
          className="hidden" 
          ref={fileInputRef}
          onChange={handleUpload}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors text-slate-200"
        >
          <Upload size={18} className="text-cyan-400" />
          <span>Upload JSON Inventory</span>
        </button>
        
        {status === 'success' && <div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle size={16} /> Uploaded</div>}
        {status === 'error' && <div className="flex items-center gap-2 text-red-400 text-sm"><AlertCircle size={16} /> Failed</div>}
        {status === 'uploading' && <div className="text-slate-400 text-sm">Uploading...</div>}
      </div>

      <button 
        onClick={handleForceSync}
        disabled={isSyncing}
        className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium transition-all shadow-lg ${
          isSyncing 
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/50'
        }`}
      >
        <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
        <span>{isSyncing ? 'Syncing...' : 'Force Sync'}</span>
      </button>
      </div>

      {/* Manual Addition Section */}
      <div className="glass p-4 rounded-xl flex items-center justify-between">
        <form onSubmit={handleAddManualItem} className="flex flex-1 items-center gap-3">
          <input
            type="text"
            value={manualItem}
            onChange={(e) => setManualItem(e.target.value)}
            placeholder="E.g. Vercel or trivy"
            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!manualItem.trim() || manualStatus === 'adding'}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 rounded-lg transition-colors text-slate-200"
          >
            <Plus size={18} className="text-emerald-400" />
            <span>Add Item</span>
          </button>
          
          {manualStatus === 'success' && <span className="text-emerald-400 text-sm ml-2">Added!</span>}
          {manualStatus === 'error' && <span className="text-red-400 text-sm ml-2">Failed</span>}
        </form>
      </div>

      {/* Current Inventory Display */}
      {inventoryItems.length > 0 && (
        <div className="glass p-4 rounded-xl">
          <h3 className="text-slate-300 font-semibold mb-3 text-sm uppercase tracking-wider">Current Monitored Inventory</h3>
          <div className="flex flex-wrap gap-2">
            {inventoryItems.map((item, idx) => (
              <span key={idx} className="flex items-center gap-1 bg-slate-800 text-cyan-300 border border-slate-700 pl-3 pr-2 py-1 rounded-full text-sm group">
                <span>{item}</span>
                <button 
                  onClick={() => handleRemoveItem(item)}
                  className="hover:bg-red-500/20 hover:text-red-400 text-slate-500 p-0.5 rounded-full transition-colors ml-1 focus:outline-none"
                  title="Remove item"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
