#!/bin/bash

# Script de instalação do RagWiki Bot no Proxmox
# Este script deve ser executado como usuário root ou com sudo

set -e  # Parar em caso de erro

echo "========================================="
echo "  RagWiki Bot - Instalação no Proxmox"
echo "========================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se é root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Este script deve ser executado como root${NC}"
    echo "   Use: sudo bash install-proxmox.sh"
    exit 1
fi

echo "1️⃣  Atualizando sistema..."
apt update && apt upgrade -y

echo ""
echo "2️⃣  Instalando dependências básicas..."
apt install -y curl git build-essential

echo ""
echo "3️⃣  Instalando Node.js 20.x (LTS)..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "   Node.js já está instalado ($(node --version))"
fi

echo ""
echo "4️⃣  Verificando instalação do Node.js..."
node --version
npm --version

echo ""
echo "5️⃣  Criando usuário 'ragwiki'..."
if id "ragwiki" &>/dev/null; then
    echo "   Usuário 'ragwiki' já existe"
else
    useradd -m -s /bin/bash ragwiki
    echo "   Usuário 'ragwiki' criado com sucesso"
fi

echo ""
echo "6️⃣  Instalando PM2 globalmente..."
npm install -g pm2

echo ""
echo "7️⃣  Clonando repositório..."
cd /home/ragwiki

if [ -d "RagWikiBot" ]; then
    echo "   Diretório RagWikiBot já existe, pulando..."
else
    sudo -u ragwiki git clone https://github.com/Zack-Correa/RagWikiBot.git
    echo "   Repositório clonado com sucesso"
fi

cd RagWikiBot

echo ""
echo "8️⃣  Instalando dependências do projeto..."
sudo -u ragwiki npm install

echo ""
echo "========================================="
echo -e "${GREEN}✅ Instalação base concluída!${NC}"
echo "========================================="
echo ""
echo -e "${YELLOW}📝 PRÓXIMOS PASSOS:${NC}"
echo ""
echo "1. Configure o arquivo .env:"
echo "   sudo -u ragwiki nano /home/ragwiki/RagWikiBot/.env"
echo ""
echo "   Adicione as seguintes variáveis:"
echo "   DISCORD_TOKEN=seu_token_aqui"
echo "   CLIENT_ID=seu_client_id_aqui"
echo "   DIVINE_PRIDE_API_KEY=sua_api_key_aqui (opcional)"
echo ""
echo "2. Faça deploy dos comandos slash:"
echo "   cd /home/ragwiki/RagWikiBot"
echo "   sudo -u ragwiki npm run deploy"
echo ""
echo "3. Inicie o bot com PM2:"
echo "   cd /home/ragwiki/RagWikiBot"
echo "   sudo -u ragwiki pm2 start app.js --name ragwiki-bot"
echo ""
echo "4. Configure PM2 para iniciar automaticamente:"
echo "   sudo -u ragwiki pm2 startup"
echo "   (Execute o comando que o PM2 mostrar)"
echo "   sudo -u ragwiki pm2 save"
echo ""
echo "5. Verifique os logs:"
echo "   sudo -u ragwiki pm2 logs ragwiki-bot"
echo ""
echo -e "${GREEN}📚 Para mais detalhes, consulte: DEPLOY_PROXMOX.md${NC}"



