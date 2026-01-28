# RagWiki

RagWiki é um bot para consultar itens, quests e mais em varias Wiki/Databases do Ragnarok Online.


## Funcionalidades
- [x] Consulta de histórias e missões no [bROwiki](https://browiki.org/)
- [x] Busca de itens por ID na database [Divine-Pride](https://www.divine-pride.net/database/item)
- [x] Busca de itens por nome na database [Divine-Pride](https://www.divine-pride.net/database/item) (com paginação)
- [x] Busca de monstros por ID na database [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Busca de mapas na database [Divine-Pride](https://www.divine-pride.net/database/map/)
- [x] Busca no mercado oficial LATAM (sistema de transações do Ragnarok Online)
- [x] Sistema de alertas de mercado com notificações por DM (apenas admins)

## Comandos
Todos os comandos utilizam **Slash Commands** (comandos com barra `/`). Basta digitar `/` no Discord para ver a lista de comandos disponíveis.

### Busca na Wiki

> `/wiki termo:TERMO_PESQUISADO`

A funcionalidade ```wiki``` retorna todos os resultados encontrados no projeto [bROwiki](https://browiki.org/).

### Busca de Itens

> `/buscar-item busca:NOME_DO_ITEM idioma:IDIOMA`

A funcionalidade ```buscar-item``` retorna todos os resultados encontrados para o item desejado na database [Divine-Pride](https://www.divine-pride.net/database/item). Os resultados são paginados (10 itens por página) e você pode navegar usando os botões de paginação.

### Busca de Monstros

> `/buscar-monstro busca:NOME_DO_MONSTRO idioma:IDIOMA`

A funcionalidade ```buscar-monstro``` retorna informações detalhadas sobre o monstro, incluindo estatísticas, atributos, elemento, fraqueza, experiência, drops e mapas onde aparece.

### Busca de Mapas

> `/buscar-mapa busca:NOME_DO_MAPA idioma:IDIOMA`

A funcionalidade ```buscar-mapa``` retorna informações sobre o mapa, incluindo nome, tipo, música, monstros que aparecem e NPCs presentes.

### Busca no Mercado

> `/buscar-mercado busca:NOME_DO_ITEM tipo:Comprando|Vendendo servidor:Freya|Nidhogg|Yggdrasil`

A funcionalidade ```buscar-mercado``` pesquisa itens no sistema de transações oficial do Ragnarok Online LATAM. Mostra os anúncios atuais com preços, quantidades, nomes das lojas e personagens vendedores.

### Alertas de Mercado (Apenas Admins)

> `/alerta-mercado adicionar item:NOME_DO_ITEM tipo:Comprando|Vendendo servidor:SERVIDOR preco-maximo:PRECO_MAX quantidade-minima:QTD_MIN`

Cria um alerta de mercado. O bot verifica o mercado a cada 15 minutos e envia uma notificação por DM quando encontrar itens que correspondem aos seus critérios. Também notifica imediatamente quando um preço mais baixo é detectado.

> `/alerta-mercado listar`

Lista todos os seus alertas de mercado configurados.

> `/alerta-mercado remover id:ID_DO_ALERTA`

Remove um alerta específico pelo ID.

> `/alerta-mercado limpar`

Remove todos os seus alertas de uma vez.

> `/alerta-mercado status`

Mostra o status do sistema de alertas (total de alertas, buscas únicas, última verificação).

> `/alerta-mercado verificar`

Força uma verificação imediata do mercado para todos os alertas.

### Ajuda

> `/ajuda`

Mostra a lista completa de comandos disponíveis com exemplos de uso.




## Contribuições
Pull requests são bem-vindas. Para mudanças maiores, por favor, abram uma issue primeiramente para discutir o que você gostaria de mudar.

Tenho relativamente pouca experiência com JS e menos ainda com Node, então fico aberto a mudanças estruturais a fim de aumentar a clareza do código.

## Licença
[MIT](https://choosealicense.com/licenses/mit/)