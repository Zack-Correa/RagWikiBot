const divinePride = require('../integrations/database/divine-pride.js');


var messageHandler = function() {

    this.searchItem =  function(splitedMessage) {
       divinePride.makeItemIdRequest(splitedMessage[1], splitedMessage[2])
        .then((body, itemid) => parseDatabaseResponse(body, itemid))
        .then((parsedResponse) => {return parsedResponse});
}

    this.getAction = function(message, callback){
        try{
            this.message = message.toLowerCase();
            this.splitedMessage = message.split(' ');
            this.searchedWord = this.message.match(/^(%[a-z]+)\s(.+)/)[1];
            this.actionMap = {
                '%buscaritemid': async () => { return await this.searchItem(this.splitedMessage)},
                '%pedia':() => pudim = b,
                '%wiki' : () => a = a,
                '%buscaritem': () => a = a,
                '%ajuda' : () => a = a 
            }
            let response = this.actionMap[this.searchedWord]()
            console.log(response)
            return callback(response);
        }
        catch(exception) {
            console.log('Exception in the actionMap: ' + exception);
            return callback("Erro ao consultar!");
        }
    }

    function parseDatabaseResponse(response, itemId) {
        //Remove illegal "^000000" words and format to JSON
        let formatedResponse = response;
        formatedResponse = JSON.parse(response.replace(/(\^[0-9|a-z]{6,7})/g, ''));
    
        //Return formated response with weblink reference to it
        console.log('Response has been parsed');
        return `\nNome: ${formatedResponse.name}\nDescrição: ${formatedResponse.description}\nhttps://www.divine-pride.net/database/item/${itemId}`;    
    }




}

module.exports = messageHandler;