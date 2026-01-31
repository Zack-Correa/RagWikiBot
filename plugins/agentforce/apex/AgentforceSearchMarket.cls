/**
 * AgentforceSearchMarket
 * Invocable action for searching items in Ragnarok Online market
 */
public class AgentforceSearchMarket {
    
    public class SearchInput {
        @InvocableVariable(required=true label='Item Name' description='The item name to search in the market')
        public String query;
        
        @InvocableVariable(label='Server' description='Server name: FREYA, THOR, or VALHALLA (default: FREYA)')
        public String server;
        
        @InvocableVariable(label='Store Type' description='SELL or BUY (default: SELL)')
        public String storeType;
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
        label='Search Market'
        description='Search for items in Ragnarok Online LATAM market (prices, vendors)'
        category='Ragnarok Online'
    )
    public static List<SearchOutput> execute(List<SearchInput> inputs) {
        List<SearchOutput> outputs = new List<SearchOutput>();
        
        for (SearchInput input : inputs) {
            SearchOutput output = new SearchOutput();
            
            try {
                Map<String, Object> result = RagnarokApiService.searchMarket(
                    input.query, 
                    input.server,
                    input.storeType
                );
                
                output.success = (Boolean) result.get('success');
                
                if (output.success) {
                    Map<String, Object> data = (Map<String, Object>) result.get('data');
                    List<Object> listings = (List<Object>) data.get('listings');
                    String server = (String) data.get('server');
                    String storeType = (String) data.get('storeType');
                    
                    if (listings != null && !listings.isEmpty()) {
                        output.response = formatMarketResponse(listings, server, storeType);
                    } else {
                        output.response = 'Nenhum item encontrado no mercado para: ' + input.query;
                    }
                } else {
                    output.errorMessage = (String) result.get('error');
                    output.response = 'Erro ao buscar no mercado: ' + output.errorMessage;
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
    
    private static String formatMarketResponse(List<Object> listings, String server, String storeType) {
        String typeLabel = storeType == 'BUY' ? 'Comprando' : 'Vendendo';
        String header = '**Mercado ' + server + ' - ' + typeLabel + '**\n';
        header += listings.size() + ' listagem(ns) encontrada(s)\n\n';
        
        List<String> items = new List<String>();
        Integer count = 0;
        
        for (Object listingObj : listings) {
            if (count >= 5) break;
            
            Map<String, Object> listing = (Map<String, Object>) listingObj;
            String itemName = (String) listing.get('itemName');
            Object priceObj = listing.get('price');
            Object amountObj = listing.get('amount');
            String vendor = (String) listing.get('shopName');
            
            String itemInfo = (count + 1) + '. **' + itemName + '**';
            itemInfo += '\n   Preço: ' + formatNumber(priceObj) + 'z';
            itemInfo += ' | Qtd: ' + String.valueOf(amountObj);
            if (String.isNotBlank(vendor)) {
                itemInfo += '\n   Vendedor: ' + vendor;
            }
            
            items.add(itemInfo);
            count++;
        }
        
        if (listings.size() > 5) {
            items.add('... e mais ' + (listings.size() - 5) + ' listagens.');
        }
        
        return header + String.join(items, '\n\n');
    }
    
    private static String formatNumber(Object num) {
        if (num == null) return 'N/A';
        Decimal d = (Decimal) num;
        return d.format();
    }
}
