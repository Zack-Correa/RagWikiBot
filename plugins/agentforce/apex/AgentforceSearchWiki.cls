/**
 * AgentforceSearchWiki
 * Invocable action for searching in Browiki
 */
public class AgentforceSearchWiki {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Search Term' description='The term to search in the wiki')
        public String query;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Success')
        public Boolean success;
        
        @InvocableVariable(label='Response')
        public String response;
        
        @InvocableVariable(label='Error Message')
        public String errorMessage;
    }
    
    @InvocableMethod(
        label='Search Wiki'
        description='Search in Browiki for Ragnarok Online guides and content'
        category='Ragnarok Online'
    )
    public static List<SearchOutput> execute(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            
            try {
                Map<String, Object> result = RagnarokApiService.searchWiki(input.query);
                
                output.success = (Boolean) result.get('success');
                
                if (output.success) {
                    Map<String, Object> data = (Map<String, Object>) result.get('data');
                    List<Object> articles = (List<Object>) data.get('articles');
                    
                    if (articles != null && !articles.isEmpty()) {
                        output.response = formatWikiResponse(articles);
                    } else {
                        output.response = 'Nenhum artigo encontrado na wiki para: ' + input.query;
                    }
                } else {
                    output.errorMessage = (String) result.get('error');
                    output.response = 'Erro ao buscar na wiki: ' + output.errorMessage;
                }
            } catch (Exception e) {
                output.success = false;
                output.errorMessage = e.getMessage();
                output.response = 'Erro ao conectar com a API: ' + e.getMessage();
            }
            
            outputs.add(output);
        }
        
        return outputs;
    }
    
    private static String formatWikiResponse(List<Object> articles) {
        String header = '**Resultados da Browiki**\n\n';
        
        List<String> items = new List<String>();
        Integer count = 0;
        
        for (Object articleObj : articles) {
            if (count >= 5) break;
            
            Map<String, Object> article = (Map<String, Object>) articleObj;
            String title = (String) article.get('title');
            String snippet = (String) article.get('snippet');
            String url = (String) article.get('url');
            
            String articleInfo = '**' + title + '**';
            if (String.isNotBlank(snippet)) {
                String cleanSnippet = snippet.length() > 150 ? snippet.substring(0, 150) + '...' : snippet;
                articleInfo += '\n' + cleanSnippet;
            }
            if (String.isNotBlank(url)) {
                articleInfo += '\n[Ver artigo](' + url + ')';
            }
            
            items.add(articleInfo);
            count++;
        }
        
        if (articles.size() > 5) {
            items.add('... e mais ' + (articles.size() - 5) + ' artigos.');
        }
        
        return header + String.join(items, '\n\n');
    }
}
