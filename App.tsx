import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { InventoryItem, Category, AppSettings, CardOptions } from './types';
import { IconMap } from './components/Icons';
import { getAIInsights, getMapsInsights, MapGroundingLink } from './services/geminiService';
import { LatLng } from '@google/genai'; // Import LatLng type

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Gado de Corte', icon: 'cow' },
  { id: 'cat-2', name: 'Maquinário', icon: 'tractor' },
  { id: 'cat-3', name: 'Insumos', icon: 'wheat' },
];

const DEFAULT_CARD_OPTIONS: CardOptions = {
  showPhoto: true,
  showRef: true,
  showQuantity: true,
  showDate: false,
  showCheckbox: true,
};

const THEMES = {
  emerald: { primary: 'bg-emerald-600', hover: 'hover:bg-emerald-700', dark: 'bg-emerald-900', text: 'text-emerald-700', light: 'bg-emerald-50', border: 'border-emerald-500', shadow: 'shadow-emerald-100' },
  blue: { primary: 'bg-blue-600', hover: 'hover:bg-blue-700', dark: 'bg-blue-900', text: 'text-blue-700', light: 'bg-blue-50', border: 'border-blue-500', shadow: 'shadow-blue-100' },
  amber: { primary: 'bg-amber-600', hover: 'hover:bg-amber-700', dark: 'bg-amber-900', text: 'text-amber-700', light: 'bg-amber-50', border: 'border-amber-500', shadow: 'shadow-amber-100' },
  slate: { primary: 'bg-slate-600', hover: 'hover:bg-slate-700', dark: 'bg-slate-900', text: 'text-slate-700', light: 'bg-slate-50', border: 'border-slate-500', shadow: 'shadow-slate-100' },
  rose: { primary: 'bg-rose-600', hover: 'hover:bg-rose-700', dark: 'bg-rose-900', text: 'text-rose-700', light: 'bg-rose-50', border: 'border-rose-500', shadow: 'shadow-rose-100' },
  brown: { primary: 'bg-orange-800', hover: 'hover:bg-orange-900', dark: 'bg-orange-950', text: 'text-orange-900', light: 'bg-orange-50', border: 'border-orange-800', shadow: 'shadow-orange-100' },
};

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('agro_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('agro_items');
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('agro_settings');
    const parsed = saved ? JSON.parse(saved) : {};
    
    const defaultBg = 'https://images.unsplash.com/photo-1596733430284-f7437764b1a9?q=80&w=2070&auto=format&fit=crop';
    
    return { 
      theme: 'emerald', 
      farmName: 'AgroGestão Pro', 
      ...parsed,
      backgroundImage: parsed.backgroundImage || defaultBg,
      cardOptions: { ...DEFAULT_CARD_OPTIONS, ...(parsed.cardOptions || {}) }
    };
  });

  const currentTheme = THEMES[settings.theme || 'emerald'];
  const cardOptions = { ...DEFAULT_CARD_OPTIONS, ...(settings.cardOptions || {}) };

  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id || '');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [mapsInsight, setMapsInsight] = useState<{ text: string; links: MapGroundingLink[] } | null>(null);
  const [isLoadingMapsInsight, setIsLoadingMapsInsight] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [syncCode, setSyncCode] = useState('');
  const [isShowingActiveCategoryItemsList, setIsShowingActiveCategoryItemsList] = useState(false); // New state for item list modal
  const [isImageModalOpen, setIsImageModalOpen] = useState(false); // New state for image modal
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null); // New state for selected image URL

  useEffect(() => localStorage.setItem('agro_categories', JSON.stringify(categories)), [categories]);
  useEffect(() => localStorage.setItem('agro_items', JSON.stringify(items)), [items]);
  useEffect(() => localStorage.setItem('agro_settings', JSON.stringify(settings)), [settings]);

  const filteredItems = useMemo(() => items.filter(item => item.categoryId === activeCategoryId), [items, activeCategoryId]);
  const selectedTotal = useMemo(() => items.filter(item => item.isSelectedForSum).reduce((acc, curr) => acc + curr.quantity, 0), [items]);

  const fetchGeolocation = useCallback(() => {
    setGettingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setGettingLocation(false);
        },
        (error) => {
          console.error("Erro ao obter geolocalização:", error);
          alert(`Não foi possível obter sua localização: ${error.message}. As informações de mapa podem ser menos precisas.`);
          setUserLocation(null);
          setGettingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      alert("Geolocalização não é suportada por este navegador.");
      setUserLocation(null);
      setGettingLocation(false);
    }
  }, []);

  useEffect(() => {
    // Attempt to get location once on component mount for initial setup
    if (!userLocation && !gettingLocation) {
      fetchGeolocation();
    }
  }, [userLocation, gettingLocation, fetchGeolocation]);


  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const photoFile = formData.get('photo') as File;
    const save = (photo?: string) => {
      const newItem: InventoryItem = {
        id: crypto.randomUUID(),
        name: formData.get('name') as string,
        quantity: parseInt(formData.get('quantity') as string) || 0,
        photo,
        categoryId: activeCategoryId,
        createdAt: Date.now(),
        isSelectedForSum: true,
      };
      setItems(prev => [...prev, newItem]);
      setIsAddingItem(false);
    };
    if (photoFile?.size > 0) {
      const reader = new FileReader();
      reader.onloadend = () => save(reader.result as string);
      reader.readAsDataURL(photoFile);
    } else save();
  };

  const deleteCategory = (id: string) => {
    const category = categories.find(c => c.id === id);
    if (!category) return;
    
    if (confirm(`⚠️ ATENÇÃO: Excluir a aba "${category.name}" apagará permanentemente TODOS os itens dentro dela. Deseja continuar?`)) {
      setItems(prev => prev.filter(item => item.categoryId !== id));
      const newCats = categories.filter(c => c.id !== id);
      setCategories(newCats);
      if (activeCategoryId === id) {
        setActiveCategoryId(newCats.length > 0 ? newCats[0].id : '');
      }
    }
  };

  const handleUpdateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCategory) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('catName') as string;
    const icon = formData.get('catIcon') as string;

    setCategories(prev => prev.map(c => 
      c.id === editingCategory.id ? { ...c, name, icon } : c
    ));
    setEditingCategory(null);
  };

  const handleUpdateFarmName = () => {
    const newName = prompt('Digite o novo nome para sua planilha/fazenda/lavoura:', settings.farmName);
    if (newName !== null) {
      setSettings(prev => ({ ...prev, farmName: newName }));
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSettings(prev => ({ ...prev, backgroundImage: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleExportData = () => {
    const data = JSON.stringify({ categories, items, settings });
    const encoded = btoa(unescape(encodeURIComponent(data)));
    setSyncCode(encoded);
    const mailto = `mailto:${settings.userEmail || ''}?subject=Sincronização ${settings.farmName}&body=Código de sincronização: %0D%0A%0D%0A${encoded}`;
    window.open(mailto);
  };

  const handleImportData = (code: string) => {
    try {
      const decoded = decodeURIComponent(escape(atob(code)));
      const parsed = JSON.parse(decoded);
      if (parsed.categories && parsed.items) {
        setCategories(parsed.categories);
        setItems(parsed.items);
        if (parsed.settings) setSettings(parsed.settings);
        if (parsed.categories.length > 0) setActiveCategoryId(parsed.categories[0].id);
        alert('Dados sincronizados com sucesso!');
        setSyncCode('');
      }
    } catch (e) {
      alert('Código de sincronização inválido.');
    }
  };

  const toggleCardOption = (key: keyof CardOptions) => {
    setSettings(prev => ({
      ...prev,
      cardOptions: {
        ...DEFAULT_CARD_OPTIONS,
        ...(prev.cardOptions || {}),
        [key]: !prev.cardOptions?.[key]
      }
    }));
  };

  const handleGetMapsInsights = async () => {
    if (!userLocation && !gettingLocation) {
      alert('Sua localização é necessária para esta função. Por favor, permita o acesso à geolocalização.');
      fetchGeolocation();
      return;
    }
    
    const query = prompt('O que você gostaria de explorar no mapa? (Ex: "restaurantes italianos", "farmácias próximas")');
    if (!query) return;

    setIsLoadingMapsInsight(true);
    setMapsInsight(null); // Clear previous insights
    const res = await getMapsInsights(query, userLocation || undefined);
    setMapsInsight(res);
    setIsLoadingMapsInsight(false);
    
    if (res.text.includes("Erro de API")) {
      // Logic for API key selection if needed (as per guidelines for Veo)
      // For Google Maps, API key issue might be a general setup or billing problem.
      // AISTUDIO SDK specific behavior for prompting user to select a key for Veo might not directly apply here for Maps,
      // but the general idea of informing the user about billing is good.
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        alert('A ferramenta de Mapas pode exigir uma chave de API paga e com faturamento ativado. Abrindo seletor de chave.');
        await window.aistudio.openSelectKey();
      } else {
        alert('Por favor, certifique-se de que sua chave de API está configurada corretamente e o faturamento está ativado para o Google Maps Platform no seu projeto Google Cloud.');
      }
    }
  };


  return (
    <div className="relative min-h-screen flex flex-col md:flex-row overflow-hidden">
      {/* Dynamic Background */}
      {settings.backgroundImage && (
        <div 
          className="fixed inset-0 z-0 bg-cover bg-center transition-opacity duration-1000"
          style={{ backgroundImage: `url(${settings.backgroundImage})` }}
        >
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px]"></div>
        </div>
      )}

      {/* Sidebar - Desktop */}
      <aside className={`relative z-10 hidden md:flex flex-col w-72 ${currentTheme.dark} text-white p-6 shadow-2xl backdrop-blur-md sticky top-0 h-screen border-r border-white/10`}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={handleUpdateFarmName}>
            <div className="bg-white p-2 rounded-lg text-gray-900 shadow-lg group-hover:scale-110 transition-transform">
              <i className="fa-solid fa-cow text-2xl"></i>
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tight uppercase leading-none">
                 {settings.farmName || 'AgroGestão'}
              </h1>
              <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest mt-1 group-hover:opacity-100 transition-opacity">Alterar Nome <i className="fa-solid fa-pen ml-1"></i></span>
            </div>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <i className="fa-solid fa-gear"></i>
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
          {categories.map(cat => {
            const count = items.filter(i => i.categoryId === cat.id).length;
            const itemsInThisCategory = items.filter(i => i.categoryId === cat.id); // Get items for this category

            return (
              <div key={cat.id} className="group relative">
                <button
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    activeCategoryId === cat.id 
                    ? `${currentTheme.primary} text-white shadow-lg translate-x-1 border border-white/20` 
                    : 'hover:bg-white/10 text-white/80'
                  }`}
                >
                  <div className="flex items-center gap-3 w-full">
                    {IconMap[cat.icon] || IconMap.box}
                    <span className="font-semibold truncate flex-1 text-left">{cat.name}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${activeCategoryId === cat.id ? 'bg-white/20' : 'bg-black/20'}`}>
                      {count}
                    </span>
                  </div>
                </button>
                
                {/* Item List Popover - Desktop */}
                {count > 0 && (
                  <div className="absolute left-full top-0 ml-4 hidden group-hover:block z-20 bg-white/95 backdrop-blur-md text-gray-800 rounded-xl shadow-xl p-3 min-w-[150px] max-h-48 overflow-y-auto border border-gray-100 ring-2 ring-inset ring-transparent group-hover:ring-emerald-200 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto">
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2 border-b pb-1 border-gray-200">Itens em {cat.name}</p>
                    <ul className="space-y-1 text-sm font-medium">
                      {itemsInThisCategory.map(item => (
                        <li key={item.id} className="text-gray-700 truncate">{item.name} ({item.quantity})</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); }}
                    className="bg-white/20 hover:bg-white/40 p-2 rounded-lg text-xs"
                  >
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                    className="bg-red-500/80 hover:bg-red-600 p-2 rounded-lg text-xs"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            );
          })}
          <button 
            onClick={() => setIsAddingCategory(true)}
            className="w-full flex items-center gap-3 p-4 text-white/50 hover:text-white border-2 border-dashed border-white/20 rounded-xl hover:border-white/40 transition-all mt-4"
          >
            <i className="fa-solid fa-plus-circle"></i>
            <span className="font-bold">Nova Aba</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="bg-white/10 rounded-2xl p-4 mb-4 border border-white/5">
            <p className="text-[10px] text-white/50 uppercase font-black tracking-widest mb-1">Total Selecionado</p>
            <p className="text-4xl font-black text-white">{selectedTotal}</p>
          </div>
          <button 
            onClick={async () => {
              setIsLoadingInsight(true);
              const res = await getAIInsights({ categories, items });
              setAiInsight(res);
              setIsLoadingInsight(false);
            }}
            disabled={isLoadingInsight}
            className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-amber-900/20 uppercase text-xs tracking-widest mb-3"
          >
            {isLoadingInsight ? <i className="fa-solid fa-spinner fa-spin text-lg"></i> : <i className="fa-solid fa-wand-magic-sparkles text-lg"></i>}
            Análise IA
          </button>
          <button 
            onClick={handleGetMapsInsights}
            disabled={isLoadingMapsInsight || gettingLocation}
            className="w-full bg-blue-500 hover:bg-blue-600 text-blue-50 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-900/20 uppercase text-xs tracking-widest"
          >
            {isLoadingMapsInsight || gettingLocation ? <i className="fa-solid fa-spinner fa-spin text-lg"></i> : <i className="fa-solid fa-map-location-dot text-lg"></i>}
            {gettingLocation ? 'Obtendo Localização...' : 'Explorar Mapa'}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className={`relative z-20 md:hidden ${currentTheme.dark} text-white p-4 sticky top-0 flex items-center justify-between shadow-xl`}>
        <div className="flex items-center gap-2" onClick={handleUpdateFarmName}>
           <i className="fa-solid fa-cow text-xl"></i> 
           <h1 className="font-black uppercase text-sm tracking-tighter truncate max-w-[150px]">{settings.farmName || 'AgroGestão'}</h1>
           <i className="fa-solid fa-pen text-[10px] opacity-50"></i>
        </div>
        <div className="flex items-center gap-3">
           <span className="bg-black/20 px-3 py-1 rounded-full text-xs font-bold text-white">Total: {selectedTotal}</span>
           <button onClick={() => setIsSettingsOpen(true)} className="p-1"><i className="fa-solid fa-gear"></i></button>
           <button 
             onClick={handleGetMapsInsights}
             disabled={isLoadingMapsInsight || gettingLocation}
             className="p-1 text-white hover:text-blue-200 transition-colors"
           >
             {isLoadingMapsInsight || gettingLocation ? <i className="fa-solid fa-spinner fa-spin text-lg"></i> : <i className="fa-solid fa-map-location-dot text-lg"></i>}
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 p-4 md:p-10 overflow-y-auto no-scrollbar">
        {/* Mobile Category Scroll */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-4 no-scrollbar mb-4">
          {categories.map(cat => {
            const count = items.filter(i => i.categoryId === cat.id).length;
            return (
              <div key={cat.id} className="relative inline-block group">
                <button
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 ${
                    activeCategoryId === cat.id 
                    ? `${currentTheme.primary} text-white scale-105 border border-white/20` 
                    : 'bg-white/80 backdrop-blur-md text-gray-800 border border-gray-100'
                  }`}
                >
                  {cat.name}
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeCategoryId === cat.id ? 'bg-white/20' : 'bg-gray-200 text-gray-600'}`}>
                    {count}
                  </span>
                </button>
                {activeCategoryId === cat.id && (
                  <div className="absolute -top-3 -right-2 flex gap-1">
                    <button 
                      onClick={() => setEditingCategory(cat)}
                      className="bg-white shadow-lg p-2 rounded-full text-[12px] text-gray-600 border border-gray-100"
                    >
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button 
                      onClick={() => deleteCategory(cat.id)}
                      className="bg-red-500 shadow-lg p-2 rounded-full text-[12px] text-white border border-red-400"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => setIsAddingCategory(true)} className="bg-white/50 text-gray-700 px-4 py-2 rounded-full border border-gray-100">
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>

        {/* AI Insight */}
        {aiInsight && (
          <div className="mb-8 bg-amber-50/90 backdrop-blur-md border-l-4 border-amber-500 shadow-xl rounded-2xl p-6 relative animate-in slide-in-from-top duration-500">
            <button onClick={() => setAiInsight(null)} className="absolute top-4 right-4 text-amber-900/50 hover:text-amber-900">
              <i className="fa-solid fa-circle-xmark text-xl"></i>
            </button>
            <h3 className="text-amber-800 font-black flex items-center gap-2 mb-3 uppercase text-sm tracking-widest">
              <i className="fa-solid fa-lightbulb"></i> Insights do Consultor IA
            </h3>
            <div className="text-amber-950 text-sm leading-relaxed whitespace-pre-line font-medium">
              {aiInsight}
            </div>
          </div>
        )}

        {/* Maps Insight */}
        {mapsInsight && (
          <div className="mb-8 bg-blue-50/90 backdrop-blur-md border-l-4 border-blue-500 shadow-xl rounded-2xl p-6 relative animate-in slide-in-from-top duration-500">
            <button onClick={() => setMapsInsight(null)} className="absolute top-4 right-4 text-blue-900/50 hover:text-blue-900">
              <i className="fa-solid fa-circle-xmark text-xl"></i>
            </button>
            <h3 className="text-blue-800 font-black flex items-center gap-2 mb-3 uppercase text-sm tracking-widest">
              <i className="fa-solid fa-map-location-dot"></i> Informações do Mapa
            </h3>
            <div className="text-blue-950 text-sm leading-relaxed whitespace-pre-line font-medium mb-4">
              {mapsInsight.text}
            </div>
            {mapsInsight.links.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-blue-700 font-bold uppercase tracking-widest">Links Relevantes:</p>
                {mapsInsight.links.map((link, index) => (
                  <div key={index} className="flex items-start gap-2">
                    {link.snippet ? (
                      <i className="fa-solid fa-quote-left text-blue-400 mt-1"></i>
                    ) : (
                      <i className="fa-solid fa-link text-blue-400 mt-1"></i>
                    )}
                    <a 
                      href={link.uri} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-700 hover:text-blue-900 hover:underline text-sm font-medium leading-tight"
                    >
                      {link.snippet || link.title || link.uri}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4 bg-white/40 p-6 rounded-3xl backdrop-blur-sm border border-white/30 shadow-sm">
          <div>
            <div className="flex items-center gap-4 flex-wrap">
              <h2 
                className="text-4xl font-black text-gray-900 tracking-tighter mb-1 cursor-pointer hover:text-gray-700 transition-colors flex items-center gap-3"
                onClick={() => activeCategoryId && setIsShowingActiveCategoryItemsList(true)}
              >
                {categories.find(c => c.id === activeCategoryId)?.name || 'Crie uma Aba'}
                {activeCategoryId && <i className="fa-solid fa-list text-2xl text-gray-400 hover:text-gray-600"></i>}
              </h2>
              {activeCategoryId && (
                <div className="flex gap-2 mb-1">
                  <button 
                    onClick={() => setEditingCategory(categories.find(c => c.id === activeCategoryId)!)}
                    className="text-gray-400 hover:text-emerald-600 p-2 bg-white/60 rounded-xl transition-colors shadow-sm"
                    title="Editar nome da aba"
                  >
                    <i className="fa-solid fa-pen-to-square text-xl"></i>
                  </button>
                  <button 
                    onClick={() => deleteCategory(activeCategoryId)}
                    className="text-gray-400 hover:text-red-600 p-2 bg-white/60 rounded-xl transition-colors shadow-sm"
                    title="Excluir esta aba"
                  >
                    <i className="fa-solid fa-trash text-xl"></i>
                  </button>
                </div>
              )}
            </div>
            <p className="text-gray-500 font-semibold flex items-center gap-2">
               <i className="fa-solid fa-list-check"></i> {filteredItems.length} registros nesta categoria
            </p>
          </div>
          {activeCategoryId && (
            <button 
              onClick={() => setIsAddingItem(true)}
              className={`${currentTheme.primary} ${currentTheme.hover} text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl ${currentTheme.shadow} transition-all active:scale-95 group`}
            >
              <i className="fa-solid fa-plus-circle text-lg group-hover:rotate-90 transition-transform"></i> Adicionar Registro
            </button>
          )}
        </div>

        {/* Grid Content */}
        {!activeCategoryId || (filteredItems.length === 0 && categories.length > 0) ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white/50 backdrop-blur-sm rounded-3xl border-4 border-dashed border-gray-200/50">
            <div className="bg-gray-100 p-6 rounded-full mb-6">
                <i className={`fa-solid ${!activeCategoryId ? 'fa-folder-plus' : 'fa-box-open'} text-6xl text-gray-300`}></i>
            </div>
            <p className="text-xl font-bold text-gray-500">{!activeCategoryId ? 'Nenhuma aba selecionada' : 'Esta aba está vazia'}</p>
            <p className="text-sm">{!activeCategoryId ? 'Comece criando uma nova aba no menu lateral ou no botão de "+" acima.' : 'Adicione itens clicando no botão de registro acima.'}</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white/50 backdrop-blur-sm rounded-3xl border-4 border-dashed border-gray-200/50">
             <i className="fa-solid fa-list-ol text-6xl mb-6"></i>
             <p className="text-xl font-bold text-gray-600">Nenhuma aba cadastrada</p>
             <button onClick={() => setIsAddingCategory(true)} className={`${currentTheme.primary} text-white px-6 py-3 rounded-xl mt-4 font-black uppercase text-xs`}>Criar Primeira Aba</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
            {filteredItems.map(item => (
              <div 
                key={item.id} 
                className={`group bg-white/90 backdrop-blur-md rounded-[2rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-300 border-2 ${
                  item.isSelectedForSum && cardOptions.showCheckbox ? `${currentTheme.border} scale-[1.02] shadow-xl` : 'border-transparent'
                }`}
              >
                {cardOptions.showPhoto && (
                  <div className="h-56 bg-gray-100 relative overflow-hidden">
                    {item.photo ? (
                      <img 
                        src={item.photo} 
                        alt={item.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 cursor-pointer" 
                        onClick={() => { setSelectedImageUrl(item.photo!); setIsImageModalOpen(true); }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <i className="fa-solid fa-camera text-5xl"></i>
                      </div>
                    )}
                    {cardOptions.showRef && (
                      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
                        <span className={`text-[10px] font-black ${currentTheme.text} uppercase tracking-tighter`}>Ref: {item.id.slice(0,4)}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="p-6">
                  {/* Fallback for Ref if photo is hidden */}
                  {!cardOptions.showPhoto && cardOptions.showRef && (
                    <div className="mb-2">
                      <span className={`text-[10px] font-black text-white bg-gray-400 px-2 py-0.5 rounded-md uppercase tracking-tighter`}>Ref: {item.id.slice(0,4)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-black text-gray-800 text-xl leading-tight truncate pr-2">{item.name}</h4>
                    {cardOptions.showCheckbox && (
                      <input 
                        type="checkbox" 
                        checked={item.isSelectedForSum}
                        onChange={() => setItems(prev => prev.map(i => i.id === item.id ? { ...i, isSelectedForSum: !i.isSelectedForSum } : i))}
                        className={`w-6 h-6 rounded-lg cursor-pointer shadow-sm`}
                        style={{ accentColor: currentTheme.primary.replace('bg-', '') }}
                      />
                    )}
                  </div>

                  {cardOptions.showDate && (
                    <p className="text-xs text-gray-400 mb-4 font-medium flex items-center gap-1">
                      <i className="fa-regular fa-calendar"></i>
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}

                  <div className="flex items-end justify-between">
                    {cardOptions.showQuantity ? (
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Estoque/Qtd</p>
                        <p className={`text-3xl font-black ${currentTheme.text} leading-none`}>{item.quantity}</p>
                      </div>
                    ) : (
                      <div /> /* Spacer if quantity is hidden */
                    )}
                    
                    <button 
                      onClick={() => confirm('Excluir este item?') && setItems(prev => prev.filter(i => i.id !== item.id))}
                      className="p-3 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
             <div className={`${currentTheme.dark} p-8 text-white flex justify-between items-center`}>
                <div>
                   <h2 className="text-2xl font-black uppercase tracking-tight">Configurações</h2>
                   <p className="text-white/50 text-xs font-bold uppercase tracking-widest">Personalize sua AgroGestão</p>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="bg-white/10 p-3 rounded-full hover:bg-white/20">
                   <i className="fa-solid fa-xmark text-xl"></i>
                </button>
             </div>
             
             <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] no-scrollbar">
                {/* Farm Name Section */}
                <section>
                   <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-widest">
                      <i className={`fa-solid fa-file-signature ${currentTheme.text}`}></i> Nome da Fazenda / Planilha / Lavoura
                   </h3>
                   <div className="flex gap-2">
                     <input 
                        value={settings.farmName || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, farmName: e.target.value }))}
                        className="flex-1 p-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none font-bold text-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="Ex: Fazenda Bela Vista"
                     />
                   </div>
                </section>

                {/* Card Display Options Section */}
                <section>
                   <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-widest">
                      <i className={`fa-solid fa-layer-group ${currentTheme.text}`}></i> Personalizar Visualização (Cards)
                   </h3>
                   <div className="grid grid-cols-2 gap-3">
                     {[
                       { key: 'showPhoto', label: 'Exibir Foto', icon: 'fa-image' },
                       { key: 'showRef', label: 'Exibir Ref/ID', icon: 'fa-tag' },
                       { key: 'showQuantity', label: 'Exibir Quantidade', icon: 'fa-scale-balanced' },
                       { key: 'showDate', label: 'Exibir Data', icon: 'fa-calendar' },
                       { key: 'showCheckbox', label: 'Caixa de Seleção', icon: 'fa-check-square' },
                     ].map((opt) => (
                       <label key={opt.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
                         <div className={`w-5 h-5 flex items-center justify-center rounded border ${cardOptions[opt.key as keyof CardOptions] ? `${currentTheme.primary} border-transparent` : 'border-gray-300 bg-white'}`}>
                            {cardOptions[opt.key as keyof CardOptions] && <i className="fa-solid fa-check text-white text-xs"></i>}
                         </div>
                         <input type="checkbox" className="hidden" checked={!!cardOptions[opt.key as keyof CardOptions]} onChange={() => toggleCardOption(opt.key as keyof CardOptions)} />
                         <span className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                            <i className={`fa-solid ${opt.icon} text-gray-400`}></i> {opt.label}
                         </span>
                       </label>
                     ))}
                   </div>
                </section>

                {/* Theme Selector */}
                <section>
                   <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-widest">
                      <i className={`fa-solid fa-palette ${currentTheme.text}`}></i> Cores do Aplicativo
                   </h3>
                   <div className="grid grid-cols-3 gap-3">
                      {Object.keys(THEMES).map((themeName) => (
                        <button
                          key={themeName}
                          onClick={() => setSettings(prev => ({ ...prev, theme: themeName as any }))}
                          className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                            settings.theme === themeName ? `border-gray-900 bg-gray-50` : 'border-transparent bg-white shadow-sm'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full ${THEMES[themeName as keyof typeof THEMES].primary} shadow-inner`}></div>
                          <span className="text-[10px] font-black uppercase text-gray-400">{themeName}</span>
                        </button>
                      ))}
                   </div>
                </section>

                {/* Background Section */}
                <section>
                   <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-widest">
                      <i className={`fa-solid fa-image ${currentTheme.text}`}></i> Tela de Fundo
                   </h3>
                   <div className="flex items-center gap-4">
                      <label className="flex-1 cursor-pointer">
                         <div className="p-4 border-2 border-dashed border-gray-200 rounded-2xl hover:border-emerald-500 transition-colors flex flex-col items-center gap-2 text-center">
                            <i className="fa-solid fa-cloud-arrow-up text-2xl text-gray-400"></i>
                            <span className="text-xs font-bold text-gray-500">Escolher Imagem Personalizada</span>
                         </div>
                         <input type="file" className="hidden" accept="image/*" onChange={handleBackgroundUpload} />
                      </label>
                      {settings.backgroundImage && (
                        <button onClick={() => setSettings(prev => ({...prev, backgroundImage: ''}))} className="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-xs font-bold">Remover</button>
                      )}
                   </div>
                </section>

                {/* Sync Section */}
                <section className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                   <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-widest">
                      <i className={`fa-solid fa-rotate ${currentTheme.text}`}></i> Sincronização
                   </h3>
                   <div className="space-y-4">
                      <input 
                        placeholder="E-mail para Sincronia" 
                        className="w-full p-4 rounded-2xl bg-white border border-gray-200 text-sm outline-none"
                        value={settings.userEmail || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, userEmail: e.target.value }))}
                      />
                      <div className="flex gap-2">
                         <button onClick={handleExportData} className={`flex-1 ${currentTheme.primary} text-white p-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-opacity`}>Exportar Dados</button>
                         <button onClick={() => {
                            const code = prompt('Cole aqui o código de sincronização recebido:');
                            if (code) handleImportData(code);
                         }} className={`flex-1 bg-white border-2 p-4 rounded-2xl font-black text-xs uppercase tracking-widest`} style={{ borderColor: currentTheme.primary.replace('bg-', ''), color: currentTheme.primary.replace('bg-', '') }}>Importar Dados</button>
                      </div>
                   </div>
                </section>
             </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {isAddingItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className={`${currentTheme.primary} p-6 text-white flex justify-between items-center`}>
              <h3 className="font-black text-lg uppercase tracking-tight">Novo Registro em {categories.find(c => c.id === activeCategoryId)?.name}</h3>
              <button onClick={() => setIsAddingItem(false)} className="hover:rotate-90 transition-transform">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-5">
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Nome do Item</label>
                <input required name="name" className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none font-bold" placeholder="Ex: Vaca 01 / Trator X" />
              </div>
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Quantidade / Cabeças</label>
                <input required type="number" name="quantity" className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none font-black text-xl" placeholder="0" min="0" />
              </div>
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Foto (Opcional)</label>
                <input type="file" name="photo" accept="image/*" className="block w-full text-xs text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-gray-100" />
              </div>
              <div className="pt-6 flex gap-3">
                <button type="button" onClick={() => setIsAddingItem(false)} className="flex-1 py-4 text-gray-500 font-black uppercase text-xs tracking-widest hover:bg-gray-100 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" className={`flex-[2] py-4 ${currentTheme.primary} text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl hover:opacity-90 transition-opacity`}>Salvar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className={`${currentTheme.dark} p-6 text-white flex justify-between items-center`}>
              <h3 className="font-black uppercase tracking-widest text-sm">Configurações da Aba</h3>
              <button onClick={() => setEditingCategory(null)}><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form onSubmit={handleUpdateCategory} className="p-8 space-y-6">
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Nome da Aba</label>
                <input required name="catName" defaultValue={editingCategory.name} className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none font-bold" />
              </div>
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Mudar Ícone</label>
                <div className="grid grid-cols-4 gap-3">
                  {Object.keys(IconMap).map(iconKey => (
                    <label key={iconKey} className="cursor-pointer">
                      <input type="radio" name="catIcon" value={iconKey} defaultChecked={editingCategory.icon === iconKey} className="peer hidden" />
                      <div className={`p-4 text-center rounded-2xl bg-gray-50 border-2 border-transparent peer-checked:border-gray-900 transition-all ${currentTheme.text}`}>
                        {IconMap[iconKey]}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                 <button type="button" onClick={() => setEditingCategory(null)} className="flex-1 py-4 text-gray-500 font-black uppercase text-xs tracking-widest hover:bg-gray-100 rounded-2xl">Voltar</button>
                 <button type="submit" className={`flex-[2] py-4 ${currentTheme.dark} text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-2xl`}>Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {isAddingCategory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className={`${currentTheme.dark} p-6 text-white flex justify-between items-center`}>
              <h3 className="font-black uppercase tracking-widest text-sm">Criar Nova Aba</h3>
              <button onClick={() => setIsAddingCategory(false)}><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newCat: Category = { id: crypto.randomUUID(), name: formData.get('catName') as string, icon: formData.get('catIcon') as string };
                setCategories(prev => [...prev, newCat]);
                setIsAddingCategory(false);
                setActiveCategoryId(newCat.id);
            }} className="p-8 space-y-6">
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Título da Aba</label>
                <input required name="catName" className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none font-bold" placeholder="Ex: Touros de Elite" />
              </div>
              <div>
                <label className={`block text-[10px] font-black ${currentTheme.text} uppercase mb-2 tracking-widest`}>Ícone de Identificação</label>
                <div className="grid grid-cols-4 gap-3">
                  {Object.keys(IconMap).map(iconKey => (
                    <label key={iconKey} className="cursor-pointer">
                      <input type="radio" name="catIcon" value={iconKey} defaultChecked={iconKey === 'box'} className="peer hidden" />
                      <div className={`p-4 text-center rounded-2xl bg-gray-50 border-2 border-transparent peer-checked:border-gray-900 transition-all ${currentTheme.text}`}>
                        {IconMap[iconKey]}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className={`w-full py-5 ${currentTheme.dark} text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-2xl`}>Finalizar Criação</button>
            </form>
          </div>
        </div>
      )}

      {/* Active Category Items List Modal (Mobile and Desktop) */}
      {isShowingActiveCategoryItemsList && activeCategoryId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className={`${currentTheme.dark} p-6 text-white flex justify-between items-center`}>
              <h3 className="font-black uppercase tracking-widest text-sm">Itens em {categories.find(c => c.id === activeCategoryId)?.name}</h3>
              <button onClick={() => setIsShowingActiveCategoryItemsList(false)}><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div className="p-8 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
              {filteredItems.length === 0 ? (
                <p className="text-gray-500 text-center font-medium">Nenhum item nesta aba.</p>
              ) : (
                <ul className="space-y-3">
                  {filteredItems.map(item => (
                    <li key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      {item.photo && <img src={item.photo} alt={item.name} className="w-10 h-10 object-cover rounded-md flex-shrink-0" />}
                      <span className="font-semibold text-gray-800 flex-1 truncate">{item.name}</span>
                      <span className="text-sm font-bold text-gray-600 flex-shrink-0">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Full-screen Modal */}
      {isImageModalOpen && selectedImageUrl && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-lg z-[101] flex items-center justify-center p-4"
          onClick={() => { setIsImageModalOpen(false); setSelectedImageUrl(null); }} // Close on overlay click
        >
          <button 
            onClick={(e) => { e.stopPropagation(); setIsImageModalOpen(false); setSelectedImageUrl(null); }} 
            className="absolute top-4 right-4 bg-white/20 p-3 rounded-full text-white hover:bg-white/40 transition-colors z-[102]"
            aria-label="Fechar imagem"
          >
            <i className="fa-solid fa-xmark text-2xl"></i>
          </button>
          <div className="relative w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedImageUrl} 
              alt="Visualização em tamanho real" 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border-2 border-white/10" 
            />
          </div>
        </div>
      )}

      {/* Floating Action Button (Mobile) */}
      {activeCategoryId && (
        <button 
          onClick={() => setIsAddingItem(true)}
          className={`md:hidden fixed bottom-6 right-6 w-16 h-16 ${currentTheme.primary} text-white rounded-full shadow-2xl flex items-center justify-center z-50 animate-bounce transition-all active:scale-90`}
        >
          <i className="fa-solid fa-plus text-2xl"></i>
        </button>
      )}
    </div>
  );
};

export default App;