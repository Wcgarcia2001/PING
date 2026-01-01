const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const net = require('net');
const dgram = require('dgram');

const app = express();
app.use(cors());
app.use(express.json());

// Bandera global para saber si ping está disponible
let pingAvailable = true;

// Verificar si ping funciona al iniciar
exec('ping -c 1 8.8.8.8', (error) => {
  if (error) {
    console.warn('⚠️ Advertencia: ping no está disponible en este dispositivo. Usando solo TCP/UDP.');
    pingAvailable = false;
  } else {
    console.log('✅ Ping disponible en el sistema.');
  }
});

// TCP Check (sin ping)
function checkTCP(ip, port = 80, timeout = 2000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    const cleanup = () => { try { socket.destroy(); } catch (e) {} };
    
    socket.on('connect', () => {
      const time = Date.now() - startTime;
      cleanup();
      resolve({ alive: true, time, method: 'tcp', port });
    });
    socket.on('timeout', () => { cleanup(); resolve({ alive: false, time: 0, method: 'tcp-timeout', port }); });
    socket.on('error', () => { cleanup(); resolve({ alive: false, time: 0, method: 'tcp-error', port }); });
    
    try {
      socket.connect(port, ip);
    } catch (e) {
      cleanup();
      resolve({ alive: false, time: 0, method: 'tcp-exception', port });
    }
  });
}

// UDP Check
function checkUDP(ip, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const startTime = Date.now();
    let responded = false;
    const timer = setTimeout(() => {
      if (!responded) {
        socket.close();
        resolve({ alive: false, time: 0, method: 'udp-timeout' });
      }
    }, timeout);
    
    socket.on('message', () => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        socket.close();
        resolve({ alive: true, time: Date.now() - startTime, method: 'udp' });
      }
    });
    socket.on('error', () => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        socket.close();
        resolve({ alive: false, time: 0, method: 'udp-error' });
      }
    });
    socket.send(Buffer.from([0x00]), 53, ip);
  });
}

// Método híbrido SIN ping (solo TCP/UDP)
async function checkIPHybrid(ip, timeout = 3000) {
  if (pingAvailable) {
    // Intentar ping solo si está disponible
    try {
      const timeoutSec = Math.ceil(timeout / 1000);
      const command = `ping -c 2 -W ${timeoutSec} ${ip}`;
      const startTime = Date.now();
      const { stdout } = await new Promise((resolve, reject) => {
        exec(command, { timeout: timeout + 1000 }, (error, stdout, stderr) => {
          if (error && error.killed) {
            reject(new Error('ping timeout'));
          } else {
            resolve({ stdout, error });
          }
        });
      });
      const hasResponse = stdout.includes('bytes from') || stdout.includes('ttl=');
      const elapsed = Date.now() - startTime;
      if (hasResponse) {
        return { alive: true, time: elapsed, method: 'ping' };
      }
    } catch (error) {
      console.log(`Ping falló para ${ip}, intentando TCP...`);
    }
  }

  // Fallback a TCP
  const commonPorts = [80, 443, 22, 8080];
  for (const port of commonPorts) {
    try {
      const result = await checkTCP(ip, port, 1000);
      if (result.alive) return result;
    } catch (e) {}
  }

  // Último intento con UDP
  try {
    const udpResult = await checkUDP(ip, 1000);
    if (udpResult.alive) return udpResult;
  } catch (e) {}

  return { alive: false, time: 0, method: 'all-failed' };
}

// Endpoints
app.post('/api/check-ip', async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP requerida' });
  try {
    const result = await checkIPHybrid(ip, 3000);
    res.json({
      ip,
      status: result.alive ? 'online' : 'offline',
      time: result.time,
      method: result.method
    });
  } catch (error) {
    res.json({ ip, status: 'timeout', time: 0 });
  }
});

app.post('/api/check-multiple', async (req, res) => {
  const { ips } = req.body;
  if (!ips || !Array.isArray(ips)) {
    return res.status(400).json({ error: 'Array de IPs requerido' });
  }
  console.log(`📡 Verificando ${ips.length} IPs...`);
  const results = [];
  const batchSize = 2; // Ajustado para móviles
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (entry) => {
        try {
          const result = await checkIPHybrid(entry.ip, 2500);
          return {
            ...entry,
            status: result.alive ? 'online' : 'offline',
            time: result.time,
            method: result.method
          };
        } catch (error) {
          return { ...entry, status: 'timeout', time: 0, method: 'error' };
        }
      })
    );
    results.push(...batchResults);
  }
  console.log(`✅ Verificación completa: ${results.filter(r => r.status === 'online').length}/${results.length} online`);
  res.json(results);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    pingAvailable,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'Android/Termux',
    pingAvailable,
    message: '✅ Servidor IP Checker funcionando',
    endpoints: ['GET /', 'GET /health', 'POST /api/check-ip', 'POST /api/check-multiple']
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('══════════════════════════════════');
  console.log('🚀 IP Checker - Termux Edition');
  console.log('══════════════════════════════════');
  console.log(`📍 Escuchando en: http://127.0.0.1:${PORT}`);
  console.log(`🌐 Red: http://<tu-ip-local>:${PORT}`);
  console.log(`🔧 Ping disponible: ${pingAvailable ? 'SÍ' : 'NO'}`);
  console.log('══════════════════════════════════');
});
