import React, { useState, useRef, useEffect } from 'react';
import { FileSpreadsheet, ArrowRight, Keyboard, Users, Save, PlayCircle, Settings, AlertCircle, CheckCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import { Campaign } from '../types';
import { api } from '../services/api';

interface CampaignBuilderProps {
  onCreateCampaign: (campaign: Campaign) => void;
}

export const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ onCreateCampaign }) => {
  const [step, setStep] = useState(1);
  
  // Step 1: Input Method
  const [inputMethod, setInputMethod] = useState<'file' | 'manual'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [manualContacts, setManualContacts] = useState<{phone: string, name: string, info: string}[]>([]);
  const [manualInput, setManualInput] = useState({ phone: '', name: '', info: '' });

  // Data State
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  
  // Launch State
  const [isLaunching, setIsLaunching] = useState(false);
  const [campaignName, setCampaignName] = useState("Campaign " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString().slice(0,5));
  const [template, setTemplate] = useState("{Bonjour|Salam} {{Name}}, ...");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HANDLERS ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      parseCSV(uploadedFile);
    }
  };

  const parseCSV = (file: File) => {
      Papa.parse(file, {
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
  };

  const addManualContact = () => {
      if (!manualInput.phone) return alert("Phone number is required");
      setManualContacts([...manualContacts, { ...manualInput }]);
      setManualInput({ phone: '', name: '', info: '' });
  };

  const removeManualContact = (index: number) => {
      setManualContacts(manualContacts.filter((_, i) => i !== index));
  };

  const proceedFromManual = () => {
      if (manualContacts.length === 0) return alert("Add at least one contact");
      
      // Convert manual object to 'CSV-like' structure
      setCsvData(manualContacts);
      setHeaders(['phone', 'name', 'info']);
      setMapping({
          'phone': 'phone',
          'name': 'Nom',
          'info': 'Custom1'
      });
      setStep(2);
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

  // Auto-guess mapping for phone in File mode
  useEffect(() => {
    if (inputMethod === 'file' && headers.length > 0) {
      const phoneHeader = headers.find(h => h.toLowerCase().includes('tele') || h.toLowerCase().includes('phone') || h.toLowerCase().includes('mobile'));
      if (phoneHeader) {
        setMapping(prev => ({ ...prev, [phoneHeader]: 'phone' }));
      }
    }
  }, [headers, inputMethod]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Campaign Wizard</h2>
        <div className="flex items-center gap-2 text-sm text-slate-500">
           <span className={step >= 1 ? "text-blue-600 font-bold" : ""}>1. Source</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 2 ? "text-blue-600 font-bold" : ""}>2. Mapping</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 3 ? "text-blue-600 font-bold" : ""}>3. Template</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
        
        {/* STEP 1: UPLOAD OR MANUAL */}
        {step === 1 && (
          <div className="p-8 h-full flex flex-col">
             <div className="flex gap-4 justify-center mb-8">
                 <button 
                    onClick={() => setInputMethod('file')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg border transition-all ${inputMethod === 'file' ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                 >
                    <FileSpreadsheet size={20} />
                    Upload CSV
                 </button>
                 <button 
                    onClick={() => setInputMethod('manual')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg border transition-all ${inputMethod === 'manual' ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                 >
                    <Keyboard size={20} />
                    Manual Entry
                 </button>
             </div>

             {inputMethod === 'file' ? (
                 <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors p-12">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <FileSpreadsheet size={32} className="text-blue-600" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-2">Drag & Drop your CSV file here</h3>
                    <p className="text-slate-500 mb-6 text-sm max-w-sm text-center">Ensure your file has a header row. Columns like "Phone", "Name" are recommended.</p>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 shadow-lg shadow-blue-200"
                    >
                        Browse Files
                    </button>
                    <input 
                      type="file" 
                      accept=".csv"
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileUpload} 
                    />
                 </div>
             ) : (
                 <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
                     <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                         <div className="grid grid-cols-12 gap-3 mb-2">
                             <div className="col-span-4">
                                 <label className="text-xs font-semibold text-slate-500 uppercase">Phone (Required)</label>
                                 <input 
                                    type="text" 
                                    placeholder="212661..." 
                                    className="w-full mt-1 p-2 border border-slate-300 rounded text-sm"
                                    value={manualInput.phone}
                                    onChange={e => setManualInput({...manualInput, phone: e.target.value})}
                                 />
                             </div>
                             <div className="col-span-4">
                                 <label className="text-xs font-semibold text-slate-500 uppercase">Name</label>
                                 <input 
                                    type="text" 
                                    placeholder="Dr Alami" 
                                    className="w-full mt-1 p-2 border border-slate-300 rounded text-sm"
                                    value={manualInput.name}
                                    onChange={e => setManualInput({...manualInput, name: e.target.value})}
                                 />
                             </div>
                             <div className="col-span-3">
                                 <label className="text-xs font-semibold text-slate-500 uppercase">Info/Spec</label>
                                 <input 
                                    type="text" 
                                    placeholder="Cardio" 
                                    className="w-full mt-1 p-2 border border-slate-300 rounded text-sm"
                                    value={manualInput.info}
                                    onChange={e => setManualInput({...manualInput, info: e.target.value})}
                                 />
                             </div>
                             <div className="col-span-1 flex items-end">
                                 <button 
                                    onClick={addManualContact}
                                    className="w-full p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex justify-center"
                                 >
                                     <Plus size={20} />
                                 </button>
                             </div>
                         </div>
                     </div>

                     <div className="flex-1 border rounded-lg overflow-hidden bg-white mb-4 overflow-y-auto max-h-[300px]">
                         <table className="w-full text-sm text-left">
                             <thead className="bg-slate-100 text-slate-600">
                                 <tr>
                                     <th className="p-3">Phone</th>
                                     <th className="p-3">Name</th>
                                     <th className="p-3">Info</th>
                                     <th className="p-3 w-10"></th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {manualContacts.length === 0 ? (
                                     <tr>
                                         <td colSpan={4} className="p-8 text-center text-slate-400">No contacts added yet.</td>
                                     </tr>
                                 ) : (
                                     manualContacts.map((c, i) => (
                                         <tr key={i} className="border-t border-slate-100">
                                             <td className="p-3 font-mono text-slate-700">{c.phone}</td>
                                             <td className="p-3">{c.name}</td>
                                             <td className="p-3">{c.info}</td>
                                             <td className="p-3">
                                                 <button onClick={() => removeManualContact(i)} className="text-red-400 hover:text-red-600">
                                                     <Trash2 size={16} />
                                                 </button>
                                             </td>
                                         </tr>
                                     ))
                                 )}
                             </tbody>
                         </table>
                     </div>

                     <div className="flex justify-end">
                         <button 
                            onClick={proceedFromManual}
                            disabled={manualContacts.length === 0}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                         >
                             Next Step <ArrowRight size={16} />
                         </button>
                     </div>
                 </div>
             )}
          </div>
        )}

        {/* STEP 2: MAPPING */}
        {step === 2 && (
          <div className="p-8">
            <h3 className="text-lg font-semibold mb-4">Variable Mapping</h3>
            <p className="text-slate-500 text-sm mb-6">Match your CSV columns to the system variables. You <b>must</b> select one column as 'Phone Number'.</p>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                  <tr>
                    <th className="p-4 w-1/3">Column Header</th>
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

        {/* STEP 3: TEMPLATE */}
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
                  placeholder="Hello {{Name}}..."
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
                     <div className="font-bold text-xs text-orange-400 mb-1">
                        +212 {csvData[0] ? (csvData[0][Object.keys(mapping).find(key => mapping[key] === 'phone') || ''] || '...').replace(/\D/g,'').slice(-9) : '...'}
                     </div>
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