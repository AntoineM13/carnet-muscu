#!/bin/bash
# Double-clic : lance la version de test sur http://localhost:8000
cd "$(dirname "$0")"
echo "Carnet de muscu (version de test) : http://localhost:8000"
echo "Laisse cette fenêtre ouverte pendant le test. Ctrl + C pour arrêter."
( sleep 1 && open "http://localhost:8000" ) &
python3 -m http.server 8000
