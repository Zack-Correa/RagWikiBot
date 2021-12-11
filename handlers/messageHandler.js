const Discord = require('discord.js');
const divinePride = require('../integrations/database/divine-pride.js');
const wiki = require('../integrations/wikis/wikiRequests.js');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser.js');

var messageHandler = function() {

    function embedMessage(messageContext, messageBody, wikiType) {
        return new Promise(function(resolve) {
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
        
            resolve(embededMessage);
        });
    }



    this.searchItemID = function(splitedMessage) {
        //Make request to divine-pride API
        return divinePride.makeItemIdRequest(splitedMessage[1], splitedMessage[2])
        .then((response) => parser.parseDatabaseResponse(response, splitedMessage[1]))
        .then(message => {return message})
        .catch((error) => {return error});
    }

    this.searchItem = function (splitedMessage, msg) {
        return divinePride.makeSearchQuery(splitedMessage[1], splitedMessage[2])
        .then((body) => parser.parseDatabaseBodyResponse(splitedMessage[1], body))
        .then((parsedBody) => embedMessage(msg, parsedBody, 'DivinePride'))
        .catch((error) => {return error});
        
    }

    this.searchWiki = function(searthTerm, msg) {
        //Bropedia is currently offline
        return wiki.makeRequest(searthTerm, 'wiki')
        .then(response => embedMessage(msg, parser.parseWikiResponse(response), 'Browiki'))
        .then(message => {return message})
        .catch((error) => {return error});
    }

    this.getAction = function(message){
        return new Promise((resolve, reject) => {
            try{
                this.message = message.content.toLowerCase();
                this.splitedMessage = this.message.split(' ');
                this.searchedWord = this.message.match(/^(%[a-z]+)\s(.+)/) != undefined ? this.message.match(/^(%[a-z]+)\s(.+)/)[1] : this.message;
                console.log(this.message)
                console.log(this.searchedWord)
                this.actionMap = {
                    '%buscaritemid': () => resolve(this.searchItemID(this.splitedMessage)),
                    '%wiki' : () => resolve(this.searchWiki(this.splitedMessage[1], 'wiki')),
                    '%buscaritem': () => resolve(this.searchItem(this.splitedMessage, message)),
                    '%ajuda' : () => resolve('acesse https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md para ler os comandos disponiveis!')
                }


                //Certifies that only the correct commands are tried to be executed
                let actionKeys = Object.keys(this.actionMap);
                actionKeys.map((key) => {
                    if(key == this.searchedWord) {
                        this.actionMap[this.searchedWord]();
                    }
                })
                
            }
            catch(exception) {
                if (exception instanceof TypeError) {
                    console.log('Unexpected exception: ' + exception);
                    return reject("Erro ao executar ação!");
                }
                console.log('Exception in the actionMap: ' + exception);
                return reject("Erro ao executar ação!");
            }
        });
    }
}

module.exports = messageHandler;