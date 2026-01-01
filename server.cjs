const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Función para hacer ping en Windows
function pingIP(ip, timeout = 3000) {
  return new Promise((resolve) => {
    // -n 2: enviar 2 paquetes
    // -w timeout: tiempo de espera en milisegundos
    const command = `ping -n 4 -w ${timeout} ${ip}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ alive: false, time: 0 });
        return;
      }
      
      // Buscar si hubo respuestas exitosas
      const hasResponse = stdout.includes('bytes=32') || stdout.includes('Respuesta desde');
      
      // Extraer tiempo de respuesta
      let time = 0;
      const timeMatch = stdout.match(/tiempo[=<](\d+)ms/i) || stdout.match(/time[=<](\d+)ms/i);
      if (timeMatch) {
        time = parseInt(timeMatch[1]);
      }
      
      resolve({ 
        alive: hasResponse, 
        time: time 
      });
    });
  });
}

app.post('/api/check-ip', async (req, res) => {
  const { ip } = req.body;
  
  try {
    const result = await pingIP(ip);
    
    res.json({
      ip: ip,
      status: result.alive ? 'online' : 'offline',
      time: result.time
    });
  } catch (error) {
    res.json({ ip: ip, status: 'timeout', time: 0 });
  }
});

app.post('/api/check-multiple', async (req, res) => {
  const { ips } = req.body;
  
  try {
    const results = await Promise.all(
      ips.map(async (entry) => {
        try {
          const result = await pingIP(entry.ip);
          
          return {
            ...entry,
            status: result.alive ? 'online' : 'offline',
            time: result.time
          };
        } catch (error) {
          return {
            ...entry,
            status: 'timeout',
            time: 0
          };
        }
      })
    );
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '✅ Servidor de verificación de IPs funcionando',
    endpoints: [
      'POST /api/check-ip - Verificar una IP',
      'POST /api/check-multiple - Verificar múltiples IPs'
    ]
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📡 Listo para verificar IPs con ping nativo de Windows`);
});