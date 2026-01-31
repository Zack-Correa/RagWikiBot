/**
 * RagnarokApiService
 * Service class for making HTTP callouts to RagWikiBot API
 * 
 * SETUP REQUIRED:
 * 1. Add Remote Site Setting for your bot URL
 * 2. Create Named Credential 'RagWikiBot' with the API endpoint
 * 3. Add AGENTFORCE_API_KEY to your .env file on the bot
 */
public class RagnarokApiService {
    
    // Configuration - Update these values
    private static final String API_BASE_URL = 'https://your-bot-url.com/api/agentforce';
    private static final String API_KEY = 'your-api-key-here'; // Or use Named Credential
    
    /**
     * Makes HTTP POST request to the bot API
     */
    private static HttpResponse makeRequest(String endpoint, Map<String, Object> body) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(API_BASE_URL + endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-API-Key', API_KEY);
        req.setTimeout(30000); // 30 seconds
        req.setBody(JSON.serialize(body));
        
        Http http = new Http();
        return http.send(req);
    }
    
    /**
     * Search for items
     */
    public static Map<String, Object> searchItem(String query, String language) {
        Map<String, Object> body = new Map<String, Object>{
            'query' => query,
            'language' => String.isBlank(language) ? 'pt' : language
        };
        
        HttpResponse res = makeRequest('/search/item', body);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
    
    /**
     * Search for monsters
     */
    public static Map<String, Object> searchMonster(String query, String language) {
        Map<String, Object> body = new Map<String, Object>{
            'query' => query,
            'language' => String.isBlank(language) ? 'pt' : language
        };
        
        HttpResponse res = makeRequest('/search/monster', body);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
    
    /**
     * Search for maps
     */
    public static Map<String, Object> searchMap(String query, String language) {
        Map<String, Object> body = new Map<String, Object>{
            'query' => query,
            'language' => String.isBlank(language) ? 'pt' : language
        };
        
        HttpResponse res = makeRequest('/search/map', body);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
    
    /**
     * Search market
     */
    public static Map<String, Object> searchMarket(String query, String server, String storeType) {
        Map<String, Object> body = new Map<String, Object>{
            'query' => query,
            'server' => String.isBlank(server) ? 'FREYA' : server,
            'type' => String.isBlank(storeType) ? 'SELL' : storeType
        };
        
        HttpResponse res = makeRequest('/search/market', body);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
    
    /**
     * Search wiki
     */
    public static Map<String, Object> searchWiki(String query) {
        Map<String, Object> body = new Map<String, Object>{
            'query' => query
        };
        
        HttpResponse res = makeRequest('/search/wiki', body);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
    
    /**
     * Check price
     */
    public static Map<String, Object> checkPrice(String item, Decimal price, String server) {
        Map<String, Object> body = new Map<String, Object>{
            'item' => item,
            'price' => price,
            'server' => String.isBlank(server) ? 'FREYA' : server
        };
        
        HttpResponse res = makeRequest('/check/price', body);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
}
