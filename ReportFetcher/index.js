const request = require('request-promise');
const parser = require('node-html-parser');
const dateformat = require('dateformat');
const mailer = require('nodemailer');

const SHORT_FORMAT = 'm/d/yyyy';
const LONG_FORMAT = 'yyyy-mm-dd-HH-MM-ss'

module.exports = async function (context, myTimer) {

    var today = new Date();
    var startDate = getLastMonthFirstDay(today);
    var endDate = getLastMonthLastDay(today);

    /**
     * Load the login page to obtain form data values.
     */
    request.get({
        uri: 'http://fire.ecm2.us/Login.aspx',
        transform: function (body) {
            return parser.parse(body);
        }

        /**
         *  Send the authentication request.
         */    
        }).then(function (body) {

            var state = body.querySelector('#__VIEWSTATE').attributes.value;
            var valid = body.querySelector('#__EVENTVALIDATION').attributes.value;

            return request.post({
                url: 'http://fire.ecm2.us/Login.aspx',
                followAllRedirects: true,
                jar: true,
                form: {
                    __VIEWSTATE: body.querySelector('#__VIEWSTATE').attributes.value,
                    __EVENTVALIDATION: body.querySelector('#__EVENTVALIDATION').attributes.value,
                    ctl00$ContentPlaceHolder1$Login1$UserName: process.env['ECMUsername'],
                    ctl00$ContentPlaceHolder1$Login1$Password: process.env['ECMPassword'],
                    ctl00$ContentPlaceHolder1$Login1$RadButton1: 'Log In'
                }
            })
        })

        /**
         * Load the report export page to obtain form data values.
         */
        .then(function (body) {
            return request.get({
                url: 'http://fire.ecm2.us/Customers/ExportPages/CreateExport.aspx',
                jar: true,
                transform: function (body) {
                    return parser.parse(body);
                }
            })
        })

        /**
         * Send a report request with last months first and last days.
         */
        .then(function (body) {
            
            var today = new Date();

            var fromState = {
                enabled: true,
                emptyMessage: "",
                validationText: getLongFormat(startDate),
                valueAsString: getLongFormat(startDate),
                minDateStr:"1980-01-01-00-00-00",
                maxDateStr:"2099-12-31-00-00-00",
                lastSetTextBoxValue: getShortDateFormat(startDate)
            }

            var toState = {
                enabled: true,
                emptyMessage: "",
                validationText: getLongFormat(endDate),
                valueAsString: getLongFormat(endDate),
                minDateStr:"1980-01-01-00-00-00",
                maxDateStr:"2099-12-31-00-00-00",
                lastSetTextBoxValue: getShortDateFormat(endDate)
            }

            return request.post({
                url: 'http://fire.ecm2.us/Customers/ExportPages/CreateExport.aspx',
                followAllRedirects: true,
                jar: true,
                form: {
                    __VIEWSTATE: body.querySelector('#__VIEWSTATE').attributes.value,
                    __EVENTVALIDATION: body.querySelector('#__EVENTVALIDATION').attributes.value,
                    ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadDatePicker1$dateInput: getShortDateFormat(startDate),
                    ctl00_ctl00_ContentPlaceHolder1_CustomerBody_RadDatePicker1_dateInput_ClientState: JSON.stringify(fromState),
                    ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadDatePicker2$dateInput: getShortDateFormat(endDate),
                    ctl00_ctl00_ContentPlaceHolder1_CustomerBody_RadDatePicker2_dateInput_ClientState: JSON.stringify(toState),
                    ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadButton1: 'Create Export'               
                },
                transform: function (body) {
                    return parser.parse(body);
                }
            });
        })
        .then(function (body) {

            var error = body.querySelector('#ContentPlaceHolder1_CustomerBody_errorLabel');

            if (error && error.text == 'No incidents to export') {
                return Promise.reject(`There are no incidents to export for ${getShortDateFormat(startDate)} -> ${getShortDateFormat(endDate)}`)
            } else {
                return request.post({
                    url: 'http://fire.ecm2.us/Customers/ExportPages/CreateExport.aspx',            
                    followAllRedirects: true,
                    jar: true,
                    form: {
                        __VIEWSTATE: body.querySelector('#__VIEWSTATE').attributes.value,
                        __EVENTVALIDATION: body.querySelector('#__EVENTVALIDATION').attributes.value,
                        ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadButton2: 'Download Export File',
                        ctl00$ctl00$ContentPlaceHolder1$CustomerBody$Label1: body.querySelector('#ContentPlaceHolder1_CustomerBody_Label1').attributes.value
                    }
                });
            }
        })
        .then(function(response) {
            console.log(response);
        })
        .catch(function (error) {
            notifySlack({
                text: error
            }).catch(function(error) {
                context.log.error(error);
            })
        })
};

function getLastMonthFirstDay(date) {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function getLastMonthLastDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), 0);
}

function getShortDateFormat(date) {
    return dateformat(date, SHORT_FORMAT);
}

function getLongFormat(date) {
    return dateformat(date, LONG_FORMAT);
}

function notifySlack(data) {
    return request.post({
        url: process.env['SlackWebhookURL'],
        json: data
    });
}