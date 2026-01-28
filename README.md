# RagWiki

RagWiki is a bot to get items, quests and more from various Ragnarok Wiki/Databases


## Features
- [x] Search of quests and game history in [bROwiki](https://browiki.org/)
- [x] Search of items by ID in the database [Divine-Pride](https://www.divine-pride.net/database/item)
- [x] Search of items by name in the database [Divine-Pride](https://www.divine-pride.net/database/item) (with pagination)
- [x] Search of monsters by ID in the database [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Search of maps in the database [Divine-Pride](https://www.divine-pride.net/database/map/)
- [x] Search in the official LATAM market (Ragnarok Online trading system)
- [x] Market alerts system with DM notifications (admin only)

## Commands
All commands use **Slash Commands** (commands with `/`). Just type `/` in Discord to see the list of available commands.

### Wiki Search

> `/wiki termo:SEARCH_TERM`

The feature ```wiki``` gives you all the search results for the desired term on the [bROwiki](https://browiki.org/) project.

### Item Search

> `/buscar-item busca:ITEM_NAME idioma:LANGUAGE`

The feature ```buscar-item``` gives you all the search results for the desired item on the [Divine-Pride](https://www.divine-pride.net/database/item) database. Results are paginated (10 items per page) and you can navigate using pagination buttons.

### Monster Search

> `/buscar-monstro busca:MONSTER_NAME idioma:LANGUAGE`

The feature ```buscar-monstro``` returns detailed information about the monster, including statistics, attributes, element, weakness, experience, drops and maps where it appears.

### Map Search

> `/buscar-mapa busca:MAP_NAME idioma:LANGUAGE`

The feature ```buscar-mapa``` returns information about the map, including name, type, music, monsters that appear and NPCs present.

### Market Search

> `/buscar-mercado busca:ITEM_NAME tipo:BUY|SELL servidor:FREYA|NIDHOGG|YGGDRASIL`

The feature ```buscar-mercado``` searches for items in the official Ragnarok Online LATAM trading system. Shows current listings with prices, quantities, store names and seller characters.

### Market Alerts (Admin Only)

> `/alerta-mercado adicionar item:ITEM_NAME tipo:BUY|SELL servidor:SERVER preco-maximo:MAX_PRICE quantidade-minima:MIN_QTY`

Creates a market alert. The bot checks the market every 15 minutes and sends a DM notification when items matching your criteria are found. It also notifies immediately when a lower price is detected.

> `/alerta-mercado listar`

Lists all your configured market alerts.

> `/alerta-mercado remover id:ALERT_ID`

Removes a specific alert by ID.

> `/alerta-mercado status`

Shows the alert system status (total alerts, unique searches, last check time).

> `/alerta-mercado verificar`

Forces an immediate market check for all alerts.

### Help

> `/ajuda`

Shows the complete list of available commands with usage examples.




## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.


## License
[MIT](https://choosealicense.com/licenses/mit/)

## Leia-me em português
[LEIA-ME](https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md)