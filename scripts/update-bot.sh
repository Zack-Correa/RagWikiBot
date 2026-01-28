#!/bin/bash

# Script de atualização automática do RagWiki Bot
# Uso: ./update-bot.sh

set -e  # Parar em caso de erro

echo "========================================="
echo "  RagWiki Bot - Script de Atualização"
echo "========================================="
echo ""

# Verificar se estamos no diretório correto
if [ ! -f "app.js" ]; then
    echo "❌ Erro: Execute este script a partir do diretório raiz do projeto!"
    exit 1
fi

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "❌ Erro: PM2 não está instalado!"
    echo "   Instale com: npm install -g pm2"
    exit 1
fi

echo "📦 Parando o bot..."
pm2 stop ragwiki-bot 2>/dev/null || echo "   Bot não estava rodando"

echo ""
echo "🔄 Atualizando código do repositório..."
git pull origin dev

echo ""
echo "📚 Instalando/atualizando dependências..."
npm install

echo ""
echo "🚀 Fazendo deploy dos comandos slash..."
npm run deploy

echo ""
echo "✅ Reiniciando bot..."
pm2 restart ragwiki-bot 2>/dev/null || pm2 start app.js --name "ragwiki-bot"

echo ""
echo "========================================="
echo "  ✅ Bot atualizado com sucesso!"
echo "========================================="
echo ""
echo "📊 Status do bot:"
pm2 status ragwiki-bot

echo ""
echo "📝 Últimas 20 linhas de log:"
pm2 logs ragwiki-bot --lines 20 --nostream

echo ""
echo "💡 Dica: Use 'pm2 logs ragwiki-bot' para ver logs em tempo real"



