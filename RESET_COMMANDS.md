# 🔄 Script de Reset de Comandos

Este script foi criado para remover comandos duplicados ou antigos do Discord e opcionalmente registrar os comandos corretos novamente.

## 📋 O que o script faz?

O script `reset-commands.js` realiza as seguintes operações:

1. **Lista** todos os comandos existentes (globais e de guilds específicas)
2. **Remove** TODOS os comandos encontrados
3. **Opcionalmente** registra os comandos corretos novamente

## 🚀 Como usar

### Opção 1: Apenas remover comandos (sem re-registrar)

```bash
npm run reset
```
ou
```bash
node reset-commands.js
```

### Opção 2: Remover E registrar comandos corretos (recomendado)

```bash
npm run reset:deploy
```
ou
```bash
node reset-commands.js --deploy
```

### Opção 3: Remover comandos de uma guild específica

```bash
node reset-commands.js --guild GUILD_ID
```

Substitua `GUILD_ID` pelo ID do servidor Discord.

### Opção 4: Remover comandos de uma guild específica E re-registrar

```bash
node reset-commands.js --guild GUILD_ID --deploy
```

## 🔍 Como encontrar o Guild ID?

Para descobrir o ID das guilds onde seu bot está:

```bash
npm run list-guilds
```

Este comando listará todos os servidores onde o bot está presente e seus respectivos IDs.

## ⚙️ Requisitos

Antes de executar o script, certifique-se de que:

1. ✅ O arquivo `.env` está configurado com `DISCORD_TOKEN`
2. ✅ O token do bot está válido e não expirado
3. ✅ O bot tem permissões necessárias nos servidores

### Exemplo de `.env`:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui (opcional)
GUILD_ID=guild_id_para_testes (opcional)
```

## 📊 O que o script mostra?

Durante a execução, o script exibirá:

- ✅ Comandos globais encontrados e removidos
- ✅ Guilds onde o bot está presente
- ✅ Comandos de cada guild encontrados e removidos
- ✅ Resumo total de comandos removidos
- ✅ Status do re-registro (se a opção `--deploy` foi usada)

### Exemplo de saída:

```
═══════════════════════════════════════════════════════
🔄 RESET DE COMANDOS DO DISCORD
═══════════════════════════════════════════════════════

🔑 Validando token e obtendo Application ID...
✅ Token validado com sucesso!

🎯 Modo: Remover TODOS os comandos (globais e de todas as guilds)

🔍 Buscando comandos globais...
📋 Encontrados 8 comandos globais:
   - search-item (ID: 123456789)
   - search-monster (ID: 987654321)
   ...
🗑️  Removendo todos os comandos globais...
✅ 8 comandos globais removidos com sucesso!

🔍 Buscando guilds onde o bot está presente...
📋 Bot está em 2 guild(s). Processando...

🏰 Guild: Meu Servidor de Testes (ID: 111222333)
   📋 Encontrados 8 comandos:
      - search-item (ID: 123456789)
      ...
   🗑️  Removendo comandos desta guild...
   ✅ 8 comandos removidos!

═══════════════════════════════════════════════════════
📊 RESUMO DO RESET
═══════════════════════════════════════════════════════
✅ Total de comandos removidos: 16
═══════════════════════════════════════════════════════

🚀 REGISTRANDO NOVOS COMANDOS
...
✅ RESET E DEPLOY CONCLUÍDOS COM SUCESSO!
```

## 🚨 Possíveis erros e soluções

### Erro 401 - Não autorizado

**Possíveis causas:**
- Token do Discord está incorreto ou expirado
- Token foi resetado no Discord Developer Portal

**Solução:**
1. Verifique se o `DISCORD_TOKEN` no `.env` está correto
2. Obtenha um novo token em [Discord Developer Portal](https://discord.com/developers/applications)

### Erro 50001 - Acesso negado

**Causa:**
- Bot não foi convidado com o scope `applications.commands`

**Solução:**
- Convide o bot novamente usando o link de convite correto que inclui o scope `applications.commands`

### Bot não está em nenhuma guild

**Causa:**
- Bot não foi adicionado a nenhum servidor

**Solução:**
- Adicione o bot a pelo menos um servidor Discord

## 💡 Dicas

1. **Para desenvolvimento rápido**: Use o `GUILD_ID` no `.env` para registrar comandos em um servidor de testes específico. As atualizações são instantâneas!

2. **Para produção**: Não configure `GUILD_ID` no `.env`. Os comandos serão registrados globalmente e aparecerão em todos os servidores (pode levar até 1 hora).

3. **Comandos duplicados**: Se você ver comandos duplicados, execute `npm run reset:deploy` para limpar tudo e re-registrar.

4. **Limpeza periódica**: É uma boa prática executar o reset antes de fazer deploy em produção para garantir que não haja comandos antigos.

## 🔗 Scripts relacionados

- `npm run deploy` - Registra comandos (sem remover os antigos)
- `npm run reset` - Remove todos os comandos
- `npm run reset:deploy` - Remove e re-registra comandos (recomendado)
- `npm run list-guilds` - Lista guilds onde o bot está presente

## 📝 Notas técnicas

- O script usa a API REST do Discord.js v14
- Remove comandos de TODAS as guilds onde o bot está presente
- Remove comandos globais e de guilds
- É seguro executar múltiplas vezes
- Não afeta dados do bot, apenas os comandos slash registrados

## ⚠️ Avisos importantes

- ⚠️ **Comandos globais**: Depois de remover comandos globais, pode levar alguns minutos para que eles desapareçam de todos os servidores.
- ⚠️ **Comandos de guild**: São removidos instantaneamente.
- ⚠️ **Backup**: O script não cria backup dos comandos removidos. Certifique-se de que os comandos estão definidos corretamente no código antes de executar.

## 🆘 Precisa de ajuda?

Se encontrar problemas:

1. Verifique se o `.env` está configurado corretamente
2. Verifique os logs para mensagens de erro específicas
3. Execute `npm run list-guilds` para verificar se o bot está conectado
4. Verifique as permissões do bot no Discord Developer Portal

---

**Criado para**: RagWikiBot  
**Versão**: 1.0.0  
**Discord.js**: v14+

