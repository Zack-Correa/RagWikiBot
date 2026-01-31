# Classes Apex para Agentforce

Este diretório contém as classes Apex que devem ser deployadas no Salesforce para o Agentforce chamar a API do RagWikiBot.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `RagnarokApiService.cls` | Serviço base que faz HTTP callouts para a API do bot |
| `AgentforceSearchItem.cls` | Action para buscar itens |
| `AgentforceSearchMonster.cls` | Action para buscar monstros |
| `AgentforceSearchMap.cls` | Action para buscar mapas |
| `AgentforceSearchMarket.cls` | Action para buscar no mercado |
| `AgentforceSearchWiki.cls` | Action para buscar na wiki |
| `AgentforceCheckPrice.cls` | Action para analisar preços |

## Pré-requisitos no Salesforce

### 1. Remote Site Settings

1. Setup > Security > Remote Site Settings
2. Click **New Remote Site**
3. Configure:
   - **Remote Site Name**: `RagWikiBot`
   - **Remote Site URL**: `https://seu-bot-url.com` (URL pública do bot)
   - **Active**: ✅ Checked

### 2. Named Credential (Opcional, mais seguro)

1. Setup > Security > Named Credentials
2. Click **New Named Credential**
3. Configure:
   - **Label**: `RagWikiBot`
   - **URL**: `https://seu-bot-url.com/api/agentforce`
   - **Identity Type**: Anonymous
   - **Authentication Protocol**: No Authentication
   - **Custom Headers**: `X-API-Key: sua-api-key`

## Deploy das Classes

### Opção 1: Developer Console

1. Setup > Developer Console
2. File > New > Apex Class
3. Cole o conteúdo de cada arquivo `.cls`
4. Save (Ctrl+S)
5. Repita para todas as classes

### Opção 2: VS Code com Salesforce Extension

1. Instale a extensão **Salesforce Extension Pack**
2. Conecte à sua org: `Ctrl+Shift+P` > "SFDX: Authorize an Org"
3. Crie uma pasta `force-app/main/default/classes/`
4. Copie os arquivos `.cls` para essa pasta
5. Crie os arquivos `.cls-meta.xml` correspondentes
6. Deploy: `Ctrl+Shift+P` > "SFDX: Deploy Source to Org"

### Meta XML para cada classe

Crie um arquivo `.cls-meta.xml` para cada classe:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

## Configuração do RagnarokApiService

Antes de deployar, edite `RagnarokApiService.cls`:

```apex
// Linha 13-14 - Atualize com seus valores:
private static final String API_BASE_URL = 'https://seu-bot-url.com/api/agentforce';
private static final String API_KEY = 'sua-api-key-secreta';
```

## Configuração no Bot

Adicione ao seu `.env`:

```env
AGENTFORCE_API_KEY=sua-api-key-secreta
```

## Adicionar Actions ao Agentforce

Após o deploy, as classes estarão disponíveis como Actions:

1. Abra seu Agente no Agentforce Builder
2. Vá para **Topics** > Seu topic
3. Clique em **Add Action**
4. Selecione **Apex Invocable Method**
5. Escolha cada classe:
   - `AgentforceSearchItem` - Search Item
   - `AgentforceSearchMonster` - Search Monster
   - `AgentforceSearchMap` - Search Map
   - `AgentforceSearchMarket` - Search Market
   - `AgentforceSearchWiki` - Search Wiki
   - `AgentforceCheckPrice` - Check Price

## Testar

### No Salesforce

1. Developer Console > Debug > Open Execute Anonymous Window
2. Cole:

```apex
Map<String, Object> result = RagnarokApiService.searchItem('Adaga', 'pt');
System.debug(JSON.serializePretty(result));
```

3. Execute e verifique os logs

### No Bot

Acesse: `https://seu-bot-url.com/api/agentforce/health`

Deve retornar:
```json
{
  "success": true,
  "service": "RagWikiBot Agentforce API",
  "version": "1.0.0",
  "endpoints": [...]
}
```

## Troubleshooting

### "Unauthorized endpoint"
- Verifique se o Remote Site Setting está ativo
- Confirme a URL correta

### "Connection timeout"
- O bot está rodando e acessível publicamente?
- Teste a URL no navegador primeiro

### "Invalid API key"
- Verifique se `AGENTFORCE_API_KEY` está no `.env` do bot
- Confirme que o valor no `RagnarokApiService.cls` está correto

### Action não aparece no Agentforce
- Verifique se a classe foi deployada sem erros
- A classe precisa ter `@InvocableMethod` annotation
