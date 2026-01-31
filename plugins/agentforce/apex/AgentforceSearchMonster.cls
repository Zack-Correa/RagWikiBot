/**
 * AgentforceSearchMonster
 * Invocable action for searching monsters in Ragnarok Online
 */
public class AgentforceSearchMonster {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Monster Name or ID' description='The monster name or ID to search for')
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
        label='Search Monster'
        description='Search for monsters in Ragnarok Online (stats, drops, locations)'
        category='Ragnarok Online'
    )
    public static List<SearchOutput> execute(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            
            try {
                Map<String, Object> result = RagnarokApiService.searchMonster(
                    input.query, 
                    input.language
                );
                
                output.success = (Boolean) result.get('success');
                
                if (output.success) {
                    Map<String, Object> data = (Map<String, Object>) result.get('data');
                    List<Object> monsters = (List<Object>) data.get('monsters');
                    
                    if (monsters != null && !monsters.isEmpty()) {
                        output.response = formatMonsterResponse(monsters);
                    } else {
                        output.response = 'Nenhum monstro encontrado para: ' + input.query;
                    }
                } else {
                    output.errorMessage = (String) result.get('error');
                    output.response = 'Erro ao buscar monstro: ' + output.errorMessage;
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
    
    private static String formatMonsterResponse(List<Object> monsters) {
        List<String> responses = new List<String>();
        Integer count = 0;
        
        for (Object monsterObj : monsters) {
            if (count >= 3) break;
            
            Map<String, Object> monster = (Map<String, Object>) monsterObj;
            String name = (String) monster.get('name');
            Object idObj = monster.get('id');
            Object levelObj = monster.get('level');
            Object hpObj = monster.get('hp');
            Object baseExpObj = monster.get('baseExp');
            Object jobExpObj = monster.get('jobExp');
            
            String monsterInfo = '**' + name + '** (ID: ' + String.valueOf(idObj) + ')';
            monsterInfo += '\nLevel: ' + String.valueOf(levelObj);
            monsterInfo += ' | HP: ' + formatNumber(hpObj);
            monsterInfo += '\nBase EXP: ' + formatNumber(baseExpObj);
            monsterInfo += ' | Job EXP: ' + formatNumber(jobExpObj);
            
            responses.add(monsterInfo);
            count++;
        }
        
        if (monsters.size() > 3) {
            responses.add('... e mais ' + (monsters.size() - 3) + ' resultados.');
        }
        
        return String.join(responses, '\n\n');
    }
    
    private static String formatNumber(Object num) {
        if (num == null) return 'N/A';
        Decimal d = (Decimal) num;
        return d.format();
    }
}
