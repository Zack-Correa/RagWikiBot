const request = require("request");
const settings = require('./integrations/const.json');

var endpoint = settings.endpoints[0].url;
var actionParam = settings.endpoints[0].params.action;


function makeRequest(keyword) {
    var options = {method: 'GET', url: endpoint, qs: {action: actionParam, search: keyword}};
    
    request(options, (error, response, body) => {
        if(error) {
            console.log(error);
            return null;
        }
        return body;
    })
}