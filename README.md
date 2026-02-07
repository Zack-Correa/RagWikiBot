# BeeWiki (RagWiki)

BeeWiki is a Discord bot for Ragnarok Online LATAM that provides item search, market alerts, price analysis, server status, and more.

## Features

- [x] Search quests and game history on [bROwiki](https://browiki.org/)
- [x] Search items by ID/name on [Divine-Pride](https://www.divine-pride.net/database/item) (LATAM/bRO servers)
- [x] Search monsters on [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Search maps on [Divine-Pride](https://www.divine-pride.net/database/map/)
- [x] Search the official LATAM market (trading system)
- [x] **Intelligent market alerts** with adaptive caching and smart scheduling
- [x] **Automatic alert cleanup** (removes alerts older than 30 days with notifications)
- [x] Price history tracking (90 days retention)
- [x] AI-powered price analysis
- [x] Server status monitoring
- [x] News from GNJoy LATAM (auto-updated Tue/Fri)
- [x] **Shared accounts management** with TOTP 2FA and granular permissions
- [x] **Party/group system** for instance scheduling with loot distribution
- [x] **AI assistant** (Agentforce plugin) for natural language queries
- [x] **Admin web panel** with full bot management

## Commands

All commands use **Slash Commands** (commands with `/`). Type `/` in Discord to see the available commands.

---

### Wiki Search

```
/wiki termo:SEARCH_TERM
```

Searches for information on [bROwiki](https://browiki.org/). Returns quest guides, item info, and game lore.

---

### Item Search

```
/buscar-item busca:ITEM_NAME idioma:LANGUAGE
```

Searches for items on [Divine-Pride](https://www.divine-pride.net/database/item) database. Results are paginated (10 items per page) with navigation buttons.

**Parameters:**
- `busca` - Item name or ID (required)
- `idioma` - Language: Português, English, Español (default: Português)

---

### Monster Search

```
/buscar-monstro busca:MONSTER_NAME idioma:LANGUAGE
```

Returns detailed monster information including stats, element, weakness, experience, drops, and spawn locations.

**Parameters:**
- `busca` - Monster name or ID (required)
- `idioma` - Language: Português, English, Español (default: Português)

---

### Map Search

```
/buscar-mapa busca:MAP_NAME idioma:LANGUAGE
```

Returns map information including name, type, background music, monsters, and NPCs.

**Parameters:**
- `busca` - Map name or ID (required)
- `idioma` - Language: Português, English, Español (default: Português)

---

### Market Search

```
/buscar-mercado busca:ITEM_NAME tipo:BUY|SELL servidor:SERVER
```

Searches the official Ragnarok Online LATAM trading system. Shows current listings with prices, quantities, store names, and seller characters.

**Parameters:**
- `busca` - Item name (required)
- `tipo` - Transaction type: Comprando, Vendendo (default: Comprando)
- `servidor` - Server: Freya, Nidhogg, Yggdrasil (default: Freya)

---

### Market Alerts

```
/alerta-mercado adicionar item:ITEM tipo:TYPE servidor:SERVER preco-maximo:PRICE quantidade-minima:QTY
```

Creates a market alert. The bot uses an **intelligent query strategy** that:
- Adaptively caches results based on item volatility (1-30 minutes TTL)
- Prioritizes alerts with recent activity or price drops
- Skips unnecessary queries for stable items or consecutive empty results
- Automatically cleans up alerts older than 30 days (with DM notification)

The bot checks the market at configured intervals (default: 15 minutes) and sends a DM notification when items matching your criteria are found. Notifies again if a lower price is detected.

**Subcommands:**

| Command | Description |
|---------|-------------|
| `/alerta-mercado adicionar` | Create a new alert |
| `/alerta-mercado listar` | List your alerts |
| `/alerta-mercado remover id:ID` | Remove an alert |
| `/alerta-mercado limpar` | Remove all your alerts |
| `/alerta-mercado status` | Show system status |
| `/alerta-mercado verificar` | Force immediate check |

**Features:**
- **Adaptive caching**: Frequently changing items are checked more often, stable items less often
- **Smart prioritization**: Alerts with recent results or price drops get checked first
- **Auto-cleanup**: Alerts inactive for 30+ days are automatically removed (users notified via DM)

---

### Price History

```
/historico-preco item:ITEM servidor:SERVER tipo:TYPE dias:DAYS
```

Shows the price history of a market item with statistics (min, max, average, median).

**Parameters:**
- `item` - Item name (required)
- `servidor` - Server: Freya, Nidhogg, Yggdrasil (optional)
- `tipo` - Transaction type: Comprando, Vendendo (optional)
- `dias` - Number of days to show: 1-90 (default: 7)

---

### Price Analysis (AI)

```
/preco-justo item:ITEM preco:PRICE servidor:SERVER tipo:TYPE
```

Analyzes if an item's price is fair based on historical data using statistical algorithms.

**Parameters:**
- `item` - Item name or ID (required)
- `preco` - Price to analyze (leave empty for latest) (optional)
- `servidor` - Server: Freya, Nidhogg, Yggdrasil (optional)
- `tipo` - Transaction type: Comprando, Vendendo (optional)

**Analysis includes:**
- Price classification (Muito Barato, Barato, Justo, Caro, Muito Caro)
- Comparison with average, minimum, and maximum
- Recommendation (buy/wait/avoid)

---

### Server Status

```
/servidor-status servidor:SERVER atualizar:BOOLEAN
```

Shows the status of Ragnarok Online LATAM servers.

**Parameters:**
- `servidor` - Specific server: Freya, Nidhogg, Yggdrasil (optional, shows all if empty)
- `atualizar` - Force immediate check (default: false)

---

### News / Events

```
/eventos
```

Shows the latest news and announcements from GNJoy LATAM, categorized by type:
- Announcements
- Updates
- Events & Promotions
- Others

News are cached and updated automatically on Tuesdays and Fridays.

---

### Shared Accounts

```
/conta ver nome:ACCOUNT_NAME mostrar-otp:BOOLEAN
```

Manages shared Ragnarok Online accounts with encrypted storage, TOTP 2FA support, and granular permissions. Credentials are sent securely via DM.

**Subcommands:**

| Command | Description |
|---------|-------------|
| `/conta ver` | View account credentials (sent via DM) |
| `/conta listar` | List accounts you have access to |
| `/conta criar` | Create a new shared account (you become owner) |
| `/conta editar` | Edit account (owner/admin only) |
| `/conta deletar` | Delete account (owner/admin only) |
| `/conta permissao` | Manage access permissions (owner/admin only) |
| `/conta totp` | Configure TOTP via QR code (owner/admin only) |
| `/conta historico` | View access history (owner/admin only) |

**Features:**
- **AES-256-GCM encryption** for all sensitive data
- **TOTP 2FA** support with QR code setup
- **Granular permissions** (user ID, username, role-based)
- **Auto-updating OTP codes** in DM (updates every 10s for 3 minutes)
- **Access logging** for audit trail
- **Access history** viewable by account owners
- **QR code upload** via web interface for easy TOTP setup

**Security:**
- All passwords, TOTP secrets, and Kafra passwords are encrypted at rest
- Credentials only accessible via Discord DM (never in public channels)
- Permission system supports allow/deny lists with role inheritance

---

### Party Groups

```
/grupo criar instancia:INSTANCE data:DATE hora:TIME vagas:SLOTS descricao:DESCRIPTION
```

Creates and manages party groups for Ragnarok Online instances with automatic notifications and loot distribution system.

**Subcommands:**

| Command | Description |
|---------|-------------|
| `/grupo criar` | Create a new party group |
| `/grupo listar` | List active groups in this server |
| `/grupo entrar id:ID` | Join a party group |
| `/grupo sair id:ID` | Leave a party group |
| `/grupo cancelar id:ID` | Cancel a group you created |
| `/grupo sortear id:ID` | Draw loot winners from party members |

**Features:**
- **Automatic notifications** at 2 hours, 30 minutes, and start time
- **Class limits** per instance (e.g., max 2 Priests, 1 Tank)
- **Loot distribution** with random drawing among party members
- **Instance autocomplete** with 50+ supported instances
- **Timezone-aware** scheduling (BRT/UTC-3)

**Supported Instances:**
Includes all major instances: Altar do Selo, Caverna do Polvo, Torre sem Fim, Cripta, Glastheim Sombria, and many more.

---

### Help

```
/ajuda
```

Shows the complete list of available commands with usage examples.

---

## Admin Panel

BeeWiki includes a comprehensive web-based admin panel for managing the bot:

### Dashboard
- Overview of alerts, users, and service status
- Real-time statistics and metrics
- Service health monitoring

### Market Alerts
- View all alerts across all users
- Filter by server, type, or user
- Monitor alert activity and notifications

### Shared Accounts
- **Create and manage** shared Ragnarok accounts
- **QR code upload** for TOTP setup (web interface)
- View and edit account permissions
- Access logs and audit trail
- Encrypted credential management

### Configuration
- **System settings**: Adjust check intervals, cooldowns, request delays
- **Environment variables editor**: Edit `.env` file securely with:
  - Grouped variables by category
  - Sensitive value masking (reveal on demand)
  - Automatic backup before save
  - Validation and error handling

### Permissions
- Manage who can use market alerts
- User ID, username, and role-based permissions
- Allow/deny lists

### Plugins
- Enable/disable plugins
- View plugin status and configuration
- Reload plugins without restart

### News
- View cached news from GNJoy LATAM
- Force refresh news cache
- Filter by category

### Deploy
- Deploy slash commands globally or per server
- View deployment status
- Manage command registrations

### Logs
- View system logs
- Filter by level and date
- Audit trail for admin actions

Access the admin panel at `http://localhost:3000` (or your configured host/port).

## Environment Variables

Create a `.env` file with the following variables. You can also edit them securely via the admin panel's Environment Variables editor.

### Required

```env
# Discord Bot
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_guild_id

# Admin Panel
ADMIN_PASSWORD=your_admin_password
ADMIN_HOST=0.0.0.0
ADMIN_PORT=3000
```

### Optional

```env
# Divine Pride API
DIVINE_PRIDE_API_KEY=your_divine_pride_api_key

# Session & Security
SESSION_SECRET=your_session_secret

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARN, ERROR

# Bot User ID (auto-detected if not set)
BOT_USER_ID=your_bot_user_id

# Shared Accounts Encryption (32 bytes hex = 64 characters)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_64_character_hex_key

# Salesforce Agentforce (for AI assistant plugin)
SALESFORCE_CLIENT_ID=your_client_id
SALESFORCE_CLIENT_SECRET=your_client_secret
SALESFORCE_INSTANCE_URL=https://your-instance.my.salesforce.com
AGENTFORCE_AGENT_ID=your_agent_id
AGENTFORCE_API_KEY=your_api_key

# SSL/TLS (for HTTPS)
SSL_CERT_PATH=path/to/cert.pem
SSL_KEY_PATH=path/to/key.pem
```

**Note:** Sensitive values (tokens, secrets, passwords) are automatically masked in the admin panel. Use the "reveal" button (👁️) to view them when needed.

## Installation

1. Clone the repository
   ```bash
   git clone https://github.com/Zack-Correa/RagWikiBot.git
   cd RagWikiBot
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create `.env` file with your credentials
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. (Optional) Generate encryption key for shared accounts
   ```bash
   openssl rand -hex 32
   # Add to .env as ENCRYPTION_KEY
   ```

5. Start the bot
   ```bash
   npm start
   ```

6. Access the admin panel
   - Open `http://localhost:3000` (or your configured host/port)
   - Login with your `ADMIN_PASSWORD`

## Plugins

BeeWiki uses a modular plugin system. Available plugins:

| Plugin | Commands | Description |
|--------|----------|-------------|
| `market-alerts` | `/alerta-mercado` | Market alerts with intelligent caching |
| `pricing` | `/preco-justo`, `/historico-preco` | Price analysis and history |
| `server-status` | `/servidor-status` | Server status monitoring |
| `events` | `/eventos` | GNJoy LATAM news and events |
| `party` | `/grupo` | Party groups for instances |
| `shared-accounts` | `/conta` | Shared account management with TOTP |
| `agentforce` | (AI assistant) | Natural language AI assistant |
| `metrics` | - | Usage metrics collection |

See [plugins/README.md](plugins/README.md) for plugin development documentation.

## Advanced Features

### Intelligent Query Strategy

The market alerts system uses an intelligent query optimization strategy:

- **Adaptive Caching**: TTL varies from 1-30 minutes based on item volatility
- **Priority Scheduling**: Alerts with recent activity or price drops are checked first
- **Smart Skipping**: Stable items or consecutive empty results are skipped intelligently
- **Volatility Analysis**: Tracks price patterns to optimize check frequency

### Automatic Alert Cleanup

- Alerts older than 30 days are automatically removed
- Users receive DM notifications before removal
- Bulk notifications grouped per user to avoid spam
- Configurable cleanup interval (default: daily)

### Shared Accounts Security

- **AES-256-GCM encryption** for all sensitive data
- **TOTP 2FA** with Google Authenticator support
- **QR code setup** via Discord DM or web interface
- **Granular permissions** with allow/deny lists
- **Access logging** for complete audit trail
- **Auto-updating OTP** codes in DM messages

### AI Assistant (Agentforce)

The bot includes an AI assistant plugin that:
- Responds to natural language questions about Ragnarok Online
- Automatically searches Divine Pride, Browiki, and Market
- Executes commands based on user intent
- Maintains conversation sessions per user

See [plugins/agentforce/README.md](plugins/agentforce/README.md) for setup instructions.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Leia-me em português

[LEIA-ME](https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md)

