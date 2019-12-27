const request = require("request");
const settings = require('../const.json');




function makeRequest(keyword, wikiType, callback) {
    let n = 0;
    if(wikiType === 'pedia') n = 0;
    else if(wikiType === 'wiki') n = 1;
    else {console.log('Wrong wikitype received! Going with browiki!'); n = 1}

    let endpoint = settings.endpoints[n].url;
    let actionParam = settings.endpoints[n].params.action;
    
    //Set the request parameters
    let options = {method: 'GET', url: endpoint, qs: {action: actionParam, search: keyword}};
    
    //Make the request to the server
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
        }  
        console.log(body)
        return callback(Array(body));
    });
}

module.exports = {
    makeRequest
}