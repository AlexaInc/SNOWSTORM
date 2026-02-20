require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    OWNER_ID: parseInt(process.env.OWNER_ID),
    
    // Game Settings
    REGISTRATION_TIME: 120000, 
    EXTEND_TIME: 30000,
    REMINDER_INTERVAL: 30000, 
    ROUND_TIME: 60000,       
    START_HP: 100,
    MAX_EQUIP: 4,
    SKILL_COOLDOWN: 5,
    
    // Files
    DATA_FILE: './snowstorm_data.json',
    SKILL_FILE: './skills.json'
};