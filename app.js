const Discord = require('discord.js');
const wiki = require('./integrations/wikis/wikiRequests.js');
const divinePride = require('./integrations/database/divine-pride.js');
const settings = require('./integrations/const.json');
const messageHandler = require('./handlers/messageHandler.js');
require('dotenv/config');


const authToken = process.env.DISCORD_TOKEN;

const client = new Discord.Client();

//Assure that the client is online
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus('available')
    client.user.setPresence({
        game: {
            name: 'Digite %ajuda para obter os comandos do bot',
            type: "STREAMING",
            url: "https://github.com/Zack-Correa/RagWikiBot/tree/dev"
        }
    });
});

client.on('message', msg => {
    if (msg.author.bot) return;
    new messageHandler().getAction(msg, (response) =>  msg.reply(response));
});

client.login(authToken);



/*TO DO: 
*   QUERY BY NAME TO FULL DESCRIPTION
*   MVP TIMER
*   MONSTER QUERY BY NAME/ID
*   MOVE-BOT function, including music
*   ORGANIZATION IMPROVMENTS DONE
*   CODE OPTIMIZATION WITH HANDLERS DONE
*/