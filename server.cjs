const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const net = require('net');
const dgram = require('dgram');

const app = express();
app.use(cors());
app.use(express.json());

// MÉTODO 1: Ping nativo de Android (sin root)
function pingAndroid(ip, timeout = 3000) {
  return new Promise((resolve) => {
    // Android usa ping estilo Linux
    // -c: count, -W: timeout en segundos, -w: deadline
    const timeoutSec = Math.ceil(timeout / 1000);
    const command = `ping -c 3 -W ${timeoutSec} ${ip}`;
    
    const startTime = Date.now();
    
    exec(command, { timeout: timeout + 1000 }, (error, stdout, stderr) => {
      const elapsed = Date.now() - startTime;
      
      // Verificar si hubo respuesta
      const hasResponse = stdout.includes('bytes from') || 
                         stdout.includes('ttl=') ||
                         stdout.includes('time=');
      
      // Extraer tiempo promedio
      let avgTime = 0;
      
      // Buscar línea de estadísticas: "rtt min/avg/max/mdev = X/Y/Z/W ms"
      const statsMatch = stdout.match(/rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)\//);
      if (statsMatch) {
        avgTime = Math.round(parseFloat(statsMatch[1]));
      } else {
        // Buscar tiempos individuales
        const timeMatches = stdout.match(/time=([\d.]+) ms/g);
        if (timeMatches && timeMatches.length > 0) {
          const times = timeMatches.map(m => parseFloat(m.match(/time=([\d.]+)/)[1]));
          avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        }
      }
      
      // Si no hay respuesta pero tardó mucho, es timeout
      if (!hasResponse && elapsed >= timeout) {
        resolve({ alive: false, time: 0, method: 'ping-timeout' });
        return;
      }
      
      resolve({ 
        alive: hasResponse, 
        time: avgTime || (hasResponse ? elapsed : 0),
        method: 'ping'
      });
    });
  });
}

// MÉTODO 2: TCP Socket (funciona sin permisos)
function checkTCP(ip, port = 80, timeout = 2000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    const cleanup = () => {
      try {
        socket.destroy();
      } catch (e) {}
    };
    
    socket.on('connect', () => {
      const time = Date.now() - startTime;
      cleanup();
      resolve({ alive: true, time, method: 'tcp', port });
    });
    
    socket.on('timeout', () => {
      cleanup();
      resolve({ alive: false, time: 0, method: 'tcp-timeout', port });
    });
    
    socket.on('error', (err) => {
      cleanup();
      resolve({ alive: false, time: 0, method: 'tcp-error', port });
    });
    
    try {
      socket.connect(port, ip);
    } catch (e) {
      cleanup();
      resolve({ alive: false, time: 0, method: 'tcp-exception', port });
    }
  });
}

// MÉTODO 3: UDP Echo (alternativa)
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
    
    // Enviar paquete UDP al puerto 7 (echo) o 53 (DNS)
    socket.send(Buffer.from([0x00]), 53, ip);
  });
}

// MÉTODO HÍBRIDO: Intenta múltiples métodos
async function checkIPHybrid(ip, timeout = 3000) {
  // 1. Intentar ping primero (más confiable)
  try {
    const pingResult = await pingAndroid(ip, timeout);
    if (pingResult.alive) {
      return pingResult;
    }
  } catch (error) {
    console.log(`Ping falló para ${ip}: ${error.message}`);
  }
  
  // 2. Si ping falla, intentar TCP en puertos comunes
  const commonPorts = [80, 443, 22, 8080, 3389, 21, 23];
  
  for (const port of commonPorts) {
    try {
      const tcpResult = await checkTCP(ip, port, 1500);
      if (tcpResult.alive) {
        return tcpResult;
      }
    } catch (error) {
      continue;
    }
  }
  
  // 3. Último intento con UDP
  try {
    const udpResult = await checkUDP(ip, 1500);
    if (udpResult.alive) {
      return udpResult;
    }
  } catch (error) {
    // Ignorar
  }
  
  return { alive: false, time: 0, method: 'all-failed' };
}

// Endpoint para verificar una sola IP
app.post('/api/check-ip', async (req, res) => {
  const { ip } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP requerida' });
  }
  
  try {
    const result = await checkIPHybrid(ip, 4000);
    
    res.json({
      ip: ip,
      status: result.alive ? 'online' : 'offline',
      time: result.time,
      method: result.method,
      port: result.port
    });
  } catch (error) {
    res.json({ 
      ip: ip, 
      status: 'timeout', 
      time: 0,
      error: error.message 
    });
  }
});

// Endpoint para verificar múltiples IPs
app.post('/api/check-multiple', async (req, res) => {
  const { ips } = req.body;
  
  if (!ips || !Array.isArray(ips)) {
    return res.status(400).json({ error: 'Array de IPs requerido' });
  }
  
  console.log(`📡 Verificando ${ips.length} IPs...`);
  
  try {
    // Procesar en lotes pequeños para no saturar
    const batchSize = 5;
    const results = [];
    
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      console.log(`Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(ips.length/batchSize)}...`);
      
      const batchResults = await Promise.all(
        batch.map(async (entry) => {
          try {
            const result = await checkIPHybrid(entry.ip, 3000);
            
            console.log(`  ${entry.ip}: ${result.alive ? '✅' : '❌'} (${result.method})`);
            
            return {
              ...entry,
              status: result.alive ? 'online' : 'offline',
              time: result.time,
              method: result.method
            };
          } catch (error) {
            console.log(`  ${entry.ip}: ❌ Error`);
            return {
              ...entry,
              status: 'timeout',
              time: 0,
              method: 'error'
            };
          }
        })
      );
      
      results.push(...batchResults);
    }
    
    console.log(`✅ Verificación completa: ${results.filter(r => r.status === 'online').length}/${results.length} online`);
    res.json(results);
    
  } catch (error) {
    console.error('❌ Error en verificación:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    platform: 'Android/Termux',
    message: '✅ Servidor de verificación de IPs funcionando',
    methods: [
      '1. ICMP Ping (nativo Android)',
      '2. TCP Socket Check (puertos: 80,443,22,8080,3389,21,23)',
      '3. UDP Echo (puerto 53)'
    ],
    endpoints: [
      'GET / - Estado del servidor',
      'POST /api/check-ip - Verificar una IP',
      'POST /api/check-multiple - Verificar múltiples IPs'
    ],
    note: 'El servidor intenta ping primero, luego TCP si falla'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 Servidor IP Checker para Android/Termux');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📍 Local:    http://localhost:${PORT}`);
  console.log(`🌐 Network:  http://[tu-ip]:${PORT}`);
  console.log('');
  console.log('🔧 Métodos de verificación:');
  console.log('   1️⃣  ICMP Ping (preferido)');
  console.log('   2️⃣  TCP Socket (fallback)');
  console.log('   3️⃣  UDP Echo (último recurso)');
  console.log('');
  console.log('💡 Prueba con: curl http://localhost:' + PORT);
  console.log('═══════════════════════════════════════════════════');
});
