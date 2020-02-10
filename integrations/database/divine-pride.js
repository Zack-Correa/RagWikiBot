const request = require("request");
const settings = require('../const.json');
require('dotenv/config');


function makeItemIdRequest(itemId, server) {

    var itemEndpoint = settings.endpoints[2].url;

    //Set item request endpoint
    itemEndpoint += String(itemId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY + '&server=' + server;

    let options = {method: 'GET', url: itemEndpoint};
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
        }   
        
    });
    
    return new Promise((resolve, reject) => {
        resolve(body, itemId);
    }) 
    
}

function makeSearchQuery(quereableString, server, callback) {
    //Set query URL and the cookie to get according language response
    let cookie;
    const j = request.jar();
    let serverMap = {
        "iro": () => cookie = undefined,
        "kro": () => cookie = request.cookie('lang=kr'),
        "bro": () => cookie = request.cookie('lang=pt'),
        "jro": () => cookie = request.cookie('lang=jp')
    };
    
    //Get requested server from map
    try{
        serverMap[server]();
    }
    catch {
        //Returns error msg if server isn't in the server list
        return callback('ERROR');
    }

    
    let queryEndpoint = settings.endpoints[3].url + encodeURIComponent(quereableString)
    if(cookie) {
        j.setCookie(cookie, queryEndpoint);
    }
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