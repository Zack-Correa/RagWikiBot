function parseHTMLByRegex(html) {
    let regexp = /<td>[\n\r]\s*<img(<a href)*((.|[\n\r])*?(<\/td>))/g;
    let parsedHTML = html.match(regexp);
    if(parsedHTML) {
        return parsedHTML.toString().split("<td>");
    }
    else{
        return null;
    }
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

function parseDatabaseResponse(response, itemId) {
    return new Promise((resolve) => {
        //Remove illegal "^000000" words and format to JSON
        let formatedResponse = JSON.stringify(response);
        formatedResponse = JSON.parse(formatedResponse.replace(/(\^[0-9|a-z]{6,7})/g, ''));
    
        //Return formated response with weblink reference to it
        console.log('Response has been parsed');
        resolve(`\nNome: ${formatedResponse.name}\nDescrição: ${formatedResponse.description}\nhttps://www.divine-pride.net/database/item/${itemId}`);    
    });
}

function parseDatabaseBodyResponse(searchedWord, response) {
    return new Promise((resolve, reject) => {
        //Error handling
        if(response == 'ERROR') {
            return reject([searchedWord, "Não foram encontrados resultados!"]);
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
        
        return resolve(parsedResponse);
    });
}


module.exports = {
    parseHTMLByRegex,
    parseWikiResponse,
    parseDatabaseResponse,
    parseDatabaseBodyResponse
}