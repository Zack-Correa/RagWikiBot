const request = require("request");
const settings = require('../const.json');
require('dotenv/config');


function makeItemIdRequest(itemId, server, callback) {

    var itemEndpoint = settings.endpoints[2].url;

    //Set item request endpoint
    itemEndpoint += String(itemId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY + '&server=' + server;

    let options = {method: 'GET', url: itemEndpoint};
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
        }    
        return callback(body, itemId);   
    });
}

function makeSearchQuery(quereableString, server, callback) {
    //Set query URL and the cookie to get PT-BR language response
    const j = request.jar();
    let cookie = request.cookie('lang=pt');
    let queryEndpoint = settings.endpoints[3].url + encodeURIComponent(quereableString)
    j.setCookie(cookie, queryEndpoint);
    
    let options = {method: 'GET', url: queryEndpoint, jar: j, queryEndpoint};
    request(options, (error, response, body) => {
        //Error handling
        if(error) {
            console.log(error);
        }
        
        //Parses the HTML
        let regexp = /<td>[\n\r]\s*<img(<a href)*((.|[\n\r])*?(<\/td>))/g;
        if(body.match(regexp) != undefined) {
            return callback(body.match(regexp).toString().split("<td>"));
        }
        return callback('ERROR');
    });
}
    


module.exports = {
    makeItemIdRequest,
    makeSearchQuery
}