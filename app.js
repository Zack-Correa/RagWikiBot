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

    //Searchs items by ID
    if (msg.content.toLowerCase().match(/^%buscaritemid\s(.+)/)) {
        var splitedMessage = msg.content.split(' ');        
        divinePride.makeItemIdRequest(splitedMessage[1], splitedMessage[2], (body, itemId) => msg.reply(parseDatabaseResponse(body, itemId)));
        return;
    }

    //Searchs Bropedia results for that keyword
    else if (msg.content.toLowerCase().match(/^%pedia\s(.+)/)) {
        var message = getSearchString(msg.content);;
        wiki.makeRequest(message, 'pedia', response => embedMessage(msg, parseWikiResponse(response), 'Bropedia'));
        return;
    } 

    //Searchs Browiki results for that keyword
    else if(msg.content.toLowerCase().match(/^%wiki\s(.+)/)) {
        var message = getSearchString(msg.content);      
        wiki.makeRequest(message, 'wiki', response => embedMessage(msg, parseWikiResponse(response), 'Browiki'));
        return;        
    }

    //Searchs items by name
    else if (msg.content.toLowerCase().match(/^%buscaritem\s(.+)/)) {
        var message = getSearchString(msg.content);
        divinePride.makeSearchQuery(message,'iro', (body) => parseDatabaseBodyResponse(message, body, (parsedBody) => embedMessage(msg, parsedBody, 'DivinePride' )));
        return;
    }
});

client.login(authToken);

function getSearchString(msg){
    //Removes command word from string
    var message = msg.split(' ');
    message.shift();
    return message.join(' ');
}

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

    console.log(embededMessage)
    messageContext.reply(embededMessage);
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


/*TO DO: 
*   QUERY BY NAME TO FULL DESCRIPTION
*   MVP TIMER
*   
*   MONSTER QUERY BY NAME/ID
*   MOVE-BOT function, including music
*   ORGANIZATION IMPROVMENTS
*
*
*
*
*
*
*
*/