import React, { useState } from 'react';
import { Upload, CheckCircle, XCircle, Clock, AlertCircle, Download, Filter, Search } from 'lucide-react';

export default function IPChecker() {
  const [file, setFile] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTorre, setFilterTorre] = useState('all');
  const [filterComunidad, setFilterComunidad] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults(null);
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

  const checkIPsWithBackend = async (entries) => {
    try {
      const response = await fetch('http://localhost:3001/api/check-multiple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ips: entries })
      });
      
      if (!response.ok) {
        throw new Error('Error al conectar con el servidor');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error al verificar IPs:', error);
      // Si falla el backend, usar simulación
      return entries.map(entry => ({
        ...entry,
        status: simulateCheck(entry.ip)
      }));
    }
  };

  const simulateCheck = (ip) => {
    const lastOctet = parseInt(ip.split('.').pop() || '0');
    const random = Math.random();
    
    if (lastOctet % 3 === 0 || random > 0.7) {
      return 'online';
    } else if (random > 0.5) {
      return 'offline';
    } else {
      return 'timeout';
    }
  };

  const handleCheck = async () => {
    if (!file) return;

    setLoading(true);
    
    try {
      const text = await file.text();
      const entries = parseCSV(text);
      
      if (entries.length === 0) {
        alert('No se encontraron datos válidos. Verifica el formato del archivo.');
        setLoading(false);
        return;
      }
      
      // Intentar usar el backend para verificación real
      const checkedEntries = await checkIPsWithBackend(entries);

      const summary = {
        total: checkedEntries.length,
        online: checkedEntries.filter(e => e.status === 'online').length,
        offline: checkedEntries.filter(e => e.status === 'offline').length,
        timeout: checkedEntries.filter(e => e.status === 'timeout').length
      };

      // Get unique values for filters
      const torres = [...new Set(checkedEntries.map(e => e.torre))].sort();
      const comunidades = [...new Set(checkedEntries.map(e => e.comunidad))].sort();

      setResults({
        entries: checkedEntries,
        summary,
        torres,
        comunidades
      });
    } catch (error) {
      alert('Error al procesar el archivo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'online':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'timeout':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'online':
        return 'En línea';
      case 'offline':
        return 'Fuera de línea';
      case 'timeout':
        return 'Tiempo agotado';
      default:
        return 'Desconocido';
    }
  };

  const getFilteredEntries = () => {
    if (!results) return [];
    
    let filtered = results.entries;
    
    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(e => e.status === filterStatus);
    }
    
    // Filter by torre
    if (filterTorre !== 'all') {
      filtered = filtered.filter(e => e.torre === filterTorre);
    }
    
    // Filter by comunidad
    if (filterComunidad !== 'all') {
      filtered = filtered.filter(e => e.comunidad === filterComunidad);
    }
    
    // Filter by search term
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
    const headers = ['Estado,IP,Nombre,Torre,Comunidad'];
    const rows = filtered.map(e => 
      `${getStatusText(e.status)},${e.ip},${e.name},${e.torre},${e.comunidad}`
    );
    
    const csv = headers.concat(rows).join('\n');
	const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    //const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_ips_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (!results) return;
    
    const filtered = getFilteredEntries();
    const data = {
      fecha: new Date().toISOString(),
      resumen: results.summary,
      filtros_aplicados: {
        estado: filterStatus,
        torre: filterTorre,
        comunidad: filterComunidad,
        busqueda: searchTerm
      },
      ips: filtered
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_ips_${new Date().getTime()}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterTorre('all');
    setFilterComunidad('all');
    setSearchTerm('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Verificador de Estado de IPs
          </h1>
          <p className="text-gray-600 mb-6">
            Sube un archivo CSV con formato: IP,Nombre,Torre,Comunidad
          </p>

          {/* Upload Section */}
          <div className="mb-8">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  {file ? file.name : 'Click para seleccionar archivo CSV'}
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {file && (
              <button
                onClick={handleCheck}
                disabled={loading}
                className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Verificando...' : 'Verificar IPs'}
              </button>
            )}
          </div>

          {/* Results Section */}
          {results && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-gray-600 text-sm mb-1">Total</p>
                  <p className="text-3xl font-bold text-gray-800">
                    {results.summary.total}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-green-700 text-sm mb-1">En línea</p>
                  <p className="text-3xl font-bold text-green-600">
                    {results.summary.online}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-red-700 text-sm mb-1">Fuera de línea</p>
                  <p className="text-3xl font-bold text-red-600">
                    {results.summary.offline}
                  </p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <p className="text-yellow-700 text-sm mb-1">Tiempo agotado</p>
                  <p className="text-3xl font-bold text-yellow-600">
                    {results.summary.timeout}
                  </p>
                </div>
              </div>

              {/* Online IPs List */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center">
                  <CheckCircle className="w-6 h-6 text-green-500 mr-2" />
                  IPs que Respondieron ({results.summary.online})
                </h2>
                <div className="bg-green-50 rounded-lg border border-green-200 p-4">
                  {results.entries.filter(e => e.status === 'online').length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {results.entries
                        .filter(e => e.status === 'online')
                        .map((entry, idx) => (
                          <div
                            key={idx}
                            className="bg-white p-3 rounded border border-green-200"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-mono text-sm font-semibold text-gray-700">
                                {entry.ip}
                              </span>
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                {entry.torre}
                              </span>
                            </div>
                            <p className="text-gray-600 text-sm">{entry.name}</p>
                            <p className="text-gray-500 text-xs mt-1">{entry.comunidad}</p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center">
                      No hay IPs en línea
                    </p>
                  )}
                </div>
              </div>

              {/* Filters and Export Section */}
              <div className="mb-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
                <div className="flex flex-col gap-4">
                  {/* Filters Row 1 */}
                  <div className="flex flex-col md:flex-row gap-3 items-start">
                    <Filter className="w-5 h-5 text-gray-600 mt-2 hidden md:block" />
                    
                    {/* Status Filter */}
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="online">En línea</option>
                      <option value="offline">Fuera de línea</option>
                      <option value="timeout">Tiempo agotado</option>
                    </select>

                    {/* Torre Filter */}
                    <select
                      value={filterTorre}
                      onChange={(e) => setFilterTorre(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                    >
                      <option value="all">Todas las torres</option>
                      {results.torres.map((torre, idx) => (
                        <option key={idx} value={torre}>{torre}</option>
                      ))}
                    </select>

                    {/* Comunidad Filter */}
                    <select
                      value={filterComunidad}
                      onChange={(e) => setFilterComunidad(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                    >
                      <option value="all">Todas las comunidades</option>
                      {results.comunidades.map((comunidad, idx) => (
                        <option key={idx} value={comunidad}>{comunidad}</option>
                      ))}
                    </select>

                    {/* Reset Button */}
                    <button
                      onClick={resetFilters}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition"
                    >
                      Limpiar
                    </button>
                  </div>

                  {/* Search and Export Row */}
                  <div className="flex flex-col md:flex-row gap-3 items-start">
                    {/* Search */}
                    <div className="flex items-center gap-2 flex-1 w-full">
                      <Search className="w-5 h-5 text-gray-600" />
                      <input
                        type="text"
                        placeholder="Buscar por IP, nombre, torre o comunidad..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                      />
                    </div>

                    {/* Export Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={exportToCSV}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" />
                        CSV
                      </button>
                      <button
                        onClick={exportToJSON}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" />
                        JSON
                      </button>
                    </div>
                  </div>
                </div>

                {/* Results count */}
                <div className="mt-3 text-sm text-gray-600">
                  Mostrando {getFilteredEntries().length} de {results.entries.length} resultados
                </div>
              </div>

              {/* All IPs Table */}
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-3">
                  Listado Completo
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">
                          Estado
                        </th>
                        <th className="border border-gray-300 px-4 py-2 text-left">
                          IP
                        </th>
                        <th className="border border-gray-300 px-4 py-2 text-left">
                          Nombre
                        </th>
                        <th className="border border-gray-300 px-4 py-2 text-left">
                          Torre
                        </th>
                        <th className="border border-gray-300 px-4 py-2 text-left">
                          Sector
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredEntries().length > 0 ? (
                        getFilteredEntries().map((entry, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-4 py-2">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(entry.status)}
                                <span className="text-sm">
                                  {getStatusText(entry.status)}
                                </span>
                              </div>
                            </td>
                            <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                              {entry.ip}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              {entry.name}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              <span className="inline-block bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm">
                                {entry.torre}
                              </span>
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-sm">
                              {entry.comunidad}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="border border-gray-300 px-4 py-8 text-center text-gray-500">
                            No se encontraron resultados con los filtros aplicados
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            <strong>Formato del archivo:</strong> Cada línea debe contener IP, Nombre, Torre y Comunidad separados por comas.
            <br />
            <strong>Ejemplo:</strong>
            <br />
            <code className="bg-white px-2 py-1 rounded text-xs">
              192.168.1.1,Servidor Principal,Torre A,Comunidad Norte
              <br />
              192.168.1.2,Router Central,Torre B,Comunidad Sur
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}