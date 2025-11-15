# 🔄 Scripts de Gerenciamento do Bot

Esta pasta contém scripts auxiliares para gerenciar o bot Discord RagWikiBot.

## 📁 Scripts disponíveis

### 1. `deploy-commands.js` - Deploy de Comandos Slash

Registra os comandos slash do bot no Discord.

**Como usar:**
```bash
npm run deploy
```

**Opções:**
- Sem `GUILD_ID` no `.env`: Deploy global (leva até 1 hora)
- Com `GUILD_ID` no `.env`: Deploy instantâneo em uma guild específica

---

### 2. `reset-commands.js` - Reset de Comandos

Remove comandos antigos/duplicados e opcionalmente registra os corretos.

**Como usar:**
```bash
# Apenas remover comandos
npm run reset

# Remover E registrar novamente (recomendado)
npm run reset:deploy

# Remover de uma guild específica
node scripts/reset-commands.js --guild GUILD_ID

# Remover de uma guild específica E registrar
node scripts/reset-commands.js --guild GUILD_ID --deploy
```

[📖 Documentação completa do reset-commands.js](./RESET_COMMANDS.md)

---

### 3. `list-guilds.js` - Listar Guilds

Lista todos os servidores onde o bot está presente e seus IDs.

**Como usar:**
```bash
npm run list-guilds
```

---

## 🚀 Fluxo de trabalho recomendado

### Para desenvolvimento:

1. Adicione `GUILD_ID` ao `.env` (obtenha com `npm run list-guilds`)
2. Execute `npm run deploy` para deploy instantâneo
3. Teste os comandos no servidor

### Para produção:

1. Remova `GUILD_ID` do `.env`
2. Execute `npm run reset:deploy` para limpar e fazer deploy global
3. Aguarde até 1 hora para propagação

### Para corrigir comandos duplicados:

```bash
npm run reset:deploy
```

---

## ⚙️ Configuração necessária

Todos os scripts requerem o arquivo `.env` na raiz do projeto:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui (opcional)
GUILD_ID=guild_id_para_testes (opcional)
```

---

## 📊 Estrutura dos scripts

```
scripts/
├── README.md              # Esta documentação
├── RESET_COMMANDS.md      # Documentação detalhada do reset
├── deploy-commands.js     # Deploy de comandos
├── reset-commands.js      # Reset e limpeza de comandos
└── list-guilds.js         # Listagem de guilds
```

---

## 🔗 Links úteis

- [Discord Developer Portal](https://discord.com/developers/applications)
- [Discord.js Documentation](https://discord.js.org/)
- [RagWikiBot Repository](https://github.com/Zack-Correa/RagWikiBot)

---

**Versão**: 1.0.0  
**Discord.js**: v14+

