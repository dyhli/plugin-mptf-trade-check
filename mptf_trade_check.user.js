// ==UserScript==
// @namespace       https://github.com/dyhli/
// @name            Marketplace.tf trade check
// @description     Checks if a trade is from an official Marketplace.tf bot

// @homepageURL     https://github.com/dyhli/plugin-mptf-trade-check
// @supportURL      https://github.com/dyhli/plugin-mptf-trade-check/issues
// @downloadURL     https://github.com/dyhli/plugin-mptf-trade-check/raw/master/mptf_trade_check.user.js
// @updateURL       https://github.com/dyhli/plugin-mptf-trade-check/raw/master/mptf_trade_check.user.js

// @author          dyhli
// @version         1.2
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
    sid: g_ulTradePartnerSteamID || undefined,
    name: g_strTradePartnerPersonaName || undefined
};

const DialogID = '__plugin_mptf_trade_check_dialog';
const ModalID = '__plugin-mptf_trade_check_modal';

let TradeOfferID = 0;
let TradeOfferCheckCount = 0;
const ProfileUrl = UserYou.strProfileURL || '';

(async (jQuery, Partner) => {
    // if Partner.sid or Partner.name are undefined, we can assume that
    // the trade has error-ed out.
    if (Partner.sid === undefined || Partner.name === undefined) return;

    // does the name contain any of the words we want to check?
    if (!nameHasWord(Partner.name)) return;

    registerAjaxInterceptor();
    showDialog();

    const Dialog = jQuery('#' + DialogID);

    // okay, let's check if this is a real marketplace.tf bot
    try {
        const isLegitimate = await isMarketplaceTfBot(Partner.sid);

        // this is a legitimate bot! hooray!
        if (isLegitimate)
        {
            Dialog.attr('class', 'mptf--state--ok').html(`
                &check; Verification complete, this is an official Marketplace.tf bot.
            `);
            return;
        }
        else
        {
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
})(jQuery, Partner);

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

/**
 * Listens to when an AJAX requests completes and executes onTradeOfferSent() when
 * the trade offer was successfully sent.
 *
 * @return {void}
 */
function registerAjaxInterceptor ()
{
    jQuery(document).ajaxComplete((event, xhr, settings) => {
        if (
            settings.type === 'POST' &&
            settings.url === 'https://steamcommunity.com/tradeoffer/new/send' &&
            xhr.hasOwnProperty('responseJSON') &&
            xhr.responseJSON.hasOwnProperty('tradeofferid')
        ) {
            onTradeOfferSent(xhr.responseJSON.tradeofferid);
        }
    })
}

/**
 * Trade offer was successfully sent, we have received the trade offer ID.
 *
 * @param tradeofferid
 */
function onTradeOfferSent (tradeofferid)
{
    TradeOfferID = tradeofferid;

    showModal();
    checkTradeOffer();
}

/**
 * Show modal.
 *
 * @return {void}
 */
function showModal ()
{
    jQuery('body').prepend(`
        <div id="${ModalID}-backdrop"></div>
        <div id="${ModalID}">
            <img src="https://steamcommunity-a.akamaihd.net/public/images/login/throbber.gif" alt="">
            <span>Do not confirm the trade on your phone just yet...</span>
        </div>
    `);
}

/**
 * Show modal telling the user to proceed with accepting the trade on their phone
 *
 * @return {void}
 */
function showProceedModal ()
{
    jQuery('#' + ModalID).find('span').html(`Everything looks fine for now, you may proceed with accepting the
    trade offer on your phone. Please keep an eye on this window in case things change.`);
}

/**
 * Get the trade offer
 *
 * @param cb
 * @return {*}
 */
function getTradeOffer (cb)
{
    if (!TradeOfferID) return cb(null);

    jQuery.ajax({
        url: ProfileUrl + '/tradeoffers/sent/',
        type: 'GET',
        crossDomain: true,
        xhrFields: { withCredentials: true }
    }).done(function (data) {
        const DOM = jQuery(data);
        const TradeOffer = DOM.find('#tradeofferid_' + TradeOfferID);

        if (TradeOffer.length === 1) cb(TradeOffer);
        else cb(null);
    });
}

/**
 * Check the sent trade offer for any weird changes
 *
 * @return {void}
 */
function checkTradeOffer ()
{
    getTradeOffer(function (offer) {
        // trade offer is no longer active or declined
        if (offer === null) return offerInactive();

        const IsAccepted = offerIsAccepted(offer);

        // trade offer does not have a cancel button and is not accepted
        if (!hasCancelButton(offer) && !IsAccepted) return offerInactive();

        // trade offer is still pending
        if (!IsAccepted)
        {
            TradeOfferCheckCount++;
            if (TradeOfferCheckCount === 3) showProceedModal();
            setTimeout(checkTradeOffer, 4000);
        }
        else
        {
            jQuery('#' + ModalID).html(`
                <span class="plugin--text--ok">
                    &check; Trade offer successfully accepted by Marketplace.tf!
                </span>
            `);
        }
    });
}

/**
 * Does the trade offer still have a cancel button?
 *
 * @param offer
 * @return {boolean}
 */
function hasCancelButton (offer)
{
    return offer[0].innerHTML.indexOf('javascript:CancelTradeOffer(') > -1;
}

/**
 * Has the offer been accepted?
 *
 * @param offer
 * @return {boolean}
 */
function offerIsAccepted (offer)
{
    return offer.find('.tradeoffer_items_banner.accepted').length === 1;
}

/**
 * Offer is unexpectedly no longer active, may be compromised!
 *
 * @return {void}
 */
function offerInactive ()
{
    jQuery('#' + ModalID).html(`
        <span class="plugin--text--danger">
            &times; The trade offer you sent is unexpectedly no longer active. There is a chance that you may be a
            victim of the Marketplace.tf scam, please read <a href="https://marketplace.tf/blog/posts/YHLZOB" target="_blank">this blog post</a>
            for more information and what to do next.
        </span>
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

#${ModalID}-backdrop {
    position: fixed;
    z-index: 2000;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #222;
}
#${ModalID} {
    position: fixed;
    z-index: 2001;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    max-width: 100%;
    height: 100%;
    text-align: center;
    padding: 25px 10px;
    font-size: 28px;
    line-height: 42px;
    color: #eee;
}
#${ModalID} img {
    margin: 0 auto;
    display: block;
    margin-bottom: 24px;
}

.plugin--text--ok {
    color: #5c7e10;
}
.plugin--text--danger {
    color: #d23333;
}

.mptf--state--loading {
    background-color: #555;
}
.mptf--state--ok {
    background-color: #5c7e10 !important;
}
.mptf--state--danger {
    background-color: #d23333 !important;
}
.mptf--state--danger a,
.plugin--text--danger a{
    color: #ece05b;
}
.mptf--state--danger a:hover,
.plugin--text--danger a:hover{
    text-decoration: underline;
}
`;

GM_addStyle(CSS);