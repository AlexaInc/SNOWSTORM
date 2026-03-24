require('dotenv').config();

// Proxy System (loaded before any network imports) — ported from AlexaTG
const proxyHelper = require('./utils/proxyHelper');
proxyHelper.configureAxios();
proxyHelper.configureGlobal();

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
    const connected = await connectDB();
    if (connected) {
        await loadMongoData();
    } else {
        console.log("⚠️ Playing in local JSON mode because MongoDB connection failed or is not configured.");
    }

    console.log("🚀 Starting Web Leaderboard Server...");
    startServer();

    try {
        console.log("🤖 Launching Telegram Bot...");
        // Handle background polling errors
        bot.catch((err, ctx) => {
            console.error(`❌ Background bot error for ${ctx.updateType}:`, err);
        });

        bot.launch().then(() => {
            console.log("✅ Bot is actively polling for messages!");
        }).catch((err) => {
            console.error("❌ Fatal Error during Telegram Bot Polling:", err);
            console.error("This usually means your BOT_TOKEN is invalid or another instance of the bot is running!");
        });
    } catch (e) {
        console.error("❌ Telegram Bot failed to launch:", e.message);
    }
}

start();

// Graceful Stop
process.once('SIGINT', () => {
    try { if (bot.botInfo) bot.stop('SIGINT') } catch (e) { }
});
process.once('SIGTERM', () => {
    try { if (bot.botInfo) bot.stop('SIGTERM') } catch (e) { }
});