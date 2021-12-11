const request = require("request");
const settings = require('../const.json');
const parser = require('../../utils/parser');
const bent = require('bent');
const getJSON = bent('json');
require('dotenv/config');


function makeItemIdRequest(itemId, server) {
    return new Promise(async (resolve, reject) => {
        var itemEndpoint = settings.endpoints[2].url;

        //Set item request endpoint
        itemEndpoint += String(itemId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY + '&server=' + server;

        //let options = {method: 'GET', url: itemEndpoint};

        try{
            let obj = await getJSON(itemEndpoint);
            resolve(obj);
        }
        catch(err) {
            console.log(err);
            reject("Erro ao obter id do item");
        }
    });
    
}

function makeSearchQuery(quereableString, server) {
    return new Promise(async (resolve, reject) => {
        //Set query URL and the cookie to get according language response
        let cookie;
        const j = request.jar();
        let serverMap = {
            "undefined" : () => cookie = request.cookie('lang=pt'),
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
            return reject('ERROR');
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
            let parsedBody = parser.parseHTMLByRegex(body);
            return parsedBody? resolve(parsedBody) : reject('ERROR');
        });
    });
}
    


module.exports = {
    makeItemIdRequest,
    makeSearchQuery
}