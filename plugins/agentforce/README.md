# Agentforce Plugin

Assistente AI com Salesforce Agentforce para buscas RAG em linguagem natural sobre Ragnarok Online.

## Funcionalidades

- Responde perguntas em linguagem natural no Discord
- Busca automática em Divine Pride, Browiki e Mercado GNJoy
- Execução automática de comandos baseado na intenção do usuário
- Sessões de conversa por usuário com timeout configurável

## Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
# Salesforce Agentforce
SALESFORCE_CLIENT_ID=seu_client_id
SALESFORCE_CLIENT_SECRET=seu_client_secret
SALESFORCE_INSTANCE_URL=https://sua-instancia.my.salesforce.com
AGENTFORCE_AGENT_ID=seu_agent_id
```

### 2. Configuração do Salesforce

#### Criar External Client App

1. Acesse **Setup** > **Apps** > **App Manager**
2. Clique em **New Connected App**
3. Configure:
   - **Enable OAuth Settings**: Marcado
   - **Callback URL**: `https://login.salesforce.com/services/oauth2/callback`
   - **Selected OAuth Scopes**:
     - Manage user data via APIs (api)
     - Perform requests at any time (refresh_token, offline_access)
     - Access chatbot services (chatbot_api)
     - Access the Salesforce API Platform (sfap_api)
4. Habilite **Client Credentials Flow**
5. Configure um usuário "Run As" com permissões de API

#### Criar Agent no Agentforce Builder

1. Acesse **Agentforce** no Salesforce
2. Crie um novo Agent
3. Configure os seguintes **Custom Topics/Actions**:

| Action | Descrição | Parâmetros |
|--------|-----------|------------|
| `search_item` | Busca item por nome/ID | `query`, `language` |
| `search_monster` | Busca monstro | `query`, `language` |
| `search_map` | Busca mapa | `query`, `language` |
| `search_market` | Busca mercado | `query`, `server`, `type` |
| `search_wiki` | Busca na Browiki | `query` |
| `check_price` | Analisa preço | `item`, `price`, `server` |

4. Configure instruções para o Agent identificar intenções e retornar a action apropriada

## Uso

### Mencionar o Bot

```
@RagWikiBot qual o drop rate do Poring?
```

### Mensagem Direta (DM)

Envie uma mensagem direta para o bot:

```
Quanto custa uma Adaga no mercado de Freya?
```

## Exemplos de Perguntas

- "Qual o drop rate do Poring?"
- "Onde encontro o MVP Baphomet?"
- "Quanto custa uma Adaga no mercado?"
- "Quais itens o Orc Warrior dropa?"
- "Me fale sobre a Prontera"
- "O preço de 500k por uma Claymore está justo?"

## Arquitetura

```
plugins/agentforce/
├── index.js           # Entry point e lifecycle hooks
├── plugin.json        # Manifest do plugin
├── client.js          # Cliente REST para Agentforce API
├── actions.js         # Mapeamento de ações para comandos
├── messageHandler.js  # Listener de mensagens
├── embedBuilder.js    # Formatação de respostas
├── sessionManager.js  # Gerenciador de sessões
└── README.md          # Esta documentação
```

## Configuração do Plugin

No arquivo `plugin.json`:

```json
{
  "config": {
    "triggerOnMention": true,    // Responder quando mencionado
    "triggerOnDM": true,         // Responder em DMs
    "allowedChannels": [],       // Lista de channel IDs permitidos (vazio = todos)
    "sessionTimeoutMinutes": 30  // Timeout da sessão
  }
}
```

## API Pública

O plugin expõe uma API para uso externo:

```javascript
const agentforce = pluginService.getPluginApi('agentforce');

// Verificar se está configurado
if (agentforce.isConfigured()) {
    // Enviar mensagem
    const session = await agentforce.createSession(userId, sessionData);
    const response = await agentforce.sendMessage(session.sessionId, 'pergunta');
}
```

## Troubleshooting

### "Agentforce credentials not configured"

Verifique se todas as variáveis de ambiente estão definidas:
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`
- `SALESFORCE_INSTANCE_URL`
- `AGENTFORCE_AGENT_ID`

### "Salesforce authentication failed"

1. Verifique se o Client ID e Secret estão corretos
2. Confirme que o Client Credentials Flow está habilitado
3. Verifique se o usuário "Run As" tem permissões adequadas

### Bot não responde às menções

1. Verifique se o plugin está habilitado: `/plugin status agentforce`
2. Confirme que `triggerOnMention` está `true` no config
3. Verifique os logs para erros

## Dependências

- axios (já incluído no projeto)
- discord.js (já incluído no projeto)

## Versão

1.0.0
