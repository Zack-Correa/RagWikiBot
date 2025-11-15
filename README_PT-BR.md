# RagWiki

RagWiki é um bot para consultar itens, quests e mais em varias Wiki/Databases do Ragnarok Online.


## Funcionalidades
- [x] Consulta de histórias e missões no [bROwiki](https://browiki.org/)
- [x] Busca de itens por ID na database [Divine-Pride](https://www.divine-pride.net/database/item)
- [x] Busca de itens por nome na database [Divine-Pride](https://www.divine-pride.net/database/item) (com paginação)
- [x] Busca de monstros por ID na database [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Busca de mapas na database [Divine-Pride](https://www.divine-pride.net/database/map/)

## Comandos
Todos os comandos utilizam **Slash Commands** (comandos com barra `/`). Basta digitar `/` no Discord para ver a lista de comandos disponíveis.

> `/wiki termo:TERMO_PESQUISADO`

A funcionalidade ```wiki``` retorna todos os resultados encontrados no projeto [bROwiki](https://browiki.org/).

> `/buscar-item nome:NOME_DO_ITEM servidor:SERVIDOR`

A funcionalidade ```buscar-item``` retorna todos os resultados encontrados para o item desejado na database [Divine-Pride](https://www.divine-pride.net/database/item). Os resultados são paginados (10 itens por página) e você pode navegar usando os botões de paginação.

> `/buscar-item-id id:ID_DO_ITEM servidor:SERVIDOR`

A funcionalidade ```buscar-item-id``` retorna a descrição completa do item desejado no servidor especificado (opcional) de acordo com a database [Divine-Pride](https://www.divine-pride.net/database/item).

> `/buscar-monstro id:ID_DO_MONSTRO`

A funcionalidade ```buscar-monstro``` retorna informações detalhadas sobre o monstro, incluindo estatísticas, atributos, elemento, fraqueza, experiência, drops e mapas onde aparece.

> `/buscar-mapa id:ID_DO_MAPA`

A funcionalidade ```buscar-mapa``` retorna informações sobre o mapa, incluindo nome, tipo, música, monstros que aparecem e NPCs presentes. O ID do mapa deve estar no formato string (ex: `hu_fild03`, `prt_fild01`).

> `/ajuda`

Mostra a lista completa de comandos disponíveis com exemplos de uso.




## Contribuições
Pull requests são bem-vindas. Para mudanças maiores, por favor, abram uma issue primeiramente para discutir o que você gostaria de mudar.

Tenho relativamente pouca experiência com JS e menos ainda com Node, então fico aberto a mudanças estruturais a fim de aumentar a clareza do código.

## Licença
[MIT](https://choosealicense.com/licenses/mit/)