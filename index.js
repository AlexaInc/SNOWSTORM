require('dotenv').config();
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const startServer = require('./server');
const { connectDB } = require('./db');
const { loadMongoData, t, getLang } = require('./data');

const bot = new Telegraf(BOT_TOKEN);

// Load Modules
require('./shop')(bot);
require('./game')(bot);
require('./lang')(bot);

// Friendly Help Command
bot.command('help', (ctx) => {
    const helpMsg = `📖 *Welcome to Snowstorm!* ❄️\n\n` +
        `You and your friends are stuck in a deadly blizzard. Only the last survivor wins! Here is how to play:\n\n` +
        `🎯 *Getting Started*\n` +
        `1️⃣ Admin types /game in the group to open the lobby.\n` +
        `2️⃣ Players click "Join" to enter. (Make sure you have started a private message with me first!)\n` +
        `3️⃣ The Admin clicks "Force Start" when everyone is ready.\n\n` +
        `🎮 *How to Survive*\n` +
        `Every round, I will send you a direct message with choices:\n` +
        `🔥 *Build Fire:* Safely restore health.\n` +
        `🎒 *Scavenge:* High risk, high reward. Find big heals, or get ambushed by wolves!\n` +
        `⚔️ *Basic Attack:* Throw a snowball to damage another player.\n` +
        `⚡ *Skills:* Use special items (like a Shield or Medkit) bought from the shop.\n\n` +
        `🛍️ *The Shop*\n` +
        `Use the /shop command to buy powerful items with your points before the game starts!\n\n` +
        `💡 *Pro Tip:* The storm gets colder and deals more damage every round. Don't freeze!`;

    ctx.reply(helpMsg, { parse_mode: 'Markdown' });
});

// Initialization
async function start() {
    console.log("⏳ Initializing database...");
    await connectDB();
    await loadMongoData();

    console.log("🚀 Starting Web Leaderboard Server...");
    startServer();

    console.log("🤖 Launching Telegram Bot...");
    bot.launch();
}

start();

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));