import React, { useState, useEffect, useRef } from 'react';
import { Disc3, Trash2, UploadCloud, AlertCircle, Search, Inbox, CheckCircle, Copy, CopyCheck, RotateCcw } from 'lucide-react';

// Types
interface AlbumItem {
  id: string;
  album: string;
  artist: string;
  copyText: string;
}

const STORAGE_KEY = 'extractor_albums_data';

export default function App() {
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [copiedIds, setCopiedIds] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<'pending' | 'completed'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedFeedbackId, setCopiedFeedbackId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.items) setItems(parsed.items);
        if (parsed.copied) setCopiedIds(parsed.copied);
      } catch (e) {
        console.error("Error loading saved data", e);
      }
    }
  }, []);

  // Save to local storage when data changes
  useEffect(() => {
    if (items.length > 0 || copiedIds.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, copied: copiedIds }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [items, copiedIds]);

  const parseCSVText = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && text[i+1] === '"') {
            currentCell += '"'; i++; 
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell); currentCell = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentCell); rows.push(currentRow);
            currentRow = []; currentCell = '';
        } else if (char === '\r') {
            continue;
        } else {
            currentCell += char;
        }
    }
    if (currentRow.length > 0 || currentCell !== '') {
        currentRow.push(currentCell); rows.push(currentRow);
    }
    return rows;
  };

  const processCSV = (csvText: string) => {
    const rows = parseCSVText(csvText);
    if (rows.length < 2) {
      setError("El archivo CSV parece estar vacío o no tiene el formato correcto.");
      return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    let artistIndex = -1, albumIndex = -1;

    headers.forEach((header, index) => {
      if (header.includes('artist')) artistIndex = index;
      if (header.includes('album')) albumIndex = index;
    });

    if (artistIndex === -1 || albumIndex === -1) {
      setError("No se pudieron encontrar las columnas 'artist' o 'album'.");
      return;
    }

    const uniqueMap = new Map<string, AlbumItem>();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length > Math.max(artistIndex, albumIndex)) {
        const artist = row[artistIndex].trim();
        const album = row[albumIndex].trim();
        if (artist && album) {
          const id = `${album}-${artist}`.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!uniqueMap.has(id)) {
            uniqueMap.set(id, {
              id,
              album,
              artist,
              copyText: `${album} ${artist} "album"`
            });
          }
        }
      }
    }

    const newItems = Array.from(uniqueMap.values()).sort((a, b) => a.album.localeCompare(b.album));
    if (newItems.length === 0) {
      setError("No se encontraron datos válidos.");
      return;
    }

    setItems(newItems);
    setCopiedIds([]);
    setSearchTerm('');
    setCurrentTab('pending');
    setError(null);
  };

  const handleFile = (file: File) => {
    setError(null);
    if (!file.name.endsWith('.csv')) {
      setError("Por favor, sube un archivo con extensión .csv");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
            processCSV(e.target.result);
        }
    };
    reader.onerror = () => setError("Error al leer el archivo.");
    reader.readAsText(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const resetData = () => {
    if (window.confirm('¿Estás seguro de que quieres borrar todos los datos guardados y empezar de nuevo?')) {
      setItems([]);
      setCopiedIds([]);
      setSearchTerm('');
      setError(null);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
  };

  const copyToClipboard = (item: AlbumItem) => {
    // Copiar al portapapeles
    if (!navigator.clipboard) {
      fallbackCopyTextToClipboard(item.copyText);
      handleCopySuccess(item.id);
    } else {
      navigator.clipboard.writeText(item.copyText).then(() => {
        handleCopySuccess(item.id);
      }, (err) => {
        console.error('Async: Could not copy text: ', err);
        fallbackCopyTextToClipboard(item.copyText);
        handleCopySuccess(item.id);
      });
    }
    // Abrir búsqueda en YouTube Music
    const query = encodeURIComponent(item.copyText.replace(/\s+/g, ' ').trim());
    const url = `https://music.youtube.com/search?q=${query}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopySuccess = (id: string) => {
      setCopiedFeedbackId(id);
      setTimeout(() => setCopiedFeedbackId(null), 1500);
      
      if (!copiedIds.includes(id)) {
          // Slight delay to allow animation to play if we wanted to
          setTimeout(() => {
              setCopiedIds(prev => [...prev, id]);
          }, 100);
      }
  };

  const restoreItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setCopiedIds(prev => prev.filter(copiedId => copiedId !== id));
  };

  const filteredPending = items.filter(item => !copiedIds.includes(item.id) && matchesSearch(item, searchTerm));
  const filteredCompleted = items.filter(item => copiedIds.includes(item.id) && matchesSearch(item, searchTerm));

  function matchesSearch(item: AlbumItem, term: string) {
    if (!term) return true;
    const lowerTerm = term.toLowerCase();
    return item.album.toLowerCase().includes(lowerTerm) || item.artist.toLowerCase().includes(lowerTerm);
  }

  return (
    <div className="min-h-screen bg-transparent font-sans text-gray-800 selection:bg-blue-200 p-2 sm:p-4">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <header className="mb-6 text-center relative">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 mb-3 shadow-sm">
            <Disc3 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-indigo-900 mb-1 tracking-tight">Álbumes a YT Music</h1>
          <p className="text-gray-500 text-sm">
            Sube tu CSV y copia cada álbum para migrar fácilmente.
          </p>
          <p className="text-xs text-indigo-400 mt-1">Formato: <code>Álbum Artista "album"</code></p>
          {items.length > 0 && (
            <button 
              onClick={resetData}
              className="absolute top-0 right-0 p-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1" 
              title="Borrar datos y subir nuevo CSV"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Reiniciar</span>
            </button>
          )}
        </header>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Drop Zone */}
        {items.length === 0 && (
          <div 
            className={`bg-white rounded-xl shadow border p-5 mb-8 text-center transition-all hover:shadow-md ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100'}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <input 
              type="file" 
              id="csv-file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileInput}
            />
            <label htmlFor="csv-file" className="cursor-pointer flex flex-col items-center justify-center space-y-3 group">
              <div className="p-3 bg-indigo-50 rounded-full text-indigo-400 group-hover:bg-indigo-100 group-hover:text-indigo-500 transition-colors">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <span className="text-indigo-600 font-semibold hover:underline">Sube tu archivo CSV</span>
                <span className="text-gray-500"> o arrástralo aquí</span>
              </div>
              <p className="text-xs text-gray-400">Solo archivos .csv</p>
            </label>
          </div>
        )}

        {/* Results Container */}
        {items.length > 0 && (
          <div>
            {/* Tabs */}
            <div className="flex border-b border-indigo-200 mb-5">
              <button 
                onClick={() => setCurrentTab('pending')}
                className={`flex-1 py-2 text-center transition-colors flex items-center justify-center gap-2 ${currentTab === 'pending' ? 'border-b-2 border-indigo-500 text-indigo-700 font-bold' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'}`}
              >
                <span>Pendientes</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                  {items.length - copiedIds.length}
                </span>
              </button>
              <button 
                onClick={() => setCurrentTab('completed')}
                className={`flex-1 py-2 text-center transition-colors flex items-center justify-center gap-2 ${currentTab === 'completed' ? 'border-b-2 border-indigo-500 text-indigo-700 font-bold' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'}`}
              >
                <span>Completados</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
                  {copiedIds.length}
                </span>
              </button>
            </div>

            <div className="relative">
              {/* Search Bar */}
              <div className="mb-4 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  placeholder="Buscar álbum o artista..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow shadow-sm"
                />
              </div>

              {/* Lists */}
              <div className="max-h-[60vh] overflow-y-auto pb-10" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <style>{`::-webkit-scrollbar { display: none; }`}</style>
                {currentTab === 'pending' && (
                  <ul className="space-y-2">
                    {filteredPending.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                        <Inbox className="w-10 h-10 mb-2 text-gray-300" />
                        <p className="text-sm">{searchTerm ? "No se encontraron coincidencias." : "¡Todo al día! No hay álbumes pendientes."}</p>
                      </div>
                    ) : (
                      filteredPending.map(item => (
                        <li 
                          key={item.id}
                          onClick={() => copyToClipboard(item)}
                          className="group relative bg-white border border-indigo-100 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all flex justify-between items-center active:scale-[0.98]"
                        >
                          <div className="break-words pr-8 flex flex-wrap gap-1 items-center">
                            <span className="font-bold text-gray-900 text-base leading-tight">{item.album}</span> 
                            <span className="text-gray-600 text-sm">{item.artist}</span> 
                            <span className="text-indigo-600 font-mono text-xs ml-1 bg-indigo-50 px-1 rounded">"album"</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className={`transition-colors p-1 ${copiedFeedbackId === item.id ? 'text-green-500' : 'text-gray-300 group-hover:text-indigo-500'}`}>
                              {copiedFeedbackId === item.id ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )}

                {currentTab === 'completed' && (
                  <ul className="space-y-2 opacity-80 hover:opacity-100 transition-opacity">
                    {filteredCompleted.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                        <CheckCircle className="w-10 h-10 mb-2 text-gray-300" />
                        <p className="text-sm">{searchTerm ? "No se encontraron coincidencias." : "Aún no has copiado ningún álbum."}</p>
                      </div>
                    ) : (
                      filteredCompleted.map(item => (
                        <li 
                          key={item.id}
                          onClick={() => copyToClipboard(item)}
                          className="group relative bg-indigo-50 border border-indigo-100 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all flex justify-between items-center active:scale-[0.98]"
                        >
                          <div className="break-words pr-8 flex flex-wrap gap-1 items-center">
                            <span className="font-bold text-gray-500 line-through text-base leading-tight">{item.album}</span> 
                            <span className="text-gray-400 text-sm">{item.artist}</span> 
                            <span className="text-indigo-600 font-mono text-xs ml-1 bg-indigo-100 px-1 rounded opacity-60">"album"</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => restoreItem(e, item.id)}
                              className="text-gray-300 hover:text-orange-500 transition-colors p-1"
                              title="Devolver a pendientes"
                            >
                              <RotateCcw className="w-5 h-5" />
                            </button>
                            <button className={`transition-colors p-1 ${copiedFeedbackId === item.id ? 'text-green-500' : 'text-gray-300 group-hover:text-indigo-500'}`}>
                              {copiedFeedbackId === item.id ? <CheckCircle className="w-5 h-5" /> : <CopyCheck className="w-5 h-5" />}
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
