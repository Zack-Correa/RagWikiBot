const Discord = require('discord.js');
const divinePride = require('../integrations/database/divine-pride.js');
const wiki = require('../integrations/wikis/wikiRequests.js');
const settings = require('../integrations/const.json');

var messageHandler = function() {

    function embedMessage(messageContext, messageBody, wikiType) {
        //Sets the embeded message thumbnail
        var thumbnail;
        if(wikiType == 'Browiki') thumbnail = settings.assets[0].url;
        else if (wikiType == 'Bropedia') thumbnail = settings.assets[1].url;
        else thumbnail = settings.assets[2].url;
    
        //Get the searched string
        var searchedWord = messageBody.shift();
    
        //Creates and fill the RichEmbed layout
        var embededMessage = new Discord.RichEmbed()
        .setColor('#0099ff')
        .setTitle('Resultado da pesquisa')
        .setThumbnail(thumbnail)
        .addField(`Resultados para "${searchedWord}"`, messageBody)
        .setTimestamp()
        .setFooter('Desenvolvido por Zack#7458');
    
        //console.log(embededMessage);
        messageContext.reply(embededMessage);
    }

    function parseWikiResponse(response, callback){
        var parsedResponse = [];
        //console.log(response);
        response = JSON.parse(response)
  
    
        //Verifies result inexistence. If true, return warning message
        if(response[2][0] == undefined)
            return [response[0], 'Não foram encontrados resultados!'];
    
    
        //Remove response garbage and add the searched word in the parsed response
        response.splice(2, 1)
        parsedResponse.push(response[0]);
    
        //Remove the searched word
        response.splice(0,1);
    
        //Mount the parsed response with the 3 first results in the query
        var counter = 0;
        response[0].some(element => {
            parsedResponse.push(`${element}\n  ${response[1][counter]}\n`)
            counter++;
    
            //Make sure that the parsed response isn't bigger than 3 elements
            /*if(counter > 2) return true;
            else return false;  */  
        })
    
        return parsedResponse
    }

    function parseDatabaseResponse(response, itemId, callback) {
        //Remove illegal "^000000" words and format to JSON
        let formatedResponse = JSON.stringify(response);
        formatedResponse = JSON.parse(formatedResponse.replace(/(\^[0-9|a-z]{6,7})/g, ''));
    
        //Return formated response with weblink reference to it
        console.log('Response has been parsed');
        callback(`\nNome: ${formatedResponse.name}\nDescrição: ${formatedResponse.description}\nhttps://www.divine-pride.net/database/item/${itemId}`);    
    }

    function parseDatabaseBodyResponse(searchedWord, response, callback) {

        //Error handling
        if(response == 'ERROR') {
            return callback([searchedWord, "Não foram encontrados resultados!"]);
        }
    
        var parsedResponse = [];
        parsedResponse.push(searchedWord);
    
        //Removes garbage from html parsing and format unicode charcode to character
        response.shift();   
        response.every(body => {
            body.toString().replace('</td>,', '').replace('\\r\\n', '').replace(/\s/g, '');
    
            var itemName = body.split('=')[2].split(/\r\n/)[0]
            .replace(/"/g, '').replace('\/>', '')
                .replace(/(&#[0-9]+;)/g, function(text) {
                    return String.fromCharCode(text.match(/[0-9]+/))
                });
    
            var itemURL =  "\n https://www.divine-pride.net/database/item/" + body.split('=')[1].match(/[0-9]+/) + "\n";
    
            //Adds search result to final response
            parsedResponse.push(itemName+itemURL);
            
            //Guarantees that the response isn't greater than 5 results
            if (parsedResponse.length > 5) return false;
            else return true;
        });
        //Adds full search URL to the response
        parsedResponse.push(`\n Pesquisa completa:\n${encodeURI(`https://www.divine-pride.net/database/search?q=${searchedWord}`)} `);
        
        return callback(parsedResponse);
    
    }

    this.searchItemID = function(splitedMessage, callback) {
        //Make request to divine-pride API
        divinePride.makeItemIdRequest(splitedMessage[1], splitedMessage[2], (response) => parseDatabaseResponse(response, splitedMessage[1], callback))
    }

    this.searchItem = function (splitedMessage, msg) {
        divinePride.makeSearchQuery(splitedMessage[1], splitedMessage[2], (body) => parseDatabaseBodyResponse(splitedMessage[1], body, (parsedBody) => embedMessage(msg, parsedBody, 'DivinePride')));
    }

    this.searchWiki = function(searthTerm, wikiType, msg) {
        //Bropedia is currently offline
        wiki.makeRequest(searthTerm, 'wiki', response => embedMessage(msg, parseWikiResponse(response), 'Browiki'));
    }

    this.getAction = function(message, callback){
        try{
            //console.log(message)
            this.message = message.content.toLowerCase();
            this.splitedMessage = this.message.split(' ');
            this.searchedWord = this.message.match(/^(%[a-z]+)\s(.+)/) != undefined ? this.message.match(/^(%[a-z]+)\s(.+)/)[1] : this.message;
            console.log(this.message)
            console.log(this.searchedWord)
            this.actionMap = {
                '%buscaritemid': (callback) => this.searchItemID(this.splitedMessage, callback),
                '%pedia': (callback) => this.searchWiki(this.splitedMessage[1], 'wiki', message),
                '%wiki' : (callback) => this.searchWiki(this.splitedMessage[1], 'wiki', message),
                '%buscaritem': (callback) => this.searchItem(this.splitedMessage, message),
                '%ajuda' : () => message.reply('acesse https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md para ler os comandos disponiveis!')
            }


            //Certifies that only the correct commands are tried to be executed
            let actionKeys = Object.keys(this.actionMap);
            actionKeys.map((key) => {
                if(key == this.searchedWord) {
                    this.actionMap[this.searchedWord](callback);
                }
            })
            
        }
        catch(exception) {
            if (exception instanceof TypeError) {
                console.log('Unexpected exception: ' + exception);
                return;
            }
            console.log('Exception in the actionMap: ' + exception);
            return callback("Erro ao consultar!");
        }
    }
}

module.exports = messageHandler;