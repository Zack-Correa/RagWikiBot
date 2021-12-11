const parseHTMLByRegex = (html) => {
        let regexp = /<td>[\n\r]\s*<img(<a href)*((.|[\n\r])*?(<\/td>))/g;
        let parsedHTML = html.match(regexp);
        if(parsedHTML) {
            return parsedHTML.toString().split("<td>");
        }
        else{
            return null;
        }
}



module.exports = {
    parseHTMLByRegex
}