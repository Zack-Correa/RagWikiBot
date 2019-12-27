const request = require("request");
const settings = require('../const.json');
require('dotenv/config');


//var serverEndpoint = settings.endpoints[3].url;


function makeItemIdRequest(itemId, server, callback) {

    var itemEndpoint = settings.endpoints[2].url;
    var receivedServer = server;
    var receivedItemId = itemId;

    itemEndpoint += String(receivedItemId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY + '&server=' + receivedServer;
    let options = {method: 'GET', url: itemEndpoint};
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
        }    
        return callback(body, itemId);   
    });
}

/*function makeSearchQuery(quereableString, server, callback) {
    let regexp = /<td>\n\s*<img(<a href)*((.|\n)*?(<\/td>))/g;
    let queryEndpoint = "https://www.divine-pride.net/database/search?q=white"
    let options = {method: 'GET', url: queryEndpoint};
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
        }
        console.log(body)
        console.log(String(body).match(regexp));
        //return callback(body);   
    });
}*/
    


module.exports = {
    makeItemIdRequest
    //makeSearchQuery
}