# Sistema de Plugins - BeeWiki Bot

O sistema de plugins permite adicionar, remover e gerenciar funcionalidades do bot de forma modular.

## Estrutura de um Plugin

Cada plugin deve estar em uma pasta dentro de `plugins/` com a seguinte estrutura:

```
plugins/
└── meu-plugin/
    ├── plugin.json     # Manifesto do plugin (obrigatório)
    ├── index.js        # Ponto de entrada (obrigatório)
    ├── command.js      # Comandos (opcional)
    └── service.js      # Serviços (opcional)
```

### plugin.json (Manifesto)

```json
{
    "name": "meu-plugin",
    "version": "1.0.0",
    "description": "Descrição do plugin",
    "author": "Zack Corrêa",
    "main": "index.js",
    "commands": ["meu-comando"],
    "dependencies": []
}
```

### index.js (Ponto de Entrada)

```javascript
/**
 * Meu Plugin
 */

// Variáveis de estado
let pluginLogger = null;
let discordClient = null;

/**
 * Chamado quando o plugin é carregado (antes de ativar)
 * @param {Object} context - Contexto do plugin
 */
function onLoad(context) {
    pluginLogger = context.logger;
    context.logger.info('Plugin carregado');
}

/**
 * Chamado quando o plugin é ativado
 * @param {Object} context - Contexto do plugin
 */
function onEnable(context) {
    discordClient = context.getClient();
    
    // Inicializar serviços aqui
    
    context.logger.info('Plugin ativado');
}

/**
 * Chamado quando o plugin é desativado
 * @param {Object} context - Contexto do plugin
 */
function onDisable(context) {
    // Parar serviços aqui
    
    context.logger.info('Plugin desativado');
}

/**
 * Chamado quando o plugin é descarregado
 * @param {Object} context - Contexto do plugin
 */
function onUnload(context) {
    context.logger.info('Plugin descarregado');
}

// Definição de comandos
const commands = {
    'meu-comando': {
        data: new SlashCommandBuilder()
            .setName('meu-comando')
            .setDescription('Descrição do comando'),
        
        async execute(interaction) {
            // Lógica do comando
        }
    }
};

// Exportar interface do plugin
module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},
    
    // API pública (opcional)
    api: {
        minhaFuncao: () => {}
    }
};
```

## Contexto do Plugin

O objeto `context` passado para os hooks de ciclo de vida contém:

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `name` | string | Nome do plugin |
| `logger` | object | Logger com métodos info, warn, error, debug |
| `getClient()` | function | Retorna o cliente Discord |
| `getConfig()` | function | Retorna configuração do plugin |
| `setConfig(config)` | function | Salva configuração do plugin |
| `getPluginPath()` | function | Retorna caminho do plugin |

## Ciclo de Vida

```
┌─────────────┐
│   INSTALL   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   onLoad    │────▶│  LOADED     │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  onEnable   │────▶│  ENABLED    │◀──┐
└──────┬──────┘     └──────┬──────┘   │
       │                   │          │
       │            ┌──────▼──────┐   │
       │            │  onDisable  │   │
       │            └──────┬──────┘   │
       │                   │          │
       │            ┌──────▼──────┐   │
       │            │  DISABLED   │───┘
       │            └─────────────┘
       │
       ▼
┌─────────────┐
│  onUnload   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  UNLOADED   │
└─────────────┘
```

## Comandos do Discord

Use `/plugin` para gerenciar plugins via Discord:

| Subcomando | Descrição |
|------------|-----------|
| `/plugin listar` | Lista todos os plugins |
| `/plugin status <nome>` | Status detalhado de um plugin |
| `/plugin ativar <nome>` | Ativa um plugin globalmente |
| `/plugin desativar <nome>` | Desativa um plugin globalmente |
| `/plugin recarregar <nome>` | Recarrega um plugin (hot reload) |
| `/plugin servidor-ativar <nome>` | Ativa plugin neste servidor |
| `/plugin servidor-desativar <nome>` | Desativa plugin neste servidor |

## Permissões por Servidor

Plugins podem ser ativados/desativados por servidor:

- **Global**: `/plugin ativar` / `/plugin desativar`
- **Por servidor**: `/plugin servidor-ativar` / `/plugin servidor-desativar`

Se um plugin está desativado globalmente, não pode ser ativado por servidor.

## Auto-Disable

Plugins que causam muitos erros são desativados automaticamente:

- **Threshold**: 5 erros
- **Janela**: 5 minutos
- **Ação**: Plugin é desativado e admins são alertados

## Plugins Instalados

| Plugin | Comandos | Descrição |
|--------|----------|-----------|
| `metrics` | - | Coleta métricas de uso |
| `server-status` | `/servidor-status` | Status dos servidores RO LATAM |
| `events` | `/eventos` | Notícias do GNJoy LATAM |
| `pricing` | `/preco-justo`, `/historico-preco` | Análise de preços |
| `market-alerts` | `/alerta-mercado` | Alertas de mercado com estratégia inteligente |
| `party` | `/grupo` | Grupos para instâncias com distribuição de loot |
| `shared-accounts` | `/conta` | Gerenciamento de contas compartilhadas com TOTP 2FA |
| `agentforce` | (IA) | Assistente IA para consultas em linguagem natural |

## API de Administração

### Health Check
```
GET /api/health
```
Retorna status do bot, uptime, memória e plugins (sem autenticação).

### Gerenciar Plugins
```
GET /api/plugins
POST /api/plugins/:name/enable
POST /api/plugins/:name/disable
POST /api/plugins/:name/reload
PUT /api/plugins/:name/config
```

## Criando um Novo Plugin

1. Crie uma pasta em `plugins/` com o nome do plugin
2. Crie `plugin.json` com as informações do plugin
3. Crie `index.js` exportando os hooks de ciclo de vida
4. (Opcional) Crie arquivos de comando em `command.js` ou `commands/`
5. Ative o plugin com `/plugin ativar <nome>` ou via painel admin

## Boas Práticas

1. **Sempre implemente `onDisable`** para limpar recursos (intervals, timeouts)
2. **Use o logger do contexto** ao invés de console.log
3. **Trate erros** adequadamente para evitar auto-disable
4. **Guarde estado** usando `context.getConfig()` / `setConfig()`
5. **Não modifique** arquivos fora da pasta do plugin
6. **Documente** seu plugin no README

## Exemplo: Plugin Simples

```javascript
// plugins/hello/index.js
const { SlashCommandBuilder } = require('discord.js');

function onLoad(ctx) {
    ctx.logger.info('Hello plugin loaded');
}

function onEnable(ctx) {
    ctx.logger.info('Hello plugin enabled');
}

function onDisable(ctx) {
    ctx.logger.info('Hello plugin disabled');
}

function onUnload(ctx) {
    ctx.logger.info('Hello plugin unloaded');
}

const commands = {
    'hello': {
        data: new SlashCommandBuilder()
            .setName('hello')
            .setDescription('Diz olá!'),
        async execute(interaction) {
            await interaction.reply('👋 Olá!');
        }
    }
};

module.exports = { onLoad, onEnable, onDisable, onUnload, commands };
```

```json
// plugins/hello/plugin.json
{
    "name": "hello",
    "version": "1.0.0",
    "description": "Plugin de exemplo",
    "author": "Zack Corrêa",
    "main": "index.js",
    "commands": ["hello"]
}
```
