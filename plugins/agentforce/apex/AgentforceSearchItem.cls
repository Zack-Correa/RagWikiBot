/**
 * AgentforceSearchItem
 * Invocable action for searching items in Ragnarok Online
 */
public class AgentforceSearchItem {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Item Name or ID' description='The item name or ID to search for')
        public String query;
        
        @InvocableVariable(label='Language' description='Language for results (default: pt)')
        public String language;
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
        label='Search Item'
        description='Search for items in Ragnarok Online database (equipment, cards, consumables)'
        category='Ragnarok Online'
    )
    public static List<SearchOutput> execute(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            
            try {
                Map<String, Object> result = RagnarokApiService.searchItem(
                    input.query, 
                    input.language
                );
                
                output.success = (Boolean) result.get('success');
                
                if (output.success) {
                    Map<String, Object> data = (Map<String, Object>) result.get('data');
                    List<Object> items = (List<Object>) data.get('items');
                    
                    if (items != null && !items.isEmpty()) {
                        output.response = formatItemResponse(items);
                    } else {
                        output.response = 'Nenhum item encontrado para: ' + input.query;
                    }
                } else {
                    output.errorMessage = (String) result.get('error');
                    output.response = 'Erro ao buscar item: ' + output.errorMessage;
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
    
    private static String formatItemResponse(List<Object> items) {
        List<String> responses = new List<String>();
        Integer count = 0;
        
        for (Object itemObj : items) {
            if (count >= 3) break; // Limit to 3 items
            
            Map<String, Object> item = (Map<String, Object>) itemObj;
            String name = (String) item.get('name');
            Object idObj = item.get('id');
            String description = (String) item.get('description');
            
            String itemInfo = '**' + name + '** (ID: ' + String.valueOf(idObj) + ')';
            if (String.isNotBlank(description)) {
                itemInfo += '\n' + description.substring(0, Math.min(200, description.length()));
            }
            
            responses.add(itemInfo);
            count++;
        }
        
        if (items.size() > 3) {
            responses.add('... e mais ' + (items.size() - 3) + ' resultados.');
        }
        
        return String.join(responses, '\n\n');
    }
}
