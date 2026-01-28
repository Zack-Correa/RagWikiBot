# BeeWiki (RagWiki)

BeeWiki is a Discord bot for Ragnarok Online LATAM that provides item search, market alerts, price analysis, server status, and more.

## Features

- [x] Search quests and game history on [bROwiki](https://browiki.org/)
- [x] Search items by ID/name on [Divine-Pride](https://www.divine-pride.net/database/item) (LATAM/bRO servers)
- [x] Search monsters on [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Search maps on [Divine-Pride](https://www.divine-pride.net/database/map/)
- [x] Search cards by effect or name
- [x] Search the official LATAM market (trading system)
- [x] Market alerts system with DM notifications
- [x] Price history tracking
- [x] AI-powered price analysis
- [x] Server status monitoring
- [x] News from GNJoy LATAM
- [x] Admin web panel

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

### Card Search

```
/buscar-card busca:SEARCH_TERM tipo:SEARCH_TYPE
```

Searches for cards by effect or name. Great for finding cards with specific bonuses.

**Parameters:**
- `busca` - Card effect or name (e.g., "dano em mortos-vivos", "Hydra") (required)
- `tipo` - Search type: Por Nome, Por Efeito, Ambos (default: Ambos)

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

Creates a market alert. The bot checks the market every 15 minutes and sends a DM notification when items matching your criteria are found. Notifies again if a lower price is detected.

**Subcommands:**

| Command | Description |
|---------|-------------|
| `/alerta-mercado adicionar` | Create a new alert |
| `/alerta-mercado listar` | List your alerts |
| `/alerta-mercado remover id:ID` | Remove an alert |
| `/alerta-mercado limpar` | Remove all your alerts |
| `/alerta-mercado status` | Show system status |
| `/alerta-mercado verificar` | Force immediate check |

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

### Help

```
/ajuda
```

Shows the complete list of available commands with usage examples.

---

## Admin Panel

BeeWiki includes a web-based admin panel for managing the bot:

- **Dashboard** - Overview of alerts, users, and service status
- **Metrics** - Usage statistics and charts
- **Alerts** - View and manage market alerts
- **Configuration** - Adjust intervals and cooldowns
- **Permissions** - Manage who can use market alerts
- **News** - View cached news and force refresh
- **Deploy** - Deploy slash commands globally or per server
- **Logs** - View system logs

Access the admin panel at `http://localhost:3000` (or your configured host/port).

## Environment Variables

Create a `.env` file with the following variables:

```env
# Discord Bot
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id

# Divine Pride API
DIVINE_PRIDE_API_KEY=your_divine_pride_api_key

# Admin Panel
ADMIN_PASSWORD=your_admin_password
ADMIN_HOST=0.0.0.0
ADMIN_PORT=3000
SESSION_SECRET=your_session_secret

# Optional
LOG_LEVEL=INFO
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with your credentials
4. Start the bot: `npm start`

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Leia-me em português

[LEIA-ME](https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md)
