const fs = require('fs');
const path = require('path');
const { settings } = require('./data');

// Load Locales into Memory
const locales = {
    en: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'en.json'))),
    si: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'si.json'))),
    es: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'es.json'))),
    fr: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'fr.json'))),
    de: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'de.json'))),
    pt: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'pt.json'))),
    hi: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'hi.json'))),
    it: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'it.json')))
};

// 1. Get Language Code for a specific Chat + Thread
function getLang(chatId, threadId) {
    // Key format: "chatId" OR "chatId_threadId"
    const key = threadId ? `${chatId}_${threadId}` : `${chatId}`;
    return settings[key] || 'en'; // Default to English
}

// 2. Translate Function
// Usage: t('game_intro', 'si', { round: 5 })
function t(key, langCode, placeholders = {}) {
    const lang = locales[langCode] || locales['en'];
    let text = lang[key] || locales['en'][key] || key;

    // Replace {placeholders}
    Object.keys(placeholders).forEach(ph => {
        text = text.replace(new RegExp(`{${ph}}`, 'g'), placeholders[ph]);
    });

    return text;
}

module.exports = { getLang, t, locales };