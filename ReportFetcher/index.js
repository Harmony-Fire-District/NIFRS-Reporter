const request = require('request-promise');
const parser = require('node-html-parser');
const dateformat = require('dateformat');
const sendgrid = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

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
            resolveWithFullResponse: true,
            form: {
                __VIEWSTATE: body.querySelector('#__VIEWSTATE').attributes.value,
                __EVENTVALIDATION: body.querySelector('#__EVENTVALIDATION').attributes.value,
                ctl00$ContentPlaceHolder1$Login1$UserName: process.env['ECM2_USERNAME'],
                ctl00$ContentPlaceHolder1$Login1$Password: process.env['ECM2_PASSWORD'],
                ctl00$ContentPlaceHolder1$Login1$RadButton1: 'Log In'
            }
        })
    })

    /**
     * Load the report export page to obtain form data values.
     * This section also checks if we had any authentication problems. Since ECM2 will return an HTTP 200 for failed login attempts, and there are no
     * good HTML tags to key off of; we check if we were redirected to the CustomerHome page.
     */
    .then(function (response) {

        if (!('/Customers/CustomerHome.aspx' == response.req.path)) {
            return Promise.reject('Authentication into ECM2 failed. ECM2 could be down, or the credentials could be wrong.');
        }

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
            validationText: getLongDateFormat(startDate),
            valueAsString: getLongDateFormat(startDate),
            minDateStr: "1980-01-01-00-00-00",
            maxDateStr: "2099-12-31-00-00-00",
            lastSetTextBoxValue: getShortDateFormat(startDate)
        }

        var toState = {
            enabled: true,
            emptyMessage: "",
            validationText: getLongDateFormat(endDate),
            valueAsString: getLongDateFormat(endDate),
            minDateStr: "1980-01-01-00-00-00",
            maxDateStr: "2099-12-31-00-00-00",
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

    /**
     * Download the report.
     */
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

    /**
     * Email the report.
     */
    .then(function (report) {
        return sendEmail(createReportEmail(report));
    })
    .then(function () {
        var reportDate = getLastMonthFirstDay(new Date());
        notifySlack(slackSuccessNotification(`NFIRS Report for ${dateformat(reportDate, 'mmmm yyyy')} has been sent successfully!`))
    })
    .catch(function (error) {
        notifySlack(slackErrorNotification(error))
            .catch(function (error) {
                context.log.error(error);
            });
    });
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

function getLongDateFormat(date) {
    return dateformat(date, LONG_FORMAT);
}

function notifySlack(data) {
    return request.post({
        url: process.env['SLACK_NOTIFICATION_WEBHOOK_URL'],
        json: data
    });
}

function slackErrorNotification(message) {
    return {
        blocks: [
            {
                type: 'context',
                elements: [
                    {
                        type: 'image',
                        image_url: 'https://api.slack.com/img/blocks/bkb_template_images/notificationsWarningIcon.png',
                        alt_text: 'Notification warning icon'
                    },
                    {
                        type: 'mrkdwn',
                        text: '*There was a problem running the NFIRS Report!*'
                    }
                ]
            },
            {
                type: 'section',
                text: {
                    type: 'plain_text',
                    emoji: true,
                    text: message
                }
            }
        ]
    }
}

function slackSuccessNotification(message) {
    return {
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'plain_text',
                    emoji: true,
                    text: message
                }
            }
        ]
    };
}

function sendEmail(email) {
    return new Promise(function (resolve, reject) {
        sendgrid.setApiKey(process.env['SENDGRID_API_KEY']);
        sendgrid.send(email, function (error, json) {
            if (error) {
                reject(`Failed to send NFIRS email: ${error}`);
            } else {
                resolve();
            }
        });
    });
}

function createReportEmail(report) {
    var reportDate = getLastMonthFirstDay(new Date());
    var email = {
        to: process.env['REPORT_RECIPIENT'],
        from: 'no-reply@harmonyfire22.org',
        subject: `Harmony Fire District - NFIRS Report for ${dateformat(reportDate, 'mmmm yyyy')}`,
        html: getEmailTemplate({
            date: dateformat(reportDate, 'mmmm yyyy')
        }),
        attachments: [
            {
                filename: `HFD-NFIRS-${dateformat(reportDate, 'mmmyyyy')}.txt`,
                content: Buffer.from(report).toString('base64'),
                type: 'plain/text',
                disposition: 'attachment'
            }
        ]
    }

    var cc = process.env['REPORT_RECIPIENTS_CC'];
    if (cc) {
        email['cc'] = cc.split(',');
    }

    var bcc = process.env['REPORT_RECIPIENTS_BCC'];
    if (bcc) {
        email['bcc'] = bcc.split(',');
    }

    return email;
}

function getEmailTemplate(context) {
    return fs.readFileSync(path.join(__dirname, '/email-template.html'), {
        encoding: 'utf-8'
    })
        .replace('{DATE}', context.date)
        .replace('{SUPPORT_EMAIL}', process.env['SUPPORT_EMAIL']);
}