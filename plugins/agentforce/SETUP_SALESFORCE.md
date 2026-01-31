# Guia de Configuração do Salesforce Agentforce

Este guia detalha como configurar o Salesforce Agentforce para funcionar com o plugin RagWikiBot.

## Pré-requisitos

- Conta Salesforce com licença Agentforce
- Acesso ao Setup como administrador
- VS Code com Salesforce Extension Pack (opcional, para Apex)

---

## Parte 1: Criar External Client App (OAuth)

### 1.1 Acessar o Setup

1. No Salesforce, clique na engrenagem (⚙️) > **Setup**
2. Na busca rápida, digite **"External Client App"**
3. Clique em **External Client Apps Manager**

### 1.2 Criar Nova App

1. Clique em **New External Client App**
2. Preencha:
   - **Name**: `RagWikiBot`
   - **API Name**: `RagWikiBot`
   - **Description**: `Discord bot integration for Ragnarok Online assistance`
   - **Contact Email**: seu email

3. Clique em **Save**

### 1.3 Configurar OAuth

Na aba **OAuth Settings**, configure:

#### Enable OAuth Settings: ✅ Marcado

#### Callback URL:
```
https://login.salesforce.com/services/oauth2/callback
```

#### Selected OAuth Scopes (adicione todos):
- ✅ Manage user data via APIs (api)
- ✅ Perform requests at any time (refresh_token, offline_access)
- ✅ Access chatbot services (chatbot_api)
- ✅ Access the Salesforce API Platform (sfap_api)

#### Outras configurações:
- ✅ Enable Client Credentials Flow
- ✅ Issue JWT Web Token (JWT)-based access tokens for named users
- ❌ Require secret for Web Server Flow (desmarcar)
- ❌ Require secret for Refresh Token Flow (desmarcar)
- ❌ Require Proof Key for Code Exchange (PKCE) (desmarcar)

4. Clique em **Save**

### 1.4 Configurar Policy

1. Vá para a aba **Policy**
2. Marque **Enable Client Credentials Flow**
3. Em **Run As (Username)**, selecione um usuário com permissão de API
   - Recomendado: criar um usuário de integração específico
4. Clique em **Save**

### 1.5 Obter Credenciais

1. Vá para a aba **Settings**
2. Expanda **OAuth Settings**
3. Clique em **Consumer Key and Secret**
4. Copie:
   - **Consumer Key** → será seu `SALESFORCE_CLIENT_ID`
   - **Consumer Secret** → será seu `SALESFORCE_CLIENT_SECRET`

### 1.6 Obter Instance URL

Sua Instance URL é a base da URL do Salesforce:
- Se você acessa `https://mycompany.lightning.force.com/...`
- A Instance URL é: `https://mycompany.my.salesforce.com`

---

## Parte 2: Criar o Agente no Agentforce Builder

### 2.1 Acessar Agentforce Builder

1. No App Launcher (grade de 9 pontos), busque **"Agentforce"** ou **"Einstein"**
2. Ou acesse: Setup > AI > Agentforce

### 2.2 Criar Novo Agente

1. Clique em **New Agent**
2. Configure:
   - **Name**: `RagnarokAssistant`
   - **API Name**: `RagnarokAssistant`
   - **Description**: `Assistente para Ragnarok Online que responde perguntas sobre itens, monstros, mapas e mercado`

3. Clique em **Create**

### 2.3 Configurar Instruções do Agente

Na seção de instruções, adicione:

```
Você é um assistente especializado em Ragnarok Online LATAM.

Seu objetivo é ajudar jogadores respondendo perguntas sobre:
- Itens (equipamentos, cartas, consumíveis)
- Monstros (stats, drops, localizações)
- Mapas (localizações, NPCs)
- Mercado (preços, vendedores)
- Conteúdo de wikis

REGRAS IMPORTANTES:
1. Sempre identifique a intenção do usuário e execute a action apropriada
2. Para buscas de itens, use search_item
3. Para buscas de monstros, use search_monster
4. Para buscas de mapas, use search_map
5. Para consultas de preço/mercado, use search_market
6. Para análise se um preço está justo, use check_price
7. Para conteúdo geral/wiki, use search_wiki

IDIOMA:
- Responda sempre em português brasileiro
- O parâmetro language deve ser "pt" para buscas

SERVIDORES:
- Servidor padrão é FREYA
- Outros servidores: THOR, VALHALLA
```

### 2.4 Obter Agent ID

1. Após salvar, observe a URL do agente
2. Ou vá para Setup > AI > Agents
3. O Agent ID está na coluna ID ou na URL
4. Copie → será seu `AGENTFORCE_AGENT_ID`

---

## Parte 3: Criar Topics e Actions

### 3.1 Criar Topic "Ragnarok Online"

1. No Agentforce Builder, vá para **Topics**
2. Clique em **New Topic**
3. Configure:
   - **Name**: `RagnarokOnline`
   - **Description**: `Tópico para consultas sobre Ragnarok Online`
   - **Classification Instructions**: 
     ```
     Este tópico deve ser ativado quando o usuário perguntar sobre:
     - Itens, equipamentos, cartas
     - Monstros, MVPs, drops
     - Mapas, localizações
     - Preços, mercado
     - Qualquer coisa relacionada a Ragnarok Online
     ```

### 3.2 Criar Actions (usando Apex Invocable)

Crie uma classe Apex para cada action. Vá para Setup > Developer Console ou VS Code.

#### Action: search_item

```apex
public class AgentforceSearchItem {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Search Query')
        public String query;
        
        @InvocableVariable(label='Language')
        public String language;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Action Name')
        public String action;
        
        @InvocableVariable(label='Parameters')
        public String params;
    }
    
    @InvocableMethod(
        label='Search Item'
        description='Search for items in Ragnarok Online'
        category='Ragnarok'
    )
    public static List<SearchOutput> searchItem(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            output.action = 'search_item';
            
            Map<String, String> params = new Map<String, String>();
            params.put('query', input.query);
            params.put('language', String.isBlank(input.language) ? 'pt' : input.language);
            
            output.params = JSON.serialize(params);
            outputs.add(output);
        }
        
        return outputs;
    }
}
```

#### Action: search_monster

```apex
public class AgentforceSearchMonster {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Search Query')
        public String query;
        
        @InvocableVariable(label='Language')
        public String language;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Action Name')
        public String action;
        
        @InvocableVariable(label='Parameters')
        public String params;
    }
    
    @InvocableMethod(
        label='Search Monster'
        description='Search for monsters in Ragnarok Online'
        category='Ragnarok'
    )
    public static List<SearchOutput> searchMonster(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            output.action = 'search_monster';
            
            Map<String, String> params = new Map<String, String>();
            params.put('query', input.query);
            params.put('language', String.isBlank(input.language) ? 'pt' : input.language);
            
            output.params = JSON.serialize(params);
            outputs.add(output);
        }
        
        return outputs;
    }
}
```

#### Action: search_market

```apex
public class AgentforceSearchMarket {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Search Query')
        public String query;
        
        @InvocableVariable(label='Server')
        public String server;
        
        @InvocableVariable(label='Store Type')
        public String storeType;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Action Name')
        public String action;
        
        @InvocableVariable(label='Parameters')
        public String params;
    }
    
    @InvocableMethod(
        label='Search Market'
        description='Search for items in the Ragnarok Online market'
        category='Ragnarok'
    )
    public static List<SearchOutput> searchMarket(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            output.action = 'search_market';
            
            Map<String, String> params = new Map<String, String>();
            params.put('query', input.query);
            params.put('server', String.isBlank(input.server) ? 'FREYA' : input.server);
            params.put('type', String.isBlank(input.storeType) ? 'SELL' : input.storeType);
            
            output.params = JSON.serialize(params);
            outputs.add(output);
        }
        
        return outputs;
    }
}
```

#### Action: search_map

```apex
public class AgentforceSearchMap {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Search Query')
        public String query;
        
        @InvocableVariable(label='Language')
        public String language;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Action Name')
        public String action;
        
        @InvocableVariable(label='Parameters')
        public String params;
    }
    
    @InvocableMethod(
        label='Search Map'
        description='Search for maps in Ragnarok Online'
        category='Ragnarok'
    )
    public static List<SearchOutput> searchMap(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            output.action = 'search_map';
            
            Map<String, String> params = new Map<String, String>();
            params.put('query', input.query);
            params.put('language', String.isBlank(input.language) ? 'pt' : input.language);
            
            output.params = JSON.serialize(params);
            outputs.add(output);
        }
        
        return outputs;
    }
}
```

#### Action: search_wiki

```apex
public class AgentforceSearchWiki {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Search Query')
        public String query;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Action Name')
        public String action;
        
        @InvocableVariable(label='Parameters')
        public String params;
    }
    
    @InvocableMethod(
        label='Search Wiki'
        description='Search in Browiki for Ragnarok Online content'
        category='Ragnarok'
    )
    public static List<SearchOutput> searchWiki(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            output.action = 'search_wiki';
            
            Map<String, String> params = new Map<String, String>();
            params.put('query', input.query);
            
            output.params = JSON.serialize(params);
            outputs.add(output);
        }
        
        return outputs;
    }
}
```

#### Action: check_price

```apex
public class AgentforceCheckPrice {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Item Name')
        public String item;
        
        @InvocableVariable(label='Price to Check')
        public Decimal price;
        
        @InvocableVariable(label='Server')
        public String server;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Action Name')
        public String action;
        
        @InvocableVariable(label='Parameters')
        public String params;
    }
    
    @InvocableMethod(
        label='Check Price'
        description='Analyze if a price is fair for an item'
        category='Ragnarok'
    )
    public static List<SearchOutput> checkPrice(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            output.action = 'check_price';
            
            Map<String, Object> params = new Map<String, Object>();
            params.put('item', input.item);
            params.put('price', input.price);
            params.put('server', String.isBlank(input.server) ? 'FREYA' : input.server);
            
            output.params = JSON.serialize(params);
            outputs.add(output);
        }
        
        return outputs;
    }
}
```

### 3.3 Adicionar Actions ao Topic

1. Volte ao Agentforce Builder
2. Abra o Topic **RagnarokOnline**
3. Na seção **Actions**, clique em **Add Action**
4. Para cada classe Apex criada:
   - Selecione o tipo **Apex Invocable Method**
   - Escolha a classe correspondente
   - Configure as instruções de quando usar

### 3.4 Configurar Instruções das Actions

Para cada action, adicione instruções como:

**search_item:**
```
Use esta action quando o usuário perguntar sobre itens, equipamentos, cartas, ou consumíveis.
Exemplos: "O que é uma Adaga?", "Onde dropa Carta Poring?", "Quais são os stats da Excalibur?"
```

**search_monster:**
```
Use esta action quando o usuário perguntar sobre monstros, MVPs, ou drops de monstros.
Exemplos: "Qual o drop rate do Poring?", "Onde encontro o Baphomet?", "Quais itens o Orc dropa?"
```

**search_market:**
```
Use esta action quando o usuário quiser saber preços ou disponibilidade no mercado.
Exemplos: "Quanto custa uma Adaga?", "Tem alguém vendendo Carta Ghostring?", "Preço da Excalibur em Freya"
```

**check_price:**
```
Use esta action quando o usuário perguntar se um preço específico está justo ou quer análise de preço.
Exemplos: "500k por uma Adaga está caro?", "O preço de 1M pela Excalibur é justo?"
```

---

## Parte 4: Ativar e Testar

### 4.1 Ativar o Agente

1. No Agentforce Builder, clique em **Activate**
2. Confirme a ativação

### 4.2 Testar no Salesforce

1. Use o painel de teste do Agentforce Builder
2. Digite perguntas como:
   - "Qual o drop rate do Poring?"
   - "Quanto custa uma Adaga no mercado?"
3. Verifique se as actions estão sendo chamadas corretamente

### 4.3 Configurar o Bot Discord

Adicione no seu `.env`:

```env
SALESFORCE_CLIENT_ID=seu_consumer_key_aqui
SALESFORCE_CLIENT_SECRET=seu_consumer_secret_aqui
SALESFORCE_INSTANCE_URL=https://sua-instancia.my.salesforce.com
AGENTFORCE_AGENT_ID=seu_agent_id_aqui
```

### 4.4 Testar no Discord

1. Reinicie o bot
2. Mencione o bot: `@RagWikiBot qual o drop rate do Poring?`
3. Ou envie DM para o bot

---

## Troubleshooting

### Erro de Autenticação

1. Verifique se Client ID e Secret estão corretos
2. Confirme que "Enable Client Credentials Flow" está marcado
3. Verifique se o usuário "Run As" tem permissões de API

### Agent não responde

1. Verifique se o agente está ativado
2. Teste diretamente no Agentforce Builder
3. Verifique os logs do Salesforce em Setup > Debug Logs

### Actions não são executadas

1. Verifique se as classes Apex estão deployadas e sem erros
2. Confirme que as actions estão adicionadas ao topic
3. Revise as instruções do agente e das actions

---

## Recursos Adicionais

- [Documentação Agent API](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-get-started.html)
- [Trailhead: External Client Apps](https://trailhead.salesforce.com/content/learn/projects/build-integrations-with-external-client-apps)
- [Criar Actions Customizadas](https://developer.salesforce.com/docs/einstein/genai/guide/get-started-actions.html)
