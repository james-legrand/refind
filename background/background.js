/*
 * Searchlight - Background script to store settings and most recent search.
 */ 
console.log('[Searchlight] Background script loaded');


// Default to a vanilla search
const DEFAULTS = { caseSensitive: false, useRegex: false };

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    if (message.action === 'getSettings') {
        browser.storage.local.get(DEFAULTS).then(sendResponse);
        return true;
    }
    
    if (message.action === 'saveSettings') {
        browser.storage.local.set(message.settings).then(() => sendResponse({ success: true }));
        return true;
    }
});