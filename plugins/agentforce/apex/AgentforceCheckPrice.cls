/**
 * AgentforceCheckPrice
 * Invocable action for checking if a price is fair
 */
public class AgentforceCheckPrice {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Item Name' description='The item name to check price for')
        public String item;
        
        @InvocableVariable(label='Price' description='The price in zeny to analyze')
        public Decimal price;
        
        @InvocableVariable(label='Server' description='Server name: FREYA, THOR, or VALHALLA (default: FREYA)')
        public String server;
    }
    
    public class SearchOutput {
        @InvocableVariable(label='Success')
        public Boolean success;
        
        @InvocableVariable(label='Response')
        public String response;
        
        @InvocableVariable(label='Analysis')
        public String analysis;
        
        @InvocableVariable(label='Error Message')
        public String errorMessage;
    }
    
    @InvocableMethod(
        label='Check Price'
        description='Analyze if a price is fair, cheap, or expensive for an item'
        category='Ragnarok Online'
    )
    public static List<SearchOutput> execute(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            
            try {
                Map<String, Object> result = RagnarokApiService.checkPrice(
                    input.item, 
                    input.price,
                    input.server
                );
                
                output.success = (Boolean) result.get('success');
                
                if (output.success) {
                    Map<String, Object> data = (Map<String, Object>) result.get('data');
                    Boolean found = (Boolean) data.get('found');
                    
                    if (found != null && found) {
                        output.response = formatPriceResponse(data, input.price);
                        output.analysis = (String) data.get('analysis');
                    } else {
                        output.response = 'Item não encontrado no mercado: ' + input.item;
                    }
                } else {
                    output.errorMessage = (String) result.get('error');
                    output.response = 'Erro ao verificar preço: ' + output.errorMessage;
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
    
    private static String formatPriceResponse(Map<String, Object> data, Decimal inputPrice) {
        String item = (String) data.get('item');
        String server = (String) data.get('server');
        String analysisText = (String) data.get('analysisText');
        Object percentObj = data.get('percentFromMedian');
        
        Map<String, Object> stats = (Map<String, Object>) data.get('stats');
        
        String header = '**Análise de Preço: ' + item + '**\n';
        header += 'Servidor: ' + server + '\n\n';
        
        List<String> lines = new List<String>();
        
        if (inputPrice != null) {
            lines.add('Preço informado: ' + formatNumber(inputPrice) + 'z');
            lines.add('Análise: **' + analysisText + '**');
            
            if (percentObj != null) {
                Decimal percent = (Decimal) percentObj;
                String sign = percent >= 0 ? '+' : '';
                lines.add('Diferença da mediana: ' + sign + percent.setScale(1) + '%');
            }
            lines.add('');
        }
        
        if (stats != null) {
            lines.add('**Estatísticas do Mercado:**');
            lines.add('Preço Mínimo: ' + formatNumber(stats.get('min')) + 'z');
            lines.add('Preço Mediano: ' + formatNumber(stats.get('median')) + 'z');
            lines.add('Preço Máximo: ' + formatNumber(stats.get('max')) + 'z');
            lines.add('Preço Médio: ' + formatNumber(stats.get('avg')) + 'z');
            lines.add('Listagens: ' + String.valueOf(stats.get('count')));
        }
        
        return header + String.join(lines, '\n');
    }
    
    private static String formatNumber(Object num) {
        if (num == null) return 'N/A';
        Decimal d = (Decimal) num;
        return d.format();
    }
}
