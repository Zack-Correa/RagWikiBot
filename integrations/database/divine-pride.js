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

function monsterSearch(monsterId) {
    return new Promise(async (resolve, reject) => {
        let mapEndpoint = settings.endpoints[5].url;
        mapEndpoint += String(monsterId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY;

        let options = {method: 'GET', url: mapEndpoint, mapEndpoint};
        
        request(options, (error, response, body) => {
            //Error handling
            if(error) {
                console.log(error);
            }
        
            //Parses the HTML
            console.log(body);
            return;
            //return parsedBody? resolve(parsedBody) : reject('ERROR');
        });
    });
}

function mapSearch(mapId) {
    return new Promise(async (resolve, reject) => {
        let mapEndpoint = settings.endpoints[6].url;
        mapEndpoint += String(mapId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY;

        let options = {method: 'GET', url: mapEndpoint, mapEndpoint};
        
        request(options, (error, response, body) => {
            //Error handling
            if(error) {
                console.log(error);
            }
        
            //Parses the HTML
            console.log(body);
            return;
            //return parsedBody? resolve(parsedBody) : reject('ERROR');
        });
    });
}

function skillSearch(skillId) {
    return new Promise(async (resolve, reject) => {
        let mapEndpoint = settings.endpoints[6].url;
        mapEndpoint += String(skillId) + '?apiKey=' + process.env.DIVINE_PRIDE_API_KEY;

        let options = {method: 'GET', url: mapEndpoint, mapEndpoint};
        
        request(options, (error, response, body) => {
            //Error handling
            if(error) {
                console.log(error);
            }
        
            //Parses the HTML
            console.log(body);
            return;
            //return parsedBody? resolve(parsedBody) : reject('ERROR');
        });
    });
}
    


module.exports = {
    makeItemIdRequest,
    makeSearchQuery,
    monsterSearch,
    mapSearch,
    skillSearch

}