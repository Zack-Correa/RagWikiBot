# Guia de Deploy - RagWiki Bot no Proxmox

Este guia apresenta duas opções para fazer o deploy do bot no Proxmox: usando um **Container LXC** (recomendado) ou uma **VM completa**.

---

## Opção 1: Deploy usando Container LXC (Recomendado)

### 1.1. Criar o Container LXC no Proxmox

1. Acesse a interface web do Proxmox (https://seu-ip:8006)
2. Clique em **Create CT** (Create Container)
3. Configure o container:
   - **Hostname**: `ragwiki-bot`
   - **Password**: Defina uma senha root
   - **Template**: Escolha `ubuntu-22.04-standard` ou `debian-12-standard`
   - **Disk**: 8 GB é suficiente
   - **CPU**: 1-2 cores
   - **Memory**: 512 MB - 1 GB
   - **Network**: Configure conforme sua rede (DHCP ou IP estático)
   - **Start at boot**: ✓ (marque para iniciar automaticamente)

4. Clique em **Finish** e inicie o container

### 1.2. Configurar o Container

Acesse o console do container pelo Proxmox ou via SSH:

```bash
# Se pelo Proxmox, clique no container > Console
# Ou via SSH:
ssh root@ip-do-container
```

### 1.3. Instalar Node.js

```bash
# Atualizar o sistema
apt update && apt upgrade -y

# Instalar curl e git
apt install -y curl git

# Instalar Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verificar instalação
node --version
npm --version
```

### 1.4. Criar usuário para o bot (Boa prática de segurança)

```bash
# Criar usuário
useradd -m -s /bin/bash ragwiki

# Trocar para o usuário
su - ragwiki
```

### 1.5. Clonar e configurar a aplicação

```bash
# Clonar o repositório
git clone https://github.com/Zack-Correa/RagWikiBot.git
cd RagWikiBot

# Ou, se você quer copiar os arquivos locais, pode usar scp do seu PC:
# scp -r C:\Users\Zack-Corrêa\Documents\GitHub\RagWikiBot root@ip-do-container:/home/ragwiki/
```

### 1.6. Criar arquivo .env

```bash
# Criar arquivo .env
nano .env
```

Adicione as seguintes variáveis:

```env
# OBRIGATÓRIO - Token do bot Discord
DISCORD_TOKEN=seu_token_aqui

# OBRIGATÓRIO - Client ID do bot (necessário para deploy de slash commands)
CLIENT_ID=seu_client_id_aqui

# OPCIONAL - API Key do Divine Pride
DIVINE_PRIDE_API_KEY=sua_api_key_aqui

# OPCIONAL - Configurações de presença
DISCORD_ACTIVITY=Use /ajuda para ver os comandos disponíveis
DISCORD_ACTIVITY_TYPE=STREAMING
DISCORD_STREAM_URL=https://github.com/Zack-Correa/RagWikiBot
```

Salve o arquivo (Ctrl+O, Enter, Ctrl+X)

### 1.7. Instalar dependências

```bash
npm install
```

### 1.8. Fazer deploy dos comandos slash

```bash
npm run deploy
```

### 1.9. Configurar PM2 para manter o bot sempre ativo

```bash
# Voltar para root temporariamente
exit

# Instalar PM2 globalmente
npm install -g pm2

# Voltar para o usuário ragwiki
su - ragwiki

# IMPORTANTE: Certifique-se de estar no diretório correto
cd ~/RagWikiBot

# Verificar que o app.js está aqui
ls -la app.js

# Iniciar o bot com PM2
pm2 start app.js --name "ragwiki-bot"

# Configurar PM2 para iniciar automaticamente
pm2 startup

# IMPORTANTE: Copie e execute o comando que o PM2 mostrar
# Exemplo: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ragwiki --hp /home/ragwiki

# Salvar a configuração atual do PM2
pm2 save
```

### 1.10. Comandos úteis do PM2

```bash
# Ver status do bot
pm2 status

# Ver logs em tempo real
pm2 logs ragwiki-bot

# Reiniciar o bot
pm2 restart ragwiki-bot

# Parar o bot
pm2 stop ragwiki-bot

# Monitorar recursos
pm2 monit
```

---

## Opção 2: Deploy usando VM Completa

### 2.1. Criar a VM no Proxmox

1. Clique em **Create VM**
2. Configure:
   - **Name**: `ragwiki-bot`
   - **ISO**: Ubuntu Server 22.04 LTS ou Debian 12
   - **Disk**: 10-20 GB
   - **CPU**: 1-2 cores
   - **Memory**: 1-2 GB
   - **Network**: Configure conforme sua rede

3. Instale o sistema operacional normalmente
4. Após instalação, siga os mesmos passos 1.3 a 1.10 da Opção 1

---

## Atualizando o Bot

### Método 1: Atualização manual

```bash
# Acessar o container/VM
su - ragwiki
cd RagWikiBot

# Parar o bot
pm2 stop ragwiki-bot

# Atualizar o código
git pull origin dev

# Instalar novas dependências (se houver)
npm install

# Fazer deploy dos comandos (se houver alterações)
npm run deploy

# Reiniciar o bot
pm2 restart ragwiki-bot
```

### Método 2: Usando script de atualização automática

Crie um script para facilitar atualizações:

```bash
nano ~/update-bot.sh
```

Adicione:

```bash
#!/bin/bash
cd ~/RagWikiBot
echo "Parando o bot..."
pm2 stop ragwiki-bot
echo "Atualizando código..."
git pull origin dev
echo "Instalando dependências..."
npm install
echo "Fazendo deploy dos comandos..."
npm run deploy
echo "Reiniciando bot..."
pm2 restart ragwiki-bot
echo "Bot atualizado!"
pm2 logs ragwiki-bot --lines 20
```

Torne o script executável:

```bash
chmod +x ~/update-bot.sh
```

Para atualizar, basta executar:

```bash
./update-bot.sh
```

---

## Backup e Recuperação

### Backup do Container LXC

No Proxmox, você pode fazer backup facilmente:

1. Selecione o container
2. Vá em **Backup** > **Backup now**
3. Configure backup automático em **Datacenter** > **Backup**

### Backup manual dos dados importantes

```bash
# Fazer backup do arquivo .env e logs
tar -czf ragwiki-backup-$(date +%Y%m%d).tar.gz \
  ~/RagWikiBot/.env \
  ~/.pm2/logs/
```

---

## Monitoramento e Logs

### Ver logs do bot

```bash
# Logs em tempo real
pm2 logs ragwiki-bot

# Últimas 100 linhas
pm2 logs ragwiki-bot --lines 100

# Logs de erro apenas
pm2 logs ragwiki-bot --err
```

### Monitorar recursos

```bash
# Status geral
pm2 status

# Monitor interativo
pm2 monit

# Ou via Proxmox, você pode monitorar:
# - CPU usage
# - Memory usage
# - Network traffic
```

---

## Solução de Problemas

### Erro: "Script not found: /home/ragwiki/app.js"

Este erro ocorre quando você tenta iniciar o PM2 fora do diretório do projeto:

```bash
# Solução: navegue para o diretório correto
cd ~/RagWikiBot

# Verifique que está no lugar certo
pwd
# Deve mostrar: /home/ragwiki/RagWikiBot

# Agora inicie o PM2
pm2 start app.js --name ragwiki-bot
```

### Bot não inicia

```bash
# Verificar logs
pm2 logs ragwiki-bot --err

# Verificar se o .env está configurado
cat ~/RagWikiBot/.env

# Testar manualmente
cd ~/RagWikiBot
node app.js
```

### Atualizar Node.js

```bash
# Verificar versão atual
node --version

# Se precisar atualizar para versão mais recente
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### Container não tem conexão com internet

```bash
# Verificar conectividade
ping -c 4 google.com

# Se não tiver DNS, adicionar manualmente
echo "nameserver 8.8.8.8" | sudo tee -a /etc/resolv.conf
```

---

## Segurança

### Firewall (Recomendado)

```bash
# Instalar UFW
apt install -y ufw

# Permitir SSH
ufw allow 22/tcp

# Ativar firewall
ufw enable
```

### Atualizações automáticas de segurança

```bash
# Instalar unattended-upgrades
apt install -y unattended-upgrades

# Configurar
dpkg-reconfigure -plow unattended-upgrades
```

---

## Recursos Necessários

### Mínimo recomendado:
- **CPU**: 1 core
- **RAM**: 512 MB
- **Disco**: 8 GB
- **Rede**: Conexão com internet estável

### Recomendado para produção:
- **CPU**: 2 cores
- **RAM**: 1 GB
- **Disco**: 10 GB
- **Rede**: Conexão com internet estável

---

## Checklist de Deploy

- [ ] Container/VM criado no Proxmox
- [ ] Sistema operacional atualizado
- [ ] Node.js instalado (versão 16+)
- [ ] Usuário `ragwiki` criado
- [ ] Repositório clonado
- [ ] Arquivo `.env` configurado com tokens
- [ ] Dependências instaladas (`npm install`)
- [ ] Comandos slash deployados (`npm run deploy`)
- [ ] PM2 instalado e configurado
- [ ] Bot iniciado com PM2
- [ ] PM2 configurado para iniciar automaticamente
- [ ] Backup configurado
- [ ] Firewall configurado (opcional)

---

## Suporte

- **Discord Bot**: Verifique os logs com `pm2 logs ragwiki-bot`
- **Documentação do Discord.js**: https://discord.js.org/
- **Repositório**: https://github.com/Zack-Correa/RagWikiBot

---

## Observações Importantes

1. **Tokens**: Nunca compartilhe seu `DISCORD_TOKEN` ou `CLIENT_ID`
2. **Backups**: Configure backups regulares do container/VM
3. **Atualizações**: Mantenha o sistema e o Node.js atualizados
4. **Monitoramento**: Verifique os logs regularmente
5. **Recursos**: Se o bot crescer muito, considere aumentar RAM/CPU

