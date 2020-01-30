const Discord = require('discord.js');
const wiki = require('./integrations/wikis/wikiRequests.js');
const divinePride = require('./integrations/database/divine-pride.js');
const settings = require('./integrations/const.json');
require('dotenv/config');


const authToken = process.env.DISCORD_TOKEN;

const client = new Discord.Client();

//Assure that the client is online
client.on('ready', () => {
    //console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
    msg.contentArray = msg.content.split(" ")
    //console.log(msg.content)
    if (msg.content.toLowerCase().match(/%buscaritemid\s(.+)/)) {
        var splitedMessage = msg.content.split(' ');        
        divinePride.makeItemIdRequest(splitedMessage[1], splitedMessage[2], (body, itemId) => msg.reply(parseDatabaseResponse(body, itemId)));
        return;
    }
    else if (msg.content.toLowerCase().match(/%pedia\s(.+)/)) {
        var splitedMessage = msg.content.split(' ');
        wiki.makeRequest(splitedMessage[1], 'pedia', response => embedMessage(msg, parseWikiResponse(response), 'Bropedia'));
        return;
    } 
    
    else if(msg.content.toLowerCase().match(/%wiki\s(.+)/)) {
        var splitedMessage = msg.content.split(' ');        
        wiki.makeRequest(splitedMessage[1], 'wiki', response => embedMessage(msg, parseWikiResponse(response), 'Browiki'));
        return;        
    }
    else if (msg.content.toLowerCase().match(/%buscaritem\s(.+)/)) {
        var splitedMessage = msg.content.split(' '); 
        divinePride.makeSearchQuery(splitedMessage[1],'iro', (body) => parseDatabaseBodyResponse(splitedMessage[1], body, (parsedBody) => embedMessage(msg, parsedBody, 'DivinePride' )));
        return;
    }
});

client.login(authToken);



function parseWikiResponse(response){
    var parsedResponse = [];
    console.log(response);
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
    //Remove illegal "^000000" words and format to JSON
    let formatedResponse = response;
    formatedResponse = JSON.parse(response.replace(/(\^[0-9|a-z]{6,7})/g, ''));

    //Return formated response with weblink reference to it
    return `\nNome: ${formatedResponse.name}\nDescrição: ${formatedResponse.description}\nhttps://www.divine-pride.net/database/item/${itemId}`;    
}

function embedMessage(messageContext, messageBody, wikiType) {
    var thumbnail;
    //console.log('settings: ' + settings)
    if(wikiType == 'Browiki') thumbnail = settings.assets[0].url;
    else if (wikiType == 'Bropedia') thumbnail = settings.assets[1].url;
    else thumbnail = settings.assets[2].url;

    var searchedWord = messageBody.shift();

    var embededMessage = new Discord.RichEmbed()
    .setColor('#0099ff')
	.setTitle('Resultado da pesquisa')
	.setThumbnail(thumbnail)
	.addField(`Resultados para "${searchedWord}"`, messageBody)
	.setTimestamp()
    .setFooter('Desenvolvido por Zack#7458');

    console.log(embededMessage)
    messageContext.reply(embededMessage);
}

function parseDatabaseBodyResponse(searchedWord, response, callback) {
    if(response == 'ERROR') {
        return callback([searchedWord, "Não foram encontrados resultados!"]);
    }
    var parsedResponse = [];
    response.shift();
    parsedResponse.push(searchedWord);
    
    response.every(body => {
        body.toString().replace('</td>,', '').replace('\\r\\n', '').replace(/\s/g, '');

        var itemName = body.split('=')[2].split(/\r\n/)[0]
        .replace(/"/g, '').replace('\/>', '')
            .replace(/(&#[0-9]+;)/g, function(text) {
                return String.fromCharCode(text.match(/[0-9]+/))
            });

        var itemURL =  "\n https://www.divine-pride.net/database/item/" + body.split('=')[1].match(/[0-9]+/) + "\n";

        parsedResponse.push(itemName+itemURL);
        
        if (parsedResponse.length > 5) return false;
        else return true;
    });
    parsedResponse.push(`\nPesquisa completa:\nhttps://www.divine-pride.net/database/search?q=${searchedWord} `);
    
    return callback(parsedResponse);

}


/*TO DO: 
*   QUERY BY NAME *CHECKED*
*   MVP TIMER
*   MONSTER QUERY BY NAME/ID
*   MOVE-BOT function, including music
*   ORGANIZATION IMPROVMENTS

*
*
*
*
*
*
*/