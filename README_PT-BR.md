# RagWiki

RagWiki é um bot para consultar itens, quests e mais em varias Wiki/Databases do Ragnarok Online.


## Funcionalidades
- [x] Consulta de histórias e missões no [bROwiki](https://browiki.org/)
- [x] Busca de itens por ID/nome na database [Divine-Pride](https://www.divine-pride.net/database/item) (com paginação)
- [x] Busca de monstros na database [Divine-Pride](https://www.divine-pride.net/database/monster)
- [x] Busca de mapas na database [Divine-Pride](https://www.divine-pride.net/database/map/)
- [x] Busca no mercado oficial LATAM (sistema de transações do Ragnarok Online)
- [x] **Sistema inteligente de alertas de mercado** com cache adaptativo e agendamento inteligente
- [x] **Limpeza automática de alertas** (remove alertas com mais de 30 dias com notificação)
- [x] Histórico de preços (retenção de 90 dias)
- [x] Análise de preços com IA
- [x] Monitoramento de status dos servidores
- [x] Notícias do GNJoy LATAM (atualização automática terças e sextas)
- [x] **Gerenciamento de contas compartilhadas** com TOTP 2FA e permissões granulares
- [x] **Sistema de grupos** para agendamento de instâncias com distribuição de loot
- [x] **Assistente IA** (plugin Agentforce) para consultas em linguagem natural
- [x] **Painel web administrativo** completo

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

### Alertas de Mercado

> `/alerta-mercado adicionar item:NOME_DO_ITEM tipo:Comprando|Vendendo servidor:SERVIDOR preco-maximo:PRECO_MAX quantidade-minima:QTD_MIN`

Cria um alerta de mercado. O bot usa uma **estratégia inteligente de consultas** que:
- Cache adaptativo baseado na volatilidade do item (TTL de 1-30 minutos)
- Prioriza alertas com atividade recente ou quedas de preço
- Pula consultas desnecessárias para itens estáveis ou resultados vazios consecutivos
- Remove automaticamente alertas com mais de 30 dias (com notificação por DM)

O bot verifica o mercado em intervalos configuráveis (padrão: 15 minutos) e envia uma notificação por DM quando encontrar itens que correspondem aos seus critérios. Também notifica quando um preço mais baixo é detectado.

**Subcomandos:**

| Comando | Descrição |
|---------|-----------|
| `/alerta-mercado adicionar` | Criar um novo alerta |
| `/alerta-mercado listar` | Listar seus alertas |
| `/alerta-mercado remover id:ID` | Remover um alerta |
| `/alerta-mercado limpar` | Remover todos os seus alertas |
| `/alerta-mercado status` | Mostrar status do sistema |
| `/alerta-mercado verificar` | Forçar verificação imediata |

**Recursos:**
- **Cache adaptativo**: Itens que mudam frequentemente são verificados mais vezes, itens estáveis menos vezes
- **Priorização inteligente**: Alertas com resultados recentes ou quedas de preço são verificados primeiro
- **Limpeza automática**: Alertas inativos há 30+ dias são removidos automaticamente (usuários notificados por DM)

### Contas Compartilhadas

> `/conta ver nome:NOME_DA_CONTA mostrar-otp:BOOLEAN`

Gerencia contas compartilhadas do Ragnarok Online com armazenamento criptografado, suporte a TOTP 2FA e permissões granulares. As credenciais são enviadas de forma segura via DM.

**Subcomandos:**

| Comando | Descrição |
|---------|-----------|
| `/conta ver` | Ver credenciais da conta (enviado via DM) |
| `/conta listar` | Listar contas que você tem acesso |
| `/conta criar` | Criar uma nova conta compartilhada (você vira dono) |
| `/conta editar` | Editar conta (apenas dono ou admin) |
| `/conta deletar` | Deletar conta (apenas dono ou admin) |
| `/conta permissao` | Gerenciar permissões de acesso (apenas dono ou admin) |
| `/conta totp` | Configurar TOTP via QR Code (apenas dono ou admin) |
| `/conta historico` | Ver histórico de acessos (apenas dono ou admin) |

**Recursos:**
- **Criptografia AES-256-GCM** para todos os dados sensíveis
- **Suporte a TOTP 2FA** com configuração via QR Code
- **Permissões granulares** (ID de usuário, nome de usuário, baseado em cargos)
- **Códigos OTP auto-atualizáveis** em DM (atualiza a cada 10s por 3 minutos)
- **Log de acessos** para auditoria
- **Histórico de acessos** visualizável pelos donos das contas
- **Upload de QR Code** via interface web para configuração fácil de TOTP

**Segurança:**
- Todas as senhas, secrets TOTP e senhas Kafra são criptografadas em repouso
- Credenciais acessíveis apenas via DM do Discord (nunca em canais públicos)
- Sistema de permissões suporta listas de permitir/negar com herança de cargos

### Grupos para Instâncias

> `/grupo criar instancia:NOME data:DATA hora:HORA vagas:VAGAS descricao:DESCRICAO`

Cria e gerencia grupos para instâncias do Ragnarok Online com notificações automáticas e sistema de distribuição de loot.

**Subcomandos:**

| Comando | Descrição |
|---------|-----------|
| `/grupo criar` | Criar um novo grupo |
| `/grupo listar` | Listar grupos ativos neste servidor |
| `/grupo entrar id:ID` | Entrar em um grupo |
| `/grupo sair id:ID` | Sair de um grupo |
| `/grupo cancelar id:ID` | Cancelar um grupo que você criou |
| `/grupo sortear id:ID` | Sortear ganhadores de loot entre membros |

**Recursos:**
- **Notificações automáticas** às 2 horas, 30 minutos e no horário de início
- **Limites de classe** por instância (ex: máx 2 Priests, 1 Tank)
- **Distribuição de loot** com sorteio aleatório entre membros
- **Autocomplete de instâncias** com 50+ instâncias suportadas
- **Agendamento com fuso horário** (BRT/UTC-3)

**Instâncias Suportadas:**
Inclui todas as principais instâncias: Altar do Selo, Caverna do Polvo, Torre sem Fim, Cripta, Glastheim Sombria, e muitas outras.

### Análise de Preços

> `/preco-justo item:NOME preco:PRECO servidor:SERVIDOR tipo:TIPO`

Analisa se o preço de um item está justo baseado em dados históricos usando algoritmos estatísticos.

### Histórico de Preços

> `/historico-preco item:NOME servidor:SERVIDOR tipo:TIPO dias:DIAS`

Mostra o histórico de preços de um item do mercado com estatísticas (mínimo, máximo, média, mediana).

### Status do Servidor

> `/servidor-status servidor:SERVIDOR atualizar:BOOLEAN`

Mostra o status dos servidores do Ragnarok Online LATAM.

### Eventos / Notícias

> `/eventos`

Mostra as últimas notícias e anúncios do GNJoy LATAM, categorizados por tipo. As notícias são cacheadas e atualizadas automaticamente nas terças e sextas.

### Ajuda

> `/ajuda`

Mostra a lista completa de comandos disponíveis com exemplos de uso.

## Painel Administrativo

O BeeWiki inclui um painel web completo para gerenciar o bot:

- **Dashboard** - Visão geral de alertas, usuários e status do serviço
- **Alertas** - Ver e gerenciar alertas de mercado
- **Contas Compartilhadas** - Criar e gerenciar contas com QR Code para TOTP
- **Configurações** - Ajustar intervalos, cooldowns e variáveis de ambiente
- **Permissões** - Gerenciar quem pode usar alertas de mercado
- **Plugins** - Ativar/desativar plugins
- **Notícias** - Ver notícias cacheadas e forçar atualização
- **Deploy** - Fazer deploy de comandos slash globalmente ou por servidor
- **Logs** - Ver logs do sistema

Acesse o painel em `http://localhost:3000` (ou seu host/porta configurado).

## Variáveis de Ambiente

Crie um arquivo `.env` com as seguintes variáveis. Você também pode editá-las de forma segura via o editor de variáveis de ambiente no painel admin.

### Obrigatórias

```env
# Discord Bot
DISCORD_TOKEN=seu_token_do_bot
CLIENT_ID=seu_client_id
GUILD_ID=seu_guild_id

# Painel Admin
ADMIN_PASSWORD=sua_senha_admin
ADMIN_HOST=0.0.0.0
ADMIN_PORT=3000
```

### Opcionais

```env
# Divine Pride API
DIVINE_PRIDE_API_KEY=sua_chave_api

# Sessão e Segurança
SESSION_SECRET=seu_secret_de_sessao

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARN, ERROR

# Bot User ID (detectado automaticamente se não definido)
BOT_USER_ID=seu_bot_user_id

# Chave de Criptografia para Contas Compartilhadas (32 bytes hex = 64 caracteres)
# Gere com: openssl rand -hex 32
ENCRYPTION_KEY=sua_chave_hex_de_64_caracteres

# Salesforce Agentforce (para plugin de assistente IA)
SALESFORCE_CLIENT_ID=seu_client_id
SALESFORCE_CLIENT_SECRET=seu_client_secret
SALESFORCE_INSTANCE_URL=https://sua-instancia.my.salesforce.com
AGENTFORCE_AGENT_ID=seu_agent_id
AGENTFORCE_API_KEY=sua_api_key

# SSL/TLS (para HTTPS)
SSL_CERT_PATH=caminho/para/cert.pem
SSL_KEY_PATH=caminho/para/key.pem
```

**Nota:** Valores sensíveis (tokens, secrets, senhas) são automaticamente mascarados no painel admin. Use o botão "revelar" (👁️) para visualizá-los quando necessário.

## Instalação

1. Clone o repositório
   ```bash
   git clone https://github.com/Zack-Correa/RagWikiBot.git
   cd RagWikiBot
   ```

2. Instale as dependências
   ```bash
   npm install
   ```

3. Crie o arquivo `.env` com suas credenciais
   ```bash
   cp .env.example .env
   # Edite .env com seus valores
   ```

4. (Opcional) Gere chave de criptografia para contas compartilhadas
   ```bash
   openssl rand -hex 32
   # Adicione ao .env como ENCRYPTION_KEY
   ```

5. Inicie o bot
   ```bash
   npm start
   ```

6. Acesse o painel admin
   - Abra `http://localhost:3000` (ou seu host/porta configurado)
   - Faça login com sua `ADMIN_PASSWORD`

## Recursos Avançados

### Estratégia Inteligente de Consultas

O sistema de alertas de mercado usa uma estratégia de otimização inteligente:

- **Cache Adaptativo**: TTL varia de 1-30 minutos baseado na volatilidade do item
- **Agendamento por Prioridade**: Alertas com atividade recente ou quedas de preço são verificados primeiro
- **Skip Inteligente**: Itens estáveis ou resultados vazios consecutivos são pulados inteligentemente
- **Análise de Volatilidade**: Rastreia padrões de preço para otimizar frequência de verificação

### Limpeza Automática de Alertas

- Alertas com mais de 30 dias são automaticamente removidos
- Usuários recebem notificações por DM antes da remoção
- Notificações em lote agrupadas por usuário para evitar spam
- Intervalo de limpeza configurável (padrão: diário)

### Segurança de Contas Compartilhadas

- **Criptografia AES-256-GCM** para todos os dados sensíveis
- **TOTP 2FA** com suporte ao Google Authenticator
- **Configuração via QR Code** via DM do Discord ou interface web
- **Permissões granulares** com listas de permitir/negar
- **Log de acessos** para auditoria completa
- **Códigos OTP auto-atualizáveis** em mensagens DM

### Assistente IA (Agentforce)

O bot inclui um plugin de assistente IA que:
- Responde perguntas em linguagem natural sobre Ragnarok Online
- Busca automaticamente no Divine Pride, Browiki e Mercado
- Executa comandos baseado na intenção do usuário
- Mantém sessões de conversa por usuário

Veja [plugins/agentforce/README.md](plugins/agentforce/README.md) para instruções de configuração.

## Contribuições
Pull requests são bem-vindas. Para mudanças maiores, por favor, abram uma issue primeiramente para discutir o que você gostaria de mudar.

Tenho relativamente pouca experiência com JS e menos ainda com Node, então fico aberto a mudanças estruturais a fim de aumentar a clareza do código.

## Licença
[MIT](https://choosealicense.com/licenses/mit/)