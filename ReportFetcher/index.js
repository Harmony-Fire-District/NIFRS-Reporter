const request = require('request');
const parser = require('node-html-parser')

module.exports = async function (context, myTimer) {

    request.get('http://fire.ecm2.us/Login.aspx', function(error, response, body) {
        
        var root = parser.parse(body);

        request.post({
            url: 'http://fire.ecm2.us/Login.aspx',
            followAllRedirects: true,
            jar: true,
            form: {
                ctl00$ContentPlaceHolder1$Login1$UserName: 'username',
                ctl00$ContentPlaceHolder1$Login1$Password: 'password',
                ctl00$ContentPlaceHolder1$Login1$RadButton1: 'Log In',
                __VIEWSTATE: root.querySelector('#__VIEWSTATE').attributes.value,
                __EVENTVALIDATION: root.querySelector('#__EVENTVALIDATION').attributes.value
            }
        }, function(error, response, body){
            if (error) {
                console.log(error)
            } else {
                console.log('Authentication request complete')
            }
            
        })

    }) 
};