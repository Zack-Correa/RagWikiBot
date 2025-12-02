# RagWiki

RagWiki is a bot to get items, quests and more from various Ragnarok Wiki/Databases


## Features
- [x] Search of quests and game history in [bROwiki](https://browiki.org/)
- [x] Search of items by ID in the database [Divine-Pride](https://www.divine-pride.net/database/item)
- [x] Search of items by name in the database [Divine-Pride](https://www.divine-pride.net/database/item) (with pagination)
- [x] Search of monsters by ID in the database [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Search of maps in the database [Divine-Pride](https://www.divine-pride.net/database/map/)

## Commands
All commands use **Slash Commands** (commands with `/`). Just type `/` in Discord to see the list of available commands.

> `/wiki termo:SEARCH_TERM`

The feature ```wiki``` gives you all the search results for the desired term on the [bROwiki](https://browiki.org/) project.

> `/buscar-item nome:ITEM_NAME servidor:SERVER`

The feature ```buscar-item``` gives you all the search results for the desired item on the [Divine-Pride](https://www.divine-pride.net/database/item) database. Results are paginated (10 items per page) and you can navigate using pagination buttons.

> `/buscar-item-id id:ITEM_ID servidor:SERVER`

The feature ```buscar-item-id``` gives you the complete item description on the specified server (optional) according to the [Divine-Pride](https://www.divine-pride.net/database/item) database.

> `/buscar-monstro id:MONSTER_ID`

The feature ```buscar-monstro``` returns detailed information about the monster, including statistics, attributes, element, weakness, experience, drops and maps where it appears.

> `/buscar-mapa id:MAP_ID`

The feature ```buscar-mapa``` returns information about the map, including name, type, music, monsters that appear and NPCs present. The map ID must be in string format (e.g., `hu_fild03`, `prt_fild01`).

> `/ajuda`

Shows the complete list of available commands with usage examples.




## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.


## License
[MIT](https://choosealicense.com/licenses/mit/)

## Leia-me em português
[LEIA-ME](https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md)