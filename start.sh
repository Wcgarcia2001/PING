#!/bin/sh
echo "Iniciando backend..."
node server.cjs &
BACKEND_PID=$!

echo "Iniciando frontend..."
npx serve -s dist -l 3000

# Opcional: matar backend al salir
kill $BACKEND_PID 2>/dev/null
