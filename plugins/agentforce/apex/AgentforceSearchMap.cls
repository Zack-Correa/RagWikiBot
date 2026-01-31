/**
 * AgentforceSearchMap
 * Invocable action for searching maps in Ragnarok Online
 */
public class AgentforceSearchMap {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Map Name or ID' description='The map name or ID to search for')
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
        label='Search Map'
        description='Search for maps in Ragnarok Online (locations, dungeons, cities)'
        category='Ragnarok Online'
    )
    public static List<SearchOutput> execute(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            
            try {
                Map<String, Object> result = RagnarokApiService.searchMap(
                    input.query, 
                    input.language
                );
                
                output.success = (Boolean) result.get('success');
                
                if (output.success) {
                    Map<String, Object> data = (Map<String, Object>) result.get('data');
                    List<Object> maps = (List<Object>) data.get('maps');
                    
                    if (maps != null && !maps.isEmpty()) {
                        output.response = formatMapResponse(maps);
                    } else {
                        output.response = 'Nenhum mapa encontrado para: ' + input.query;
                    }
                } else {
                    output.errorMessage = (String) result.get('error');
                    output.response = 'Erro ao buscar mapa: ' + output.errorMessage;
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
    
    private static String formatMapResponse(List<Object> maps) {
        List<String> responses = new List<String>();
        Integer count = 0;
        
        for (Object mapObj : maps) {
            if (count >= 3) break;
            
            Map<String, Object> mapData = (Map<String, Object>) mapObj;
            String name = (String) mapData.get('name');
            String mapId = (String) mapData.get('id');
            String mapname = (String) mapData.get('mapname');
            
            String mapInfo = '**' + (String.isNotBlank(name) ? name : mapId) + '**';
            if (String.isNotBlank(mapname) && mapname != name) {
                mapInfo += '\nID do Mapa: ' + mapname;
            }
            
            responses.add(mapInfo);
            count++;
        }
        
        if (maps.size() > 3) {
            responses.add('... e mais ' + (maps.size() - 3) + ' resultados.');
        }
        
        return String.join(responses, '\n\n');
    }
}
