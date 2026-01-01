import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, Clock, AlertCircle, Download, Filter, Search, Wifi, WifiOff } from 'lucide-react';

export default function IPChecker() {
  const [file, setFile] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTorre, setFilterTorre] = useState('all');
  const [filterComunidad, setFilterComunidad] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [backendUrl, setBackendUrl] = useState('http://127.0.0.1:3001'); // Cambiado a 127.0.0.1
  const [serverStatus, setServerStatus] = useState(null);

  useEffect(() => {
    checkServerStatus();
  }, [backendUrl]);

  const checkServerStatus = async () => {
    try {
      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const data = await response.json();
        setServerStatus({ online: true, ...data });
      } else {
        setServerStatus({ online: false });
      }
    } catch (error) {
      setServerStatus({ online: false, error: error.message });
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults(null);
      setProgress(0);
      setFilterStatus('all');
      setFilterTorre('all');
      setFilterComunidad('all');
      setSearchTerm('');
    }
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const entries = [];
    for (let line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 4) {
        const [ip, name, torre, comunidad] = parts;
        if (ip && name && torre && comunidad) {
          entries.push({ ip, name, torre, comunidad });
        }
      }
    }
    return entries;
  };

  const handleCheck = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(0);
    
    try {
      const text = await file.text();
      const entries = parseCSV(text);
      if (entries.length === 0) {
        alert('No se encontraron datos válidos. Verifica el formato del archivo.');
        setLoading(false);
        return;
      }

      const batchSize = 2; // Reducido para móviles
      const checkedEntries = [];
      
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        try {
          const response = await fetch(`${backendUrl}/api/check-multiple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ips: batch }),
            signal: AbortSignal.timeout(30000)
          });
          
          if (response.ok) {
            const batchResults = await response.json();
            checkedEntries.push(...batchResults);
          } else {
            checkedEntries.push(...batch.map(e => ({ ...e, status: 'timeout', time: 0 })));
          }
        } catch (error) {
          console.error('Error en lote:', error);
          checkedEntries.push(...batch.map(e => ({ ...e, status: 'timeout', time: 0 })));
        }
        setProgress(Math.round((checkedEntries.length / entries.length) * 100));
      }

      const summary = {
        total: checkedEntries.length,
        online: checkedEntries.filter(e => e.status === 'online').length,
        offline: checkedEntries.filter(e => e.status === 'offline').length,
        timeout: checkedEntries.filter(e => e.status === 'timeout').length
      };

      const torres = [...new Set(checkedEntries.map(e => e.torre))].sort();
      const comunidades = [...new Set(checkedEntries.map(e => e.comunidad))].sort();

      setResults({
        entries: checkedEntries,
        summary,
        torres,
        comunidades,
        timestamp: new Date().toLocaleString('es-CO')
      });
    } catch (error) {
      alert('Error al procesar el archivo: ' + error.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'online': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'offline': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'timeout': return <Clock className="w-5 h-5 text-yellow-500" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'online': return 'En línea';
      case 'offline': return 'Fuera de línea';
      case 'timeout': return 'Tiempo agotado';
      default: return 'Desconocido';
    }
  };

  const getFilteredEntries = () => {
    if (!results) return [];
    let filtered = results.entries;
    if (filterStatus !== 'all') filtered = filtered.filter(e => e.status === filterStatus);
    if (filterTorre !== 'all') filtered = filtered.filter(e => e.torre === filterTorre);
    if (filterComunidad !== 'all') filtered = filtered.filter(e => e.comunidad === filterComunidad);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.ip.toLowerCase().includes(term) || 
        e.name.toLowerCase().includes(term) ||
        e.torre.toLowerCase().includes(term) ||
        e.comunidad.toLowerCase().includes(term)
      );
    }
    return filtered;
  };

  const exportToCSV = () => {
    if (!results) return;
    const filtered = getFilteredEntries();
    const headers = ['Estado,IP,Nombre,Torre,Comunidad,Tiempo(ms)'];
    const rows = filtered.map(e => 
      `${getStatusText(e.status)},${e.ip},${e.name},${e.torre},${e.comunidad},${e.time || 0}`
    );
    const csv = headers.concat(rows).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_ips_${new Date().getTime()}.csv`;
    link.click();
  };

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterTorre('all');
    setFilterComunidad('all');
    setSearchTerm('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-3 md:p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Verificador de IPs</h1>
              <p className="text-xs text-gray-600 mt-1">Android/Termux Edition</p>
            </div>
            <div className="mt-2 md:mt-0 text-right">
              <div className="flex items-center gap-1 md:gap-2">
                {serverStatus?.online ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-green-600 font-medium">Servidor OK</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-red-600 font-medium">Sin conexión</span>
                  </>
                )}
              </div>
              <button 
                onClick={checkServerStatus}
                className="text-xs text-blue-600 underline mt-1"
              >
                Verificar
              </button>
            </div>
          </div>

          <div className="mb-3 p-2 bg-gray-50 rounded-lg">
            <label className="text-xs font-medium text-gray-700 block mb-1">URL del Servidor:</label>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="http://127.0.0.1:3001"
            />
          </div>

          <div className="mb-4">
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <div className="flex flex-col items-center justify-center pt-3 pb-3">
                <Upload className="w-8 h-8 text-gray-400 mb-1" />
                <p className="text-xs text-gray-600 text-center px-2">
                  {file ? file.name : 'Seleccionar archivo CSV'}
                </p>
              </div>
              <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
            </label>

            {file && (
              <button
                onClick={handleCheck}
                disabled={loading || !serverStatus?.online}
                className="mt-3 w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:bg-gray-400"
              >
                {loading ? `Verificando... ${progress}%` : 'Verificar IPs'}
              </button>
            )}

            {loading && (
              <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          {results && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="bg-gray-50 p-2 rounded border"><p className="text-gray-600 text-xs mb-0.5">Total</p><p className="text-lg font-bold">{results.summary.total}</p></div>
                <div className="bg-green-50 p-2 rounded border border-green-200"><p className="text-green-700 text-xs mb-0.5">En línea</p><p className="text-lg font-bold text-green-600">{results.summary.online}</p></div>
                <div className="bg-red-50 p-2 rounded border border-red-200"><p className="text-red-700 text-xs mb-0.5">Offline</p><p className="text-lg font-bold text-red-600">{results.summary.offline}</p></div>
                <div className="bg-yellow-50 p-2 rounded border border-yellow-200"><p className="text-yellow-700 text-xs mb-0.5">Timeout</p><p className="text-lg font-bold text-yellow-600">{results.summary.timeout}</p></div>
              </div>

              <div className="mb-3 bg-gray-50 rounded border p-2">
                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-xs border rounded px-1.5 py-1">
                      <option value="all">Todos</option>
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                      <option value="timeout">Timeout</option>
                    </select>
                    <select value={filterTorre} onChange={(e) => setFilterTorre(e.target.value)} className="text-xs border rounded px-1.5 py-1">
                      <option value="all">Todas las torres</option>
                      {results.torres.map((torre, idx) => (
                        <option key={idx} value={torre}>{torre}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="text-xs border rounded px-1.5 py-1"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={resetFilters} className="flex-1 text-xs bg-gray-200 hover:bg-gray-300 rounded py-1">Limpiar</button>
                    <button onClick={exportToCSV} className="flex-1 flex items-center justify-center gap-1 text-xs bg-green-600 text-white rounded py-1 hover:bg-green-700">
                      <Download className="w-3 h-3" /> Exportar
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  {getFilteredEntries().length} de {results.entries.length} resultados
                </div>
              </div>

              <div className="overflow-x-auto text-xs">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-1.5 py-1 text-left">Estado</th>
                      <th className="border px-1.5 py-1 text-left">IP</th>
                      <th className="border px-1.5 py-1 text-left">Nombre</th>
                      <th className="border px-1.5 py-1 text-left">Torre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredEntries().map((entry, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border px-1.5 py-1">{getStatusIcon(entry.status)}</td>
                        <td className="border px-1.5 py-1 font-mono">{entry.ip}</td>
                        <td className="border px-1.5 py-1">{entry.name}</td>
                        <td className="border px-1.5 py-1">
                          <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs">{entry.torre}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-2">
          <p className="text-xs text-gray-700">
            <strong>Formato:</strong> IP,Nombre,Torre,Comunidad<br />
            <code className="bg-white px-1.5 py-0.5 rounded text-xs">192.168.1.1,Server,Torre A,Norte</code>
          </p>
        </div>
      </div>
    </div>
  );
}
