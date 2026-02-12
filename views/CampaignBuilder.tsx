import React, { useState, useRef } from 'react';
import { FileSpreadsheet, ArrowRight, Wand2, Users, Save, PlayCircle, Settings, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { Campaign } from '../types';
import { api } from '../services/api';

interface CampaignBuilderProps {
  onCreateCampaign: (campaign: Campaign) => void;
}

export const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ onCreateCampaign }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  const [isLaunching, setIsLaunching] = useState(false);
  
  const [campaignName, setCampaignName] = useState("My Medical Campaign " + new Date().toLocaleDateString());
  const [template, setTemplate] = useState("{Bonjour|Salam} Dr {{Nom}}, j'ai vu que vous êtes {{Spécialité}}. C'est intéressant.");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      Papa.parse(uploadedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setCsvData(results.data);
            setHeaders(results.meta.fields || []);
            setStep(2);
          } else {
            alert("The CSV file appears to be empty or invalid.");
          }
        },
        error: (err) => {
          console.error("CSV Error:", err);
          alert("Error parsing CSV file.");
        }
      });
    }
  };

  const handleMappingChange = (header: string, variable: string) => {
    setMapping(prev => ({
      ...prev,
      [header]: variable
    }));
  };

  const getPreview = () => {
    if (csvData.length === 0) return template;
    
    let text = template;
    const firstRow = csvData[0];

    // Replace mapped variables
    Object.entries(mapping).forEach(([header, variable]) => {
      if (variable !== 'ignore' && variable !== 'phone') {
         const regex = new RegExp(`{{${variable}}}`, 'g');
         text = text.replace(regex, firstRow[header] || `[${header}]`);
      }
    });

    // Handle Spintax
    text = text.replace(/\{([^{}]+)\}/g, (match, group) => {
      const options = group.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
    
    return text;
  };

  const handleLaunch = async () => {
    if (!campaignName) return alert("Please name your campaign");
    
    setIsLaunching(true);
    try {
        // Send actual data to backend to process the queue
        const campaignData = {
            name: campaignName,
            contacts: csvData,
            mapping: mapping,
            template: template
        };
        
        const newCampaign = await api.createCampaign(campaignData);
        onCreateCampaign(newCampaign);
    } catch (e) {
        alert("Error launching campaign: " + e);
        setIsLaunching(false);
    }
  };

  // Auto-guess mapping for phone
  React.useEffect(() => {
    if (headers.length > 0) {
      const phoneHeader = headers.find(h => h.toLowerCase().includes('tele') || h.toLowerCase().includes('phone') || h.toLowerCase().includes('mobile'));
      if (phoneHeader) {
        setMapping(prev => ({ ...prev, [phoneHeader]: 'phone' }));
      }
    }
  }, [headers]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">New Campaign Wizard</h2>
        <div className="flex items-center gap-2 text-sm text-slate-500">
           <span className={step >= 1 ? "text-blue-600 font-bold" : ""}>1. Upload</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 2 ? "text-blue-600 font-bold" : ""}>2. Mapping</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 3 ? "text-blue-600 font-bold" : ""}>3. Template</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
        {step === 1 && (
          <div className="p-12 flex flex-col items-center justify-center text-center h-full">
             <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <FileSpreadsheet size={40} className="text-blue-600" />
             </div>
             <h3 className="text-xl font-semibold text-slate-900 mb-2">Upload Contact List (CSV)</h3>
             <p className="text-slate-500 mb-8 max-w-md">
               File must include phone numbers (international format 212...) and variables for personalization.
             </p>
             <label className="cursor-pointer bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 hover:border-blue-500 hover:bg-blue-50 transition-all w-full max-w-lg group">
                <input 
                  type="file" 
                  accept=".csv"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload} 
                />
                <div className="text-center group-hover:scale-105 transition-transform">
                  <span className="text-blue-600 font-medium text-lg">Click to upload CSV</span>
                </div>
                <div className="text-xs text-slate-400 mt-2">Max 5000 contacts recommended</div>
             </label>
             <div className="mt-8 text-sm text-slate-400">
                <p>Don't have a file? <button onClick={() => {
                    const mockData = "Nom,Telephone,Spécialité\nDr Alami,212661000000,Cardiologue\nDr Bennis,212662000000,Généraliste";
                    const blob = new Blob([mockData], { type: 'text/csv' });
                    const file = new File([blob], "demo_contacts.csv", { type: 'text/csv' });
                    setFile(file);
                    Papa.parse(file, { header: true, complete: (r) => { setCsvData(r.data); setHeaders(r.meta.fields || []); setStep(2); } });
                }} className="text-blue-500 hover:underline">Use demo data</button></p>
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-8">
            <h3 className="text-lg font-semibold mb-4">Variable Mapping</h3>
            <p className="text-slate-500 text-sm mb-6">Match your CSV columns to the system variables. You <b>must</b> select one column as 'Phone Number'.</p>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                  <tr>
                    <th className="p-4 w-1/3">CSV Column Header</th>
                    <th className="p-4 w-1/3">First Row Preview</th>
                    <th className="p-4 w-1/3">Map To Variable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {headers.map((header) => (
                    <tr key={header}>
                      <td className="p-4 font-medium text-slate-700">{header}</td>
                      <td className="p-4 text-slate-500 truncate max-w-xs">{csvData[0][header]}</td>
                      <td className="p-4">
                        <select 
                          className={`border rounded px-3 py-2 w-full text-sm ${mapping[header] === 'phone' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-300'}`}
                          onChange={(e) => handleMappingChange(header, e.target.value)}
                          value={mapping[header] || 'ignore'}
                        >
                          <option value="ignore">-- Ignore --</option>
                          <option value="phone">System: Phone Number</option>
                          <option value="Nom">{'{{Nom}}'}</option>
                          <option value="Prénom">{'{{Prénom}}'}</option>
                          <option value="Spécialité">{'{{Spécialité}}'}</option>
                          <option value="Ville">{'{{Ville}}'}</option>
                          <option value="Custom1">{'{{Custom1}}'}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 flex justify-between items-center">
               <div className="text-sm text-slate-500">
                  {csvData.length} contacts loaded
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded">Back</button>
                 <button 
                  onClick={() => {
                      if (!Object.values(mapping).includes('phone')) {
                          alert("You must map at least one column to 'Phone Number'");
                          return;
                      }
                      setStep(3);
                  }} 
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                 >
                   Next Step <ArrowRight size={16} />
                 </button>
               </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
            <div className="p-8 border-r border-slate-100 flex flex-col">
               <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Campaign Name</label>
                  <input 
                    type="text" 
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
               </div>

               <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-slate-900">Message Template</h3>
                  <div className="flex gap-2">
                    {Object.entries(mapping).filter(k => k[1] !== 'ignore' && k[1] !== 'phone').map(([k, v]) => (
                        <button 
                            key={k} 
                            onClick={() => setTemplate(prev => prev + ` {{${v}}}`)}
                            className="text-xs bg-slate-100 border border-slate-200 px-2 py-1 rounded hover:bg-slate-200"
                        >
                            {`{{${v}}}`}
                        </button>
                    ))}
                  </div>
               </div>
               <textarea 
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full flex-1 min-h-[200px] p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm leading-relaxed"
                  placeholder="Hello {{Nom}}..."
               ></textarea>
               <div className="mt-2 text-xs text-slate-500 flex justify-between">
                 <span>Use <code>{`{Option A|Option B}`}</code> for Spintax.</span>
                 <span className={template.length > 1000 ? "text-red-500" : ""}>{template.length} chars</span>
               </div>
            </div>

            <div className="p-8 bg-slate-50 flex flex-col">
               <h3 className="font-semibold text-slate-900 mb-4">Live Preview (Row 1)</h3>
               
               {/* WhatsApp Bubble Simulation */}
               <div className="bg-[#e5ddd5] p-4 rounded-lg flex-1 mb-6 relative overflow-hidden border border-slate-200 shadow-inner flex flex-col justify-end">
                  <div className="absolute inset-0 opacity-10 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]"></div>
                  
                  <div className="relative self-start bg-white p-3 rounded-lg shadow-sm rounded-tl-none max-w-[90%] text-sm text-slate-800 leading-snug mb-2">
                     <div className="font-bold text-xs text-orange-400 mb-1">+212 {csvData[0] ? (csvData[0][Object.keys(mapping).find(key => mapping[key] === 'phone') || ''] || '...').replace(/\D/g,'').slice(-9) : '...'}</div>
                     <p className="whitespace-pre-wrap">{getPreview()}</p>
                     <div className="text-[10px] text-slate-400 text-right mt-1 flex items-center justify-end gap-1">
                        10:42 AM <CheckCircle size={10} className="text-blue-400" />
                     </div>
                  </div>
               </div>

               <div className="space-y-3">
                 <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 flex gap-2">
                    <AlertCircle size={14} className="mt-0.5" />
                    <p>Before launching, ensure your WhatsApp instance is connected and has enough battery.</p>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setStep(2)} className="flex-1 py-3 border border-slate-300 bg-white rounded-lg text-slate-700 font-medium hover:bg-slate-50">
                        Back
                    </button>
                    <button 
                        onClick={handleLaunch} 
                        disabled={isLaunching}
                        className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLaunching ? <Loader2 className="animate-spin" /> : <PlayCircle size={18} />}
                        {isLaunching ? 'Uploading...' : 'Launch Campaign'}
                    </button>
                 </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};