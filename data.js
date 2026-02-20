const fs = require('fs');
const { DATA_FILE, SKILL_FILE } = require('./config');

const SETTINGS_FILE = './settings.json'; // 🆕 New File

// Load Skills
let SKILLS = {};
if (fs.existsSync(SKILL_FILE)) {
    try { SKILLS = JSON.parse(fs.readFileSync(SKILL_FILE)); }
    catch (e) { console.error("❌ Error loading skills.json"); }
}

// Load Users
let userData = {};
if (fs.existsSync(DATA_FILE)) {
    try { userData = JSON.parse(fs.readFileSync(DATA_FILE)); } 
    catch (e) {}
}

// 🆕 Load Settings (Languages)
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE)); } 
    catch (e) {}
}

function saveData() { 
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2)); 
}

// 🆕 Save Settings
function saveSettings() { 
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); 
}

function escapeMarkdown(text) {
    if (!text) return "Survivor";
    return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function getUser(id, name) {
    if (!userData[id]) {
        userData[id] = { 
            name: escapeMarkdown(name),
            points: 500, 
            wins: 0, 
            kills: 0,
            inventory: {}, 
            equipped_skills: []
        };
    }
    if (name) userData[id].name = escapeMarkdown(name); 
    return userData[id];
}

module.exports = { userData, settings, SKILLS, saveData, saveSettings, getUser, escapeMarkdown };