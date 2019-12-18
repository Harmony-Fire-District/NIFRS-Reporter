const request = require('request-promise');
const parser = require('node-html-parser');
const dateformat = require('dateformat');

const SHORT_FORMAT = 'm/d/yyyy';
const LONG_FORMAT = 'yyyy-mm-dd-HH-MM-ss'

module.exports = async function (context, myTimer) {

    var username = 'HFD';
    var password = 'Road22house@';

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
                    ctl00$ContentPlaceHolder1$Login1$UserName: username,
                    ctl00$ContentPlaceHolder1$Login1$Password: password,
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
                validationText: getLongFormat(getLastMonthFirstDay(today)),
                valueAsString: getLongFormat(getLastMonthFirstDay(today)),
                minDateStr:"1980-01-01-00-00-00",
                maxDateStr:"2099-12-31-00-00-00",
                lastSetTextBoxValue: getShortDateFormat(getLastMonthFirstDay(today))
            }

            var toState = {
                enabled: true,
                emptyMessage: "",
                validationText: getLongFormat(getLastMonthLastDay(today)),
                valueAsString: getLongFormat(getLastMonthLastDay(today)),
                minDateStr:"1980-01-01-00-00-00",
                maxDateStr:"2099-12-31-00-00-00",
                lastSetTextBoxValue: getShortDateFormat(getLastMonthLastDay(today))
            }

            var fromJson = JSON.stringify(fromState);

            return request.post({
                url: 'http://fire.ecm2.us/Customers/ExportPages/CreateExport.aspx',
                followAllRedirects: true,
                jar: true,
                form: {
                    __VIEWSTATE: body.querySelector('#__VIEWSTATE').attributes.value,
                    __EVENTVALIDATION: body.querySelector('#__EVENTVALIDATION').attributes.value,
                    ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadDatePicker1$dateInput: getShortDateFormat(getLastMonthFirstDay(today)),
                    ctl00_ctl00_ContentPlaceHolder1_CustomerBody_RadDatePicker1_dateInput_ClientState: JSON.stringify(fromState),
                    ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadDatePicker2$dateInput: getShortDateFormat(getLastMonthLastDay(today)),
                    ctl00_ctl00_ContentPlaceHolder1_CustomerBody_RadDatePicker2_dateInput_ClientState: JSON.stringify(toState),
                    ctl00$ctl00$ContentPlaceHolder1$CustomerBody$RadButton1: 'Create Export'               
                },
                transform: function (body) {
                    return parser.parse(body);
                }
            });
        })
        .then(function (body) {
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
        })
        .then(function(response) {
            console.log(response);
        })
        .catch(function (error) {
            console.log(error);
        })
};

function getLastMonthFirstDay(date) {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function getLastMonthLastDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), 0);
}

/**
 * Provides a DateTime in the correct format, and month adjusted from zero base.
 * @param {Date} date 
 */
function getFormattedDate(date) {
    return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
}

/**
 * Parses out the forms input elements for use during a post request.
 */
function parseInputFormData(body) {
    var inputs = body.querySelectorAll('input');
    var formData = {};
    body.querySelectorAll('input').forEach(function(item, index) {
        formData[item.attributes.name] = item.attributes.value;
    });
    return formData;
}

function getShortDateFormat(date) {
    return dateformat(date, SHORT_FORMAT);
}

function getLongFormat(date) {
    return dateformat(date, LONG_FORMAT);
}