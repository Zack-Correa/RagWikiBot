const request = require("request");
const settings = require('../const.json');
require('dotenv/config');

var itemEndpoint = settings.endpoints[2].url;
//var serverEndpoint = settings.endpoints[3].url;


function makeItemIdRequest(itemId, server, callback) {
    itemEndpoint += String(itemId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY + '&server=' + server;
    let options = {method: 'GET', url: itemEndpoint};
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
        }    
        return callback(body, itemId);   
    });
}
    


module.exports = {
    makeItemIdRequest
}