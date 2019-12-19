const Discord = require('discord.js');
const wiki = require('./integrations/wikis/wikiRequests.js');
const divinePride = require('./integrations/database/divine-pride.js');
const settings = require('./integrations/const.json');
require('dotenv/config');


const authToken = process.env.DISCORD_TOKEN;

const client = new Discord.Client();

//Assure that the client is online
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
    console.log(msg.content[0])
    if (msg.content.test(/%database\s(.+)/)) {
        var splitedMessage = msg.content.split(' ');        
        divinePride.makeItemIdRequest(splitedMessage[1], splitedMessage[2], (body, itemId) => msg.reply(parseDatabaseResponse(body, itemId)));
        return;
    }
    else if (msg.content[0] == '%pedia') {
        var splitedMessage = msg.content.split(' ');
        wiki.makeRequest(splitedMessage[1], 'pedia', response => embedMessage(msg, parseWikiResponse(response), 'Bropedia'));
        return;
    }

    else if(msg.content[0] == '%wiki') {
        var splitedMessage = msg.content.split(' ');        
        wiki.makeRequest(splitedMessage[1], 'wiki', response => embedMessage(msg, parseWikiResponse(response), 'Browiki'));
        return;        
    }
});

client.login(authToken);



function parseWikiResponse(response){
    var parsedResponse = [];
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

    console.log(parsedResponse)
    return parsedResponse;
}

function parseDatabaseResponse(response, itemId) {
    //Remove illegal words "^000000" and format to JSON
    let formatedResponse = response;
    formatedResponse = JSON.parse(response.replace(/(\^[0-9|a-z]{6,7})/g, ''));

    //Return formated response with weblink reference to it
    return `\nNome: ${formatedResponse.name}\nDescrição: ${formatedResponse.description}\nhttps://www.divine-pride.net/database/item/${itemId}`;    
}

function embedMessage(messageContext, messageBody, wikiType) {
    var thumbnail;
    if(wikiType == 'Browiki') thumbnail = setting.assets[0].url;
    else thumbnail = settings.assets[1].url;

    var searchedWord = messageBody.shift();

    var embededMessage = new Discord.RichEmbed()
    .setColor('#0099ff')
	.setTitle('Resultado da pesquisa')
	.setThumbnail(thumbnail)
	.addField(`Resultados para "${searchedWord}"`, messageBody)
	.setTimestamp()
    .setFooter('Desenvolvido por Zack#7458');

    messageContext.reply(embededMessage);
}
