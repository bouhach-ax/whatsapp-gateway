import React, { useState, useRef, useEffect } from 'react';
import { FileSpreadsheet, ArrowRight, Keyboard, Save, PlayCircle, AlertCircle, CheckCircle2, Loader2, Plus, Trash2, Edit2, X, ChevronLeft, ChevronRight, Users, Download, Cloud, Shuffle, Wand2, Phone } from 'lucide-react';
import Papa from 'papaparse';
import { Campaign } from '../types';
import { api } from '../services/api';

interface CampaignBuilderProps {
  onCreateCampaign: (campaign: Campaign) => void;
}

export const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ onCreateCampaign }) => {
  const [step, setStep] = useState(1);
  
  // Step 1: Input Method
  const [inputMethod, setInputMethod] = useState<'file' | 'manual' | 'saved'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [savedLists, setSavedLists] = useState<any[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  
  // Manual Entry State
  const [manualContacts, setManualContacts] = useState<{nom: string, numero: string, ville: string, url: string, specialite: string}[]>([]);
  const [manualInput, setManualInput] = useState({ nom: '', numero: '', ville: '', url: '', specialite: '' });

  // Data State
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  
  // Review Step State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  
  // Save List State
  const [saveListMode, setSaveListMode] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isSavingList, setIsSavingList] = useState(false);

  // Launch State
  const [isLaunching, setIsLaunching] = useState(false);
  const [campaignName, setCampaignName] = useState("Campagne " + new Date().toLocaleDateString());
  const [template, setTemplate] = useState("{Bonjour|Salam|Bonsoir} Dr {{Nom}}, expert en {{Spécialité}} à {{Ville}}.\n\nVoici le lien de votre dossier : {{URL}}");
  
  // Preview State
  const [previewIndex, setPreviewIndex] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Force re-render of randoms

  // Test Message State
  const [testPhone, setTestPhone] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showTestInput, setShowTestInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HANDLERS ---

  useEffect(() => {
      if (inputMethod === 'saved') {
          loadSavedLists();
      }
  }, [inputMethod]);

  const loadSavedLists = async () => {
      setIsLoadingLists(true);
      try {
          const lists = await api.getContactLists();
          setSavedLists(lists);
      } catch (e) {
          console.error(e);
      } finally {
          setIsLoadingLists(false);
      }
  };

  const handleLoadList = async (listId: string) => {
      setIsLoadingLists(true);
      try {
          const items = await api.getListItems(listId);
          // Convert DB items back to "CSV-like" structure
          const formattedData = items.map((item: any) => ({
             phone: item.phone, // Internal field
             ...item.data       // Spread the JSONB data (Nom, Ville, etc.)
          }));

          setCsvData(formattedData);
          
          // Reconstruct headers based on the first item + phone
          if (formattedData.length > 0) {
              const keys = Object.keys(formattedData[0]);
              setHeaders(keys);
              
              // Auto map
              const newMapping: any = {};
              keys.forEach(k => {
                  if (k === 'phone') newMapping[k] = 'phone';
                  else newMapping[k] = k; // Assume exact match for saved lists
              });
              setMapping(newMapping);
              setStep(3); // Skip mapping for saved lists, go to review
          }
      } catch (e) {
          alert("Erreur lors du chargement de la liste");
      } finally {
          setIsLoadingLists(false);
      }
  };

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
            alert("Le fichier CSV semble vide ou invalide.");
          }
        },
        error: (err) => {
          console.error("CSV Error:", err);
          alert("Erreur lors de la lecture du CSV.");
        }
      });
  };

  const addManualContact = () => {
      if (!manualInput.numero) return alert("Le numéro est requis");
      setManualContacts([...manualContacts, { ...manualInput }]);
      setManualInput({ nom: '', numero: '', ville: '', url: '', specialite: '' });
  };

  const removeManualContact = (index: number) => {
      setManualContacts(manualContacts.filter((_, i) => i !== index));
  };

  const proceedFromManual = () => {
      if (manualContacts.length === 0) return alert("Ajoutez au moins un contact");
      setCsvData(manualContacts);
      setHeaders(['nom', 'numero', 'ville', 'url', 'specialite']);
      setMapping({
          'nom': 'Nom',
          'numero': 'phone',
          'ville': 'Ville',
          'url': 'URL',
          'specialite': 'Spécialité'
      });
      setStep(2);
  };

  const handleMappingChange = (header: string, variable: string) => {
    setMapping(prev => ({
      ...prev,
      [header]: variable
    }));
  };

  const handleSaveList = async () => {
      if (!newListName) return alert("Nom de liste requis");
      setIsSavingList(true);
      try {
          await api.saveContactList(newListName, csvData, mapping);
          alert("Liste sauvegardée avec succès !");
          setSaveListMode(false);
      } catch (e) {
          alert("Erreur sauvegarde: " + e);
      } finally {
          setIsSavingList(false);
      }
  };

  // --- REVIEW STEP HELPERS ---

  const getMappedValue = (row: any, systemVar: string) => {
      // Find which CSV header maps to this system variable
      const header = Object.keys(mapping).find(key => mapping[key] === systemVar);
      return header ? row[header] : '';
  };

  const deleteRow = (realIndex: number) => {
      if (confirm("Supprimer ce contact ?")) {
          const newData = csvData.filter((_, i) => i !== realIndex);
          setCsvData(newData);
      }
  };

  const startEditing = (realIndex: number) => {
      setEditingRowIndex(realIndex);
      setEditValues({ ...csvData[realIndex] });
  };

  const saveEdit = (realIndex: number) => {
      const newData = [...csvData];
      newData[realIndex] = editValues;
      setCsvData(newData);
      setEditingRowIndex(null);
  };

  // --- TEMPLATE HELPERS ---

  const insertSpintax = (start: string, mid: string, end: string) => {
      setTemplate(prev => prev + `{${start}|${mid}|${end}}`);
  };

  const getPreview = (): { text: string; row: any | null } => {
    if (csvData.length === 0) return { text: template, row: null };
    let text = template;
    
    // Use random row if preview index is -1 (shuffle mode), else use specific index
    const rowIndex = previewIndex >= 0 && previewIndex < csvData.length ? previewIndex : Math.floor(Math.random() * csvData.length);
    const row = csvData[rowIndex];

    Object.entries(mapping).forEach(([header, variable]) => {
      if (variable !== 'ignore' && variable !== 'phone') {
         const regex = new RegExp(`{{${variable}}}`, 'gi'); // Case insensitive
         text = text.replace(regex, row[header] || `[${header}]`);
      }
    });

    // Handle Spintax
    text = text.replace(/\{([^{}]+)\}/g, (match, group) => {
      const options = group.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
    return { text, row };
  };

  const handleSendTest = async () => {
      if (!testPhone) return alert("Entrez un numéro");
      const currentPreview = getPreview();
      setIsSendingTest(true);
      try {
          await api.sendTestMessage(testPhone, currentPreview.text);
          alert("Message envoyé ! Vérifiez votre téléphone.");
          setShowTestInput(false);
      } catch (e) {
          alert("Erreur envoi test");
      } finally {
          setIsSendingTest(false);
      }
  };

  const handleLaunch = async () => {
    if (!campaignName) return alert("Veuillez nommer votre campagne");
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
        alert("Erreur lors du lancement : " + e);
        setIsLaunching(false);
    }
  };

  // Auto-guess mapping logic
  useEffect(() => {
    if (inputMethod === 'file' && headers.length > 0) {
      const newMapping: {[key:string]: string} = {};
      headers.forEach(h => {
          const lower = h.trim().toLowerCase();
          if (lower.includes('nom') || lower.includes('name')) newMapping[h] = 'Nom';
          else if (lower.includes('num') || lower.includes('phone') || lower.includes('mobile')) newMapping[h] = 'phone';
          else if (lower.includes('ville') || lower.includes('city')) newMapping[h] = 'Ville';
          else if (lower.includes('url') || lower.includes('link')) newMapping[h] = 'URL';
          else if (lower.includes('spec')) newMapping[h] = 'Spécialité';
      });
      setMapping(prev => ({ ...prev, ...newMapping }));
    }
  }, [headers, inputMethod]);

  // Pagination Logic
  const totalPages = Math.ceil(csvData.length / rowsPerPage);
  const paginatedData = csvData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const currentPreview = getPreview();

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Progress Bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Assistant Campagne</h2>
        <div className="flex items-center gap-2 text-sm text-slate-500">
           <span className={step >= 1 ? "text-blue-600 font-bold" : ""}>1. Source</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 2 ? "text-blue-600 font-bold" : ""}>2. Mapping</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 3 ? "text-blue-600 font-bold" : ""}>3. Vérification</span>
           <span className="text-slate-300">/</span>
           <span className={step >= 4 ? "text-blue-600 font-bold" : ""}>4. Template</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        
        {/* STEP 1: UPLOAD OR LISTS */}
        {step === 1 && (
          <div className="p-8 h-full flex flex-col items-center flex-1">
             <div className="flex gap-4 justify-center mb-8 w-full max-w-3xl">
                 <button onClick={() => setInputMethod('file')} className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 transition-all ${inputMethod === 'file' ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                    <FileSpreadsheet size={24} /> 
                    <div className="text-left">
                        <div className="text-sm">Nouvel Import</div>
                        <div className="text-xs font-normal opacity-70">CSV Excel</div>
                    </div>
                 </button>
                 <button onClick={() => setInputMethod('saved')} className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 transition-all ${inputMethod === 'saved' ? 'bg-purple-50 border-purple-500 text-purple-700 font-bold shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                    <Cloud size={24} />
                    <div className="text-left">
                        <div className="text-sm">Listes Enregistrées</div>
                        <div className="text-xs font-normal opacity-70">Réutiliser une audience</div>
                    </div>
                 </button>
                 <button onClick={() => setInputMethod('manual')} className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 transition-all ${inputMethod === 'manual' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                    <Keyboard size={24} />
                    <div className="text-left">
                        <div className="text-sm">Saisie Manuelle</div>
                        <div className="text-xs font-normal opacity-70">Ajout rapide</div>
                    </div>
                 </button>
             </div>

             {inputMethod === 'file' && (
                 <div className="w-full max-w-xl flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-50 p-12 transition-colors">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <FileSpreadsheet size={32} className="text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Glissez-déposez votre fichier CSV ici</h3>
                    <p className="text-slate-500 mb-6 text-sm text-center">Format recommandé : <br/><strong>Nom, Numero, Ville, URL, Specialite</strong></p>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">
                        Parcourir les fichiers
                    </button>
                    <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                 </div>
             )}

             {inputMethod === 'saved' && (
                 <div className="w-full max-w-3xl">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">Vos audiences sauvegardées</h3>
                     {isLoadingLists ? (
                         <div className="text-center p-12"><Loader2 className="animate-spin mx-auto text-blue-500 mb-2"/> Chargement...</div>
                     ) : savedLists.length === 0 ? (
                         <div className="text-center p-12 border-2 border-dashed rounded-xl bg-slate-50 text-slate-400">Aucune liste trouvée. Importez un CSV et sauvegardez-le.</div>
                     ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {savedLists.map(list => (
                                 <div key={list.id} onClick={() => handleLoadList(list.id)} className="group cursor-pointer bg-white border border-slate-200 p-4 rounded-xl hover:border-purple-500 hover:shadow-md transition-all">
                                     <div className="flex justify-between items-start">
                                         <div>
                                             <h4 className="font-bold text-slate-800 group-hover:text-purple-700">{list.name}</h4>
                                             <p className="text-xs text-slate-500 mt-1">{new Date(list.created_at).toLocaleDateString()}</p>
                                         </div>
                                         <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                             <Users size={12}/> {list.total_contacts}
                                         </span>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
             )}

             {inputMethod === 'manual' && (
                 <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
                     <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6">
                         <div className="grid grid-cols-12 gap-4 items-end">
                             <div className="col-span-2">
                                 <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Nom *</label>
                                 <input type="text" placeholder="Dr Alami" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" value={manualInput.nom} onChange={e => setManualInput({...manualInput, nom: e.target.value})} />
                             </div>
                             <div className="col-span-2">
                                 <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Numéro *</label>
                                 <input type="text" placeholder="2126..." className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" value={manualInput.numero} onChange={e => setManualInput({...manualInput, numero: e.target.value})} />
                             </div>
                             <div className="col-span-2">
                                 <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Ville</label>
                                 <input type="text" placeholder="Rabat" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" value={manualInput.ville} onChange={e => setManualInput({...manualInput, ville: e.target.value})} />
                             </div>
                             <div className="col-span-3">
                                 <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">URL Dossier</label>
                                 <input type="text" placeholder="https://..." className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" value={manualInput.url} onChange={e => setManualInput({...manualInput, url: e.target.value})} />
                             </div>
                             <div className="col-span-2">
                                 <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Spécialité</label>
                                 <input type="text" placeholder="Cardio" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" value={manualInput.specialite} onChange={e => setManualInput({...manualInput, specialite: e.target.value})} />
                             </div>
                             <div className="col-span-1">
                                 <button onClick={addManualContact} className="w-full p-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex justify-center shadow-md">
                                     <Plus size={20} />
                                 </button>
                             </div>
                         </div>
                     </div>
                     
                     <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-white mb-4 overflow-y-auto max-h-[300px]">
                         <table className="w-full text-sm text-left">
                             <thead className="bg-slate-100 text-slate-700 font-semibold">
                                 <tr>
                                     <th className="p-3">Nom</th>
                                     <th className="p-3">Numéro</th>
                                     <th className="p-3">Ville</th>
                                     <th className="p-3">URL</th>
                                     <th className="p-3">Spécialité</th>
                                     <th className="p-3 w-10"></th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                 {manualContacts.length === 0 ? (
                                     <tr><td colSpan={6} className="p-8 text-center text-slate-400">Aucun contact ajouté.</td></tr>
                                 ) : (
                                     manualContacts.map((c, i) => (
                                         <tr key={i} className="hover:bg-slate-50">
                                             <td className="p-3 text-slate-900 font-medium">{c.nom}</td>
                                             <td className="p-3 font-mono text-slate-600">{c.numero}</td>
                                             <td className="p-3 text-slate-700">{c.ville}</td>
                                             <td className="p-3 text-blue-600 truncate max-w-[150px]">{c.url}</td>
                                             <td className="p-3 text-slate-700">{c.specialite}</td>
                                             <td className="p-3 text-center">
                                                 <button onClick={() => removeManualContact(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                                             </td>
                                         </tr>
                                     ))
                                 )}
                             </tbody>
                         </table>
                     </div>

                     <div className="flex justify-end">
                         <button onClick={proceedFromManual} disabled={manualContacts.length === 0} className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2">
                             Suivant <ArrowRight size={18} />
                         </button>
                     </div>
                 </div>
             )}
          </div>
        )}

        {/* STEP 2: MAPPING */}
        {step === 2 && (
          <div className="p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Mapping des Variables</h3>
            <p className="text-slate-500 text-sm mb-6">Associez les colonnes. 'Numéro WhatsApp' est <strong>obligatoire</strong>.</p>
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-6 shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-4 w-1/3">Colonne CSV</th>
                    <th className="p-4 w-1/3">Aperçu</th>
                    <th className="p-4 w-1/3">Variable Système</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {headers.map((header) => (
                    <tr key={header}>
                      <td className="p-4 font-medium text-slate-900">{header}</td>
                      <td className="p-4 text-slate-500 truncate max-w-xs">{csvData[0][header]}</td>
                      <td className="p-4">
                        <select 
                          className={`border rounded px-3 py-2 w-full text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${mapping[header] === 'phone' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-900'}`}
                          onChange={(e) => handleMappingChange(header, e.target.value)}
                          value={mapping[header] || 'ignore'}
                        >
                          <option value="ignore">-- Ignorer --</option>
                          <option value="phone">Système : Numéro WhatsApp</option>
                          <option value="Nom">{'{{Nom}}'}</option>
                          <option value="Ville">{'{{Ville}}'}</option>
                          <option value="URL">{'{{URL}}'}</option>
                          <option value="Spécialité">{'{{Spécialité}}'}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between">
               <button onClick={() => setStep(1)} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Retour</button>
               <button onClick={() => {
                  if (!Object.values(mapping).includes('phone')) return alert("Le numéro est obligatoire.");
                  setStep(3);
               }} className="bg-blue-600 text-white px-8 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 shadow-lg shadow-blue-200">
                 Suivant <ArrowRight size={18} />
               </button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW */}
        {step === 3 && (
            <div className="flex flex-col h-full p-6 bg-slate-50/50">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Vérification des Données</h3>
                        <p className="text-sm text-slate-500">Total: <strong>{csvData.length}</strong> contacts.</p>
                    </div>
                    
                    {/* SAVE LIST OPTION */}
                    <div className="flex items-center gap-2">
                        {saveListMode ? (
                            <div className="flex items-center gap-2 bg-white p-1 pr-2 rounded-lg border border-purple-200 shadow-sm animate-in fade-in slide-in-from-right-4">
                                <input 
                                    autoFocus
                                    className="text-sm p-1.5 border border-slate-300 rounded bg-white text-slate-900 w-48 outline-none focus:border-purple-500"
                                    placeholder="Nom de la liste..."
                                    value={newListName}
                                    onChange={e => setNewListName(e.target.value)}
                                />
                                <button onClick={handleSaveList} disabled={isSavingList} className="bg-purple-600 hover:bg-purple-700 text-white p-1.5 rounded">
                                    {isSavingList ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                                </button>
                                <button onClick={() => setSaveListMode(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                            </div>
                        ) : (
                             <button onClick={() => setSaveListMode(true)} className="flex items-center gap-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-2 rounded-lg transition-colors">
                                <Save size={14} /> Sauvegarder cette liste
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 overflow-hidden flex flex-col">
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 w-16 text-center">#</th>
                                    <th className="p-3">Nom</th>
                                    <th className="p-3">Numéro (WhatsApp)</th>
                                    <th className="p-3">Ville</th>
                                    <th className="p-3">URL Dossier</th>
                                    <th className="p-3">Spécialité</th>
                                    <th className="p-3 w-24 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedData.map((row, i) => {
                                    const realIndex = (currentPage - 1) * rowsPerPage + i;
                                    const isEditing = editingRowIndex === realIndex;
                                    const phoneVal = getMappedValue(row, 'phone');
                                    const getKey = (sysVar: string) => Object.keys(mapping).find(k => mapping[k] === sysVar);

                                    return (
                                        <tr key={realIndex} className={`hover:bg-slate-50 group ${!phoneVal ? 'bg-red-50' : ''}`}>
                                            <td className="p-3 text-center text-slate-400 font-mono text-xs">{realIndex + 1}</td>
                                            <td className="p-3 text-slate-900">
                                                {isEditing ? <input className="w-full p-1 border rounded bg-white text-slate-900" value={editValues[getKey('Nom')!] || ''} onChange={e => setEditValues({...editValues, [getKey('Nom')!]: e.target.value})} /> : (getMappedValue(row, 'Nom') || '-')}
                                            </td>
                                            <td className="p-3">
                                                {isEditing ? <input className="w-full p-1 border rounded font-mono bg-white text-slate-900" value={editValues[getKey('phone')!] || ''} onChange={e => setEditValues({...editValues, [getKey('phone')!]: e.target.value})} /> : 
                                                <span className={`font-mono font-medium ${!phoneVal ? 'text-red-500' : 'text-slate-700'}`}>{phoneVal || "MANQUANT"}</span>}
                                            </td>
                                            <td className="p-3 text-slate-900">
                                                {isEditing ? <input className="w-full p-1 border rounded bg-white text-slate-900" value={editValues[getKey('Ville')!] || ''} onChange={e => setEditValues({...editValues, [getKey('Ville')!]: e.target.value})} /> : (getMappedValue(row, 'Ville') || '-')}
                                            </td>
                                            <td className="p-3 max-w-[150px] truncate text-xs text-blue-600">
                                                {isEditing ? <input className="w-full p-1 border rounded bg-white text-slate-900" value={editValues[getKey('URL')!] || ''} onChange={e => setEditValues({...editValues, [getKey('URL')!]: e.target.value})} /> : (getMappedValue(row, 'URL') || '-')}
                                            </td>
                                            <td className="p-3 text-slate-900">
                                                {isEditing ? <input className="w-full p-1 border rounded bg-white text-slate-900" value={editValues[getKey('Spécialité')!] || ''} onChange={e => setEditValues({...editValues, [getKey('Spécialité')!]: e.target.value})} /> : 
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{getMappedValue(row, 'Spécialité') || 'N/A'}</span>}
                                            </td>
                                            <td className="p-3 text-center">
                                                {isEditing ? (
                                                    <div className="flex gap-2 justify-center"><button onClick={() => saveEdit(realIndex)} className="text-emerald-600 hover:text-emerald-700"><Save size={16}/></button><button onClick={() => setEditingRowIndex(null)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button></div>
                                                ) : (
                                                    <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => startEditing(realIndex)} className="text-blue-400 hover:text-blue-600"><Edit2 size={16}/></button><button onClick={() => deleteRow(realIndex)} className="text-red-300 hover:text-red-500"><Trash2 size={16}/></button></div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-slate-200 p-3 bg-slate-50 flex justify-between items-center">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1 text-xs font-bold disabled:opacity-50"><ChevronLeft size={14} /> Précédent</button>
                        <span className="text-xs text-slate-500 font-medium">Page {currentPage} sur {totalPages || 1}</span>
                        <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1 text-xs font-bold disabled:opacity-50">Suivant <ChevronRight size={14} /></button>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                    <button onClick={() => setStep(2)} className="px-6 py-2 text-slate-600 hover:bg-white rounded-lg font-medium">Retour</button>
                    <button onClick={() => setStep(4)} className="bg-blue-600 text-white px-8 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 shadow-lg shadow-blue-200">
                        Valider la liste <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        )}

        {/* STEP 4: TEMPLATE (Refined Visuals) */}
        {step === 4 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
            <div className="p-8 border-r border-slate-200 flex flex-col bg-white">
               <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">Nom de la Campagne</label>
                  <input 
                    type="text" 
                    value={campaignName} 
                    onChange={(e) => setCampaignName(e.target.value)} 
                    className="w-full p-3 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" 
                  />
               </div>

               {/* SPINTAX TOOLBAR */}
               <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-800 uppercase text-sm tracking-wide flex items-center gap-2">
                        <Wand2 size={16} className="text-purple-600"/> 
                        Variables & Variations
                    </h3>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap mb-3">
                    {Object.entries(mapping).filter(k => k[1] !== 'ignore' && k[1] !== 'phone').map(([k, v]) => (
                        <button key={k} onClick={() => setTemplate(prev => prev + ` {{${v}}}`)} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1.5 rounded hover:bg-blue-100 transition-colors font-medium">
                            {`{{${v}}}`}
                        </button>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                      <button onClick={() => insertSpintax('Bonjour', 'Salam', 'Bonsoir')} className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded hover:bg-purple-100 transition-colors font-medium">
                         {`{Bonjour|Salam...}`}
                      </button>
                       <button onClick={() => insertSpintax('Cordialement', 'Bien à vous', 'Merci')} className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded hover:bg-purple-100 transition-colors font-medium">
                         {`{Cordialement...}`}
                      </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                      Astuce Anti-Ban : Utilisez les variations {'{A|B}'} pour que chaque message soit unique.
                  </p>
               </div>
               
               <textarea 
                value={template} 
                onChange={(e) => setTemplate(e.target.value)} 
                className="w-full flex-1 min-h-[200px] p-4 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none shadow-inner resize-none" 
                placeholder="Bonjour Dr {{Nom}}..." 
               />
               
               <div className="mt-2 text-xs text-slate-500 flex justify-between font-medium">
                 <span>Spintax : <code>{`{Bonjour|Salam}`}</code></span>
                 <span className={template.length > 1000 ? "text-red-500" : ""}>{template.length} chars</span>
               </div>
            </div>

            <div className="p-8 bg-slate-100 flex flex-col items-center justify-center">
               <div className="flex justify-between w-full max-w-[320px] mb-4">
                   <h3 className="font-bold text-slate-400 text-sm uppercase tracking-widest">Aperçu WhatsApp</h3>
                   <button 
                    onClick={() => { setPreviewIndex(-1); setRefreshTrigger(r => r + 1); }} 
                    className="flex items-center gap-1 text-xs font-bold text-purple-600 bg-purple-100 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                   >
                       <Shuffle size={12} />
                       Variante Aléatoire
                   </button>
               </div>
               
               {/* IMPROVED WHATSAPP PREVIEW */}
               <div className="w-[320px] bg-[#ECE5DD] rounded-[30px] overflow-hidden shadow-2xl border-8 border-slate-800 relative flex flex-col h-[550px]">
                  {/* iPhone Top Bar */}
                  <div className="h-6 bg-[#008069] w-full flex justify-between items-center px-4">
                      <div className="text-[10px] text-white font-medium">12:30</div>
                      <div className="flex gap-1">
                          <div className="w-3 h-3 bg-white/20 rounded-full"></div>
                          <div className="w-3 h-3 bg-white/20 rounded-full"></div>
                      </div>
                  </div>

                  {/* Header */}
                  <div className="bg-[#008069] px-3 py-2 flex items-center gap-2 shadow-sm z-10">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                          <Users size={16} />
                      </div>
                      <div className="flex-1 text-white">
                          <div className="font-bold text-sm truncate w-32">
                              {currentPreview.row ? (getMappedValue(currentPreview.row, 'Nom') || 'Dr Alami') : 'Dr Alami'}
                          </div>
                          <div className="text-[10px] opacity-80">en ligne</div>
                      </div>
                  </div>

                  {/* Chat Area */}
                  <div className="flex-1 p-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] opacity-90 flex flex-col justify-end">
                      {/* Message Bubble (Sent) */}
                      <div className="self-end bg-[#E7FFDB] p-2 pl-3 pr-2 rounded-lg rounded-tr-none shadow-sm max-w-[85%] text-sm text-[#111b21] leading-snug relative mb-2">
                          <p className="whitespace-pre-wrap mb-1">{currentPreview.text}</p>
                          <div className="flex justify-end items-center gap-1">
                              <span className="text-[10px] text-[#667781]">12:31</span>
                              <CheckCircle2 size={12} className="text-[#53bdeb]" /> {/* Blue ticks */}
                          </div>
                          
                          {/* Triangle tip */}
                          <div className="absolute top-0 -right-2 w-0 h-0 border-t-[10px] border-t-[#E7FFDB] border-r-[10px] border-r-transparent"></div>
                      </div>
                  </div>
                  
                  {/* Bottom Bar Input Mock */}
                  <div className="bg-[#f0f2f5] px-2 py-2 flex items-center gap-2">
                       <div className="w-6 h-6 rounded-full bg-slate-300"></div>
                       <div className="flex-1 h-8 bg-white rounded-full"></div>
                       <div className="w-8 h-8 rounded-full bg-[#008069] flex items-center justify-center text-white">
                           <PlayCircle size={16} fill="white" />
                       </div>
                  </div>
               </div>
               
               <p className="text-center text-xs text-slate-400 mt-4 max-w-xs">
                   Ce message inclura également des caractères invisibles aléatoires pour éviter la détection de Hash par Meta.
               </p>

               {/* TEST MESSAGE SECTION */}
               <div className="w-full max-w-sm mt-4">
                  {showTestInput ? (
                      <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 animate-in fade-in slide-in-from-bottom-2">
                          <label className="text-xs font-bold text-slate-600 mb-1 block">Votre numéro de test :</label>
                          <div className="flex gap-2">
                              <input 
                                autoFocus
                                type="text" 
                                placeholder="2126..." 
                                className="flex-1 border rounded p-2 text-sm"
                                value={testPhone}
                                onChange={e => setTestPhone(e.target.value)}
                              />
                              <button onClick={handleSendTest} disabled={isSendingTest} className="bg-slate-800 text-white px-3 rounded text-xs font-bold disabled:opacity-50">
                                  {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : 'Envoyer'}
                              </button>
                          </div>
                          <button onClick={() => setShowTestInput(false)} className="text-[10px] text-slate-400 mt-2 underline text-center w-full">Annuler</button>
                      </div>
                  ) : (
                      <button onClick={() => setShowTestInput(true)} className="w-full py-2 bg-white border border-slate-300 rounded-lg text-slate-600 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-2">
                          <Phone size={14} /> M'envoyer un test maintenant
                      </button>
                  )}
               </div>

               <div className="w-full max-w-sm mt-4 space-y-3">
                 <div className="flex gap-3">
                    <button onClick={() => setStep(3)} className="flex-1 py-3 border border-slate-300 bg-white rounded-lg text-slate-700 font-medium hover:bg-slate-50">Retour</button>
                    <button onClick={handleLaunch} disabled={isLaunching} className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-70 disabled:cursor-not-allowed">
                        {isLaunching ? <Loader2 className="animate-spin" /> : <PlayCircle size={18} />}
                        {isLaunching ? 'Lancement...' : 'Lancer la Campagne'}
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