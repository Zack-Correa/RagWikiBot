const Discord = require('discord.js');
const wiki = require('./integrations/wikis/wikiRequests.js');
const divinePride = require('./integrations/database/divine-pride.js');
require('dotenv/config');


const authToken = process.env.DISCORD_TOKEN;

const client = new Discord.Client();

//Assure that the client is online
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    //wiki.makeRequest('escon', 'wiki', a => parseWikiResponse(a));
    //divinePride.makeItemIdRequest('2027','bRO', parseDatabaseResponse)
});

client.on('message', msg => {
    if (msg.content === 'ping') {
        msg.reply('pong');
    }

    if (msg.content.startsWith('%database')) {
        var splitedMessage = msg.content.split(' ');        
        divinePride.makeItemIdRequest(splitedMessage[1],splitedMessage[2], (body, response) => msg.reply(parseDatabaseResponse(body, response)));
        return;
    }

    else if(msg.content.startsWith('%wiki')){
        var splitedMessage = msg.content.split(' ');        
        wiki.makeRequest(splitedMessage[1], splitedMessage[2], a => msg.reply(parseWikiResponse(a)));
        return;        
    }
});

client.login(authToken);



function parseWikiResponse(response){
    var parsedResponse = [];
    response = JSON.parse(response)

    //Remove response garbage and add the searched word in the parsed response
    response.splice(2, 1)
    parsedResponse.push(`\nTermo pesquisado: ${response[0]}`);

    //Remove the searched word
    response.splice(0,1);

    //Mount the parsed response with the 3 first results in the query
    var counter = 0;
    response[0].some(element => {
        parsedResponse.push(`Resultado ${counter+1}: ${element}  ${response[1][counter]}`)
        counter++;

        //Make sure that the parsed response is not bigger than 3 elements
        if(counter > 2) return true;
        else return false;    
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
