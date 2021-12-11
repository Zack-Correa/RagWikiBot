const request = require("request");
const settings = require('../const.json');




function makeRequest(keyword, wikiType) {
    return new Promise((resolve, reject) => {
        let n = 0;
        if(wikiType === 'pedia') n = 0;
        else if(wikiType === 'wiki') n = 1;
        else {console.log('Wrong wikitype received! Going with browiki!'); n = 1}

        let endpoint = settings.endpoints[n].url;
        let actionParam = settings.endpoints[n].params.action;
        
        //Set the request parameters
        let options = {method: 'GET', url: endpoint, qs: {action: actionParam, search: keyword}};
        
        //Make the request to the server
        try{
            request(options, (error, response, body) => {
                if(error) {
                    console.log(error);
                    reject(error);
                }  
                return resolve(Array(body));
            });
        }
        catch(err){
            reject(err);
        }
    });
}

module.exports = {
    makeRequest
}