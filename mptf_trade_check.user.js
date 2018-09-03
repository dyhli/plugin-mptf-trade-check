// ==UserScript==
// @namespace       https://github.com/dyhli/
// @name            Marketplace.tf trade check
// @description     Checks if a trade is from an official Marketplace.tf bot

// @homepageURL     https://github.com/dyhli/plugin-mptf-trade-check
// @supportURL      https://github.com/dyhli/plugin-mptf-trade-check/issues
// @downloadURL     https://github.com/dyhli/plugin-mptf-trade-check/raw/master/mptf_trade_check.user.js
// @updateURL       https://github.com/dyhli/plugin-mptf-trade-check/raw/master/mptf_trade_check.user.js

// @author          dyhli
// @version         1.0
// @license         MIT

// @grant           GM_addStyle
// @grant           GM.xmlHttpRequest
// @grant           GM.setValue
// @grant           GM.getValue

// @connect         marketplace.tf
// @domain          marketplace.tf

// @run-at          document-end
// @match           https://steamcommunity.com/tradeoffer/*
// ==/UserScript==

/*
 * ------------------------------
 * CONFIGURATION
 * ------------------------------
 *
 * Feel free to modify this part to your needs.
 */

// always lowercase!
const WordsToCheckInName = [
    'marketplace.tf',
    'marketplacetf',
    'tfmarketplace'
];

/*
 * ------------------------------
 * EDIT WITH CAUTION
 * ------------------------------
 *
 * Don't touch this part if you don't know what you're doing.
 */

const Partner = {
    sid: g_ulTradePartnerSteamID,
    name: g_strTradePartnerPersonaName
};
const DialogID = '__plugin_mptf_trade_check_dialog';

(async (window, jQuery, Partner) => {
    // if Partner.sid or Partner.name are undefined, we can assume that
    // the trade has error-ed out.
    if (Partner.sid === undefined || Partner.name === undefined) return;

    // does the name contain any of the words we want to check?
    if (!nameHasWord(Partner.name)) return;

    showDialog();

    const Dialog = jQuery('#' + DialogID);

    // okay, let's check if this is a real marketplace.tf bot
    try {
        const isLegitimate = await isMarketplaceTfBot(Partner.sid);

        // this is a legitimate bot! hooray!
        if (isLegitimate) {
            Dialog.attr('class', 'mptf--state--ok').html(`
                &check; Verification complete, this is an official Marketplace.tf bot.
            `);
            return;
        } else {
            Dialog.attr('class', 'mptf--state--danger').html(`
                &times; WARNING! This is <u>NOT</u> an official Marketplace.tf bot, you may be a victim of the sophisticated
                Marketplace.tf trade scam, please read <a href="https://marketplace.tf/blog/posts/YHLZOB" target="_blank">this blog post</a>
                for more information and what to do next.
            `);
        }
    } catch (e) {
        Dialog.attr('class', 'mptf--state--danger').html(`
            [plugin-mptf-trade-check] Error: ${e.message}. Refresh the page to try again.
        `);
        return;
    }
})(window, jQuery, Partner);

/**
 * Checks if one of the words is in the trade partner's name
 *
 * @param name
 * @return {boolean}
 */
function nameHasWord (name)
{
    name = name.toLowerCase();

    for (let i = 0; i < WordsToCheckInName.length; i++)
    {
        if (name.indexOf(WordsToCheckInName[i]) > - 1) return true;
    }

    return false;
}

/**
 * Retrieve the official marketplace.tf bots from the marketplace.tf website
 *
 * @return {Promise<array>}
 */
function retrieveBots ()
{
    return new Promise((resolve, reject) => {
        let Bots = [ ];

        GM.xmlHttpRequest({
            method: 'GET',
            url: 'https://marketplace.tf/bots',
            timeout: 10000,
            onload: function (response)
            {
                const Response = jQuery(response.responseText);
                const TableRows = Response.find('table.table.table-bordered tbody > tr');

                // malformed data from marketplace.tf
                if (!Response || !TableRows) {
                    return reject('xmlHttpRequest: Received malformed data from marketplace.tf');
                }

                // parse table rows
                TableRows.each(function () {
                    const SteamID = jQuery(this).find('td')[1].innerText;
                    Bots.push(SteamID);
                });

                resolve(Bots);
            },
            onerror: function ()
            {
                reject('xmlHttpRequest: Could not retrieve marketplace.tf bots');
            }
        });
    });
}

/**
 * Update the cache
 *
 * @return {Promise<string>}
 */
async function cacheUpdate ()
{
    let Value = JSON.stringify(await retrieveBots());

    await GM.setValue('marketplaceTfBots', Value);
    await GM.setValue('lastCacheUpdate', Math.floor(+new Date/1000));

    return Value;
}

/**
 * Retrieve the marketplace.tf bots from cache
 *
 * @return {Promise<array>}
 */
async function cacheGet ()
{
    let Bots = await GM.getValue('marketplaceTfBots', false);
    let LastUpdate = await GM.getValue('lastCacheUpdate', 0);

    const CurrentTime = Math.floor(+new Date/1000);
    const SevenDays = 604800;

    if (!Bots || CurrentTime - LastUpdate >= SevenDays) {
        Bots = await cacheUpdate();
    }

    Bots = JSON.parse(Bots);
    return Bots;
}

/**
 * Check if the SteamID64 is a marketplace.tf bot
 *
 * @param sid
 * @return {Promise<boolean>}
 */
async function isMarketplaceTfBot (sid)
{
    const Cache = await cacheGet();

    if (Array.isArray(Cache)) {
        return Cache.includes(sid);
    } else {
        throw new Error('Could not retrieve marketplace.tf bots');
    }
}

/**
 * Shows the information dialog on the trade window
 *
 * @return {void}
 */
function showDialog ()
{
    jQuery('#mainContent').prepend(`
        <div id="${DialogID}" class="mptf--state--loading">
            <img src="https://steamcommunity-a.akamaihd.net/public/images/login/throbber.gif" alt="" style="width:24px;vertical-align: middle">
            <span>Marketplace.tf bot check in progress, please wait...</span>
	    </div>
    `);
}

/*
 * ------------------------------
 * CSS
 * ------------------------------
 *
 * Adding some prettiness to everything!
 */
const CSS = `
#${DialogID} {
    padding: 12px;
    margin-bottom: 10px;
    font-size: 16px;
    font-weight: 600;
    line-height: 28px;
    color: #fff;
}

#${DialogID} img + span {
    margin-left: 8px;
}

.mptf--state--loading {
    background-color: #555;
}
.mptf--state--ok {
    background-color: #5c7e10;
}
.mptf--state--danger {
    background-color: #d23333;
}
.mptf--state--danger a {
    color: #ece05b;
}
.mptf--state--danger a:hover {
    text-decoration: underline;
}
`;

GM_addStyle(CSS);