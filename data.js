const fs = require('fs');
const { DATA_FILE, SKILL_FILE, MONGO_URL } = require('./config');
const { User } = require('./db');

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
    catch (e) { }
}

// 🆕 Load Settings (Languages)
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE)); }
    catch (e) { }
}

async function loadMongoData() {
    if (!MONGO_URL) return;
    try {
        const users = await User.find({}).maxTimeMS(5000);
        users.forEach(u => {
            let inv = {};
            if (u.inventory) {
                u.inventory.forEach((val, key) => inv[key] = val);
            }
            userData[u.id] = {
                name: u.name,
                points: u.points,
                wins: u.wins,
                kills: u.kills,
                inventory: inv,
                equipped_skills: u.equipped_skills || []
            };
        });
        console.log("✅ Synced game data from MongoDB");
    } catch (e) {
        console.error("❌ Failed to sync from MongoDB (Skipping). Error:", e.message);
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
    if (MONGO_URL) {
        const ops = Object.keys(userData).map(id => {
            const u = userData[id];
            return {
                updateOne: {
                    filter: { id: id },
                    update: {
                        $set: {
                            id: id,
                            name: u.name,
                            points: u.points,
                            wins: u.wins,
                            kills: u.kills,
                            inventory: u.inventory,
                            equipped_skills: u.equipped_skills
                        }
                    },
                    upsert: true
                }
            };
        });
        if (ops.length > 0) User.bulkWrite(ops).catch(e => console.error("Mongo Save Error:", e.message));
    }
}

// 🆕 Save Settings
function saveSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function escapeMarkdown(text) {
    if (!text) return "Survivor";
    return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function getUser(id, firstName, lastName) {
    let providedName = "";
    if (firstName) providedName = firstName;
    if (lastName) providedName += (providedName ? " " : "") + lastName;
    providedName = providedName.trim();

    if (!userData[id]) {
        userData[id] = {
            name: escapeMarkdown(providedName || "Survivor"),
            points: 500,
            wins: 0,
            kills: 0,
            inventory: {},
            equipped_skills: []
        };
    } else if (providedName) {
        // Only update if a valid name is provided to avoid accidentally overwriting it with "Survivor" when caller doesn't provide args
        userData[id].name = escapeMarkdown(providedName);
    }
    return userData[id];
}

module.exports = { userData, settings, SKILLS, saveData, saveSettings, getUser, escapeMarkdown, loadMongoData };