import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Trash2, Users, Calendar, Search, Loader2, Database, ArrowLeft, Plus, Edit2, Save, X, ChevronLeft, ChevronRight, Phone } from 'lucide-react';

export const Lists: React.FC = () => {
    // VIEW STATE: 'list' (grid) or 'detail' (table)
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    const [selectedList, setSelectedList] = useState<any>(null);

    // LISTS STATE
    const [lists, setLists] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // DETAIL STATE
    const [listItems, setListItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemSearch, setItemSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;
    
    // EDIT STATE
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<any>({});
    
    // ADD STATE
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newContact, setNewContact] = useState({ nom: '', numero: '', ville: '', url: '', specialite: '' });

    useEffect(() => {
        loadLists();
    }, []);

    const loadLists = async () => {
        setLoading(true);
        try {
            const data = await api.getContactLists();
            setLists(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectList = async (list: any) => {
        setSelectedList(list);
        setViewMode('detail');
        setLoadingItems(true);
        setCurrentPage(1);
        try {
            const items = await api.getListItems(list.id);
            // Items arrive as { id, phone, data: { Nom:..., Ville:... } }
            setListItems(items);
        } catch (e) {
            alert("Erreur chargement contacts");
        } finally {
            setLoadingItems(false);
        }
    };

    const handleBack = () => {
        setViewMode('list');
        setSelectedList(null);
        setListItems([]);
        loadLists(); // Reload to refresh counts
    };

    const handleDeleteList = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (!confirm(`Êtes-vous sûr de vouloir supprimer la liste "${name}" ?`)) return;
        
        setDeletingId(id);
        try {
            await api.deleteContactList(id);
            setLists(prev => prev.filter(l => l.id !== id));
        } catch (e) {
            alert("Erreur lors de la suppression");
        } finally {
            setDeletingId(null);
        }
    };

    // --- ITEM ACTIONS ---

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm("Supprimer ce contact ?")) return;
        try {
            await api.deleteListItem(itemId);
            setListItems(prev => prev.filter(i => i.id !== itemId));
        } catch (e) {
            alert("Erreur suppression");
        }
    };

    const startEditing = (item: any) => {
        setEditingItemId(item.id);
        // Flatten structure for editing: { nom, ville, ... }
        setEditValues({
            phone: item.phone,
            ...item.data
        });
    };

    const saveEdit = async (itemId: string) => {
        try {
            // Reconstruct payload
            const phone = editValues.phone;
            const data = { ...editValues };
            delete data.phone; // phone is separate

            await api.updateListItem(itemId, phone, data);
            
            // Update local state
            setListItems(prev => prev.map(item => {
                if (item.id === itemId) {
                    return { ...item, phone, data };
                }
                return item;
            }));
            setEditingItemId(null);
        } catch (e) {
            alert("Erreur modification");
        }
    };

    const handleAddContact = async () => {
        if (!newContact.numero) return alert("Numéro requis");
        try {
            const payloadData = {
                Nom: newContact.nom,
                Ville: newContact.ville,
                URL: newContact.url,
                Spécialité: newContact.specialite
            };
            const addedItem = await api.addListItem(selectedList.id, newContact.numero, payloadData);
            setListItems([addedItem, ...listItems]);
            setIsAddModalOpen(false);
            setNewContact({ nom: '', numero: '', ville: '', url: '', specialite: '' });
        } catch (e) {
            alert("Erreur ajout");
        }
    };

    // --- RENDER HELPERS ---

    const filteredLists = lists.filter(l => 
        l.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredItems = listItems.filter(item => {
        const search = itemSearch.toLowerCase();
        return (
            (item.phone && item.phone.includes(search)) ||
            (item.data?.Nom && item.data.Nom.toLowerCase().includes(search)) ||
            (item.data?.Ville && item.data.Ville.toLowerCase().includes(search))
        );
    });

    const totalPages = Math.ceil(filteredItems.length / rowsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    // --- MAIN RENDER ---

    if (viewMode === 'detail' && selectedList) {
        return (
            <div className="max-w-6xl mx-auto space-y-6 pb-20">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">{selectedList.name}</h2>
                        <p className="text-slate-500 text-sm flex items-center gap-2">
                             <Users size={14} /> {listItems.length} Contacts
                        </p>
                    </div>
                    <div className="ml-auto flex gap-2">
                         <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Rechercher contact..." 
                                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                                value={itemSearch}
                                onChange={e => setItemSearch(e.target.value)}
                            />
                        </div>
                        <button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm">
                            <Plus size={16} /> Ajouter
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    {loadingItems ? (
                         <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-blue-500"/></div>
                    ) : (
                        <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="p-4 w-16 text-center">#</th>
                                        <th className="p-4">Nom</th>
                                        <th className="p-4">Numéro (WhatsApp)</th>
                                        <th className="p-4">Ville</th>
                                        <th className="p-4">URL</th>
                                        <th className="p-4">Spécialité</th>
                                        <th className="p-4 text-center w-24">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedItems.map((item, i) => {
                                        const isEditing = editingItemId === item.id;
                                        const realIndex = (currentPage - 1) * rowsPerPage + i;

                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50 group">
                                                <td className="p-4 text-center text-slate-400 font-mono text-xs">{realIndex + 1}</td>
                                                
                                                {/* NOM */}
                                                <td className="p-4 font-medium text-slate-900">
                                                    {isEditing ? (
                                                        <input className="w-full p-1 border rounded" value={editValues.Nom || ''} onChange={e => setEditValues({...editValues, Nom: e.target.value})} />
                                                    ) : (item.data?.Nom || '-')}
                                                </td>

                                                {/* PHONE */}
                                                <td className="p-4 font-mono text-slate-600">
                                                    {isEditing ? (
                                                        <input className="w-full p-1 border rounded" value={editValues.phone || ''} onChange={e => setEditValues({...editValues, phone: e.target.value})} />
                                                    ) : (item.phone)}
                                                </td>

                                                {/* VILLE */}
                                                <td className="p-4">
                                                    {isEditing ? (
                                                        <input className="w-full p-1 border rounded" value={editValues.Ville || ''} onChange={e => setEditValues({...editValues, Ville: e.target.value})} />
                                                    ) : (item.data?.Ville || '-')}
                                                </td>

                                                {/* URL */}
                                                <td className="p-4 text-blue-600 truncate max-w-[150px]">
                                                    {isEditing ? (
                                                        <input className="w-full p-1 border rounded" value={editValues.URL || ''} onChange={e => setEditValues({...editValues, URL: e.target.value})} />
                                                    ) : (item.data?.URL || '-')}
                                                </td>

                                                 {/* SPECIALITE */}
                                                 <td className="p-4">
                                                    {isEditing ? (
                                                        <input className="w-full p-1 border rounded" value={editValues.Spécialité || ''} onChange={e => setEditValues({...editValues, Spécialité: e.target.value})} />
                                                    ) : (
                                                        item.data?.Spécialité ? <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{item.data.Spécialité}</span> : '-'
                                                    )}
                                                </td>

                                                {/* ACTIONS */}
                                                <td className="p-4 text-center">
                                                    {isEditing ? (
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => saveEdit(item.id)} className="text-emerald-600 hover:text-emerald-700"><Save size={16}/></button>
                                                            <button onClick={() => setEditingItemId(null)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEditing(item)} className="text-blue-400 hover:text-blue-600"><Edit2 size={16}/></button>
                                                            <button onClick={() => handleDeleteItem(item.id)} className="text-red-300 hover:text-red-500"><Trash2 size={16}/></button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedItems.length === 0 && (
                                        <tr><td colSpan={7} className="p-8 text-center text-slate-500">Aucun contact trouvé.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="border-t border-slate-200 p-3 bg-slate-50 flex justify-between items-center">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1 text-xs font-bold disabled:opacity-50"><ChevronLeft size={14} /> Précédent</button>
                            <span className="text-xs text-slate-500 font-medium">Page {currentPage} sur {totalPages || 1}</span>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1 text-xs font-bold disabled:opacity-50">Suivant <ChevronRight size={14} /></button>
                        </div>
                        </>
                    )}
                </div>

                {/* ADD MODAL */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-900">Ajouter un contact</h3>
                                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nom</label>
                                    <input type="text" className="w-full p-2 border rounded" placeholder="Dr Alami" value={newContact.nom} onChange={e => setNewContact({...newContact, nom: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Numéro (WhatsApp)*</label>
                                    <input type="text" className="w-full p-2 border rounded" placeholder="2126..." value={newContact.numero} onChange={e => setNewContact({...newContact, numero: e.target.value})} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ville</label>
                                        <input type="text" className="w-full p-2 border rounded" placeholder="Rabat" value={newContact.ville} onChange={e => setNewContact({...newContact, ville: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Spécialité</label>
                                        <input type="text" className="w-full p-2 border rounded" placeholder="Généraliste" value={newContact.specialite} onChange={e => setNewContact({...newContact, specialite: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">URL Dossier</label>
                                    <input type="text" className="w-full p-2 border rounded" placeholder="https://..." value={newContact.url} onChange={e => setNewContact({...newContact, url: e.target.value})} />
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3 justify-end">
                                <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
                                <button onClick={handleAddContact} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700">Ajouter</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // LIST GRID VIEW
    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Database className="text-purple-600" />
                        Mes Audiences
                    </h2>
                    <p className="text-slate-500 text-sm">Gérez vos listes de contacts importées.</p>
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Rechercher une liste..." 
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
            ) : filteredLists.length === 0 ? (
                <div className="text-center p-16 bg-white rounded-xl border border-slate-200 border-dashed">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">Aucune liste trouvée</h3>
                    <p className="text-slate-500 text-sm mt-1">Importez un fichier CSV lors de la création d'une campagne pour sauvegarder une liste.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredLists.map((list) => (
                        <div key={list.id} onClick={() => handleSelectList(list)} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden cursor-pointer">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg">
                                    <Users size={20} className="text-purple-600" />
                                </div>
                                <button 
                                    onClick={(e) => handleDeleteList(e, list.id, list.name)}
                                    disabled={deletingId === list.id}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    {deletingId === list.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                </button>
                            </div>
                            
                            <h3 className="font-bold text-lg text-slate-900 mb-1 truncate">{list.name}</h3>
                            
                            <div className="flex items-center gap-4 text-xs text-slate-500 mt-4 border-t border-slate-50 pt-3">
                                <span className="flex items-center gap-1 font-medium bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                    {list.total_contacts} contacts
                                </span>
                                <span className="flex items-center gap-1 ml-auto">
                                    <Calendar size={12} />
                                    {new Date(list.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};