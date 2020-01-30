const request = require("request");
const settings = require('../const.json');
const htmlparser = require("htmlparser");
require('dotenv/config');


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

function makeSearchQuery(quereableString, server, callback) {
    const j = request.jar();
    let queryEndpoint = "https://www.divine-pride.net/database/search?q=" + encodeURIComponent(quereableString)
    let cookie = request.cookie('lang=pt');
    j.setCookie(cookie, queryEndpoint);
    let options = {method: 'GET', url: queryEndpoint, jar: j, queryEndpoint};
    request(options, (error, response, body) => {
        let regexp = /<td>[\n\r]\s*<img(<a href)*((.|[\n\r])*?(<\/td>))/g;
        //let regexp = /<td>/g;
        if(error) {
            console.log(error);
        }

        //console.log(body.match(regexp).toString().split("<td>"));
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