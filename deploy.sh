#!/bin/bash
# EDR CRM — Deploy script (cache busting + dev→main)
# Uso: ./deploy.sh "mensagem do commit"

set -e

if [ -z "$1" ]; then
  echo "Erro: forneça mensagem de commit."
  echo "Uso: ./deploy.sh \"mensagem\""
  exit 1
fi

COMMIT_MSG="$1"
TIMESTAMP=$(date +%s)

echo "🚀 EDR CRM Deploy — $TIMESTAMP"

# Cache busting: atualiza cb= em todos os HTMLs
for file in *.html; do
  sed -i "s/\?cb=[0-9]*/\?cb=${TIMESTAMP}/g" "$file"
  sed -i "s/\.js\"/\.js\?cb=${TIMESTAMP}\"/g" "$file"
  sed -i "s/\.css\"/\.css\?cb=${TIMESTAMP}\"/g" "$file"
done

# Atualiza versão do Service Worker
sed -i "s/const VERSION = '[0-9]*'/const VERSION = '${TIMESTAMP}'/g" sw.js

# Commit e push dev
git add .
git commit -m "$COMMIT_MSG"
git push origin dev

# Merge dev → main
git checkout main 2>/dev/null || git checkout -b main
git merge dev --no-edit
git push origin main
git checkout dev

echo "✅ atualizado e no ar"
