require('dotenv').config();
const { Telegraf } = require('telegraf');
const { ProxyAgent } = require('proxy-agent');
const fetch = require('node-fetch'); // Use explicit fetch
const { BOT_TOKEN } = require('./config');
const startServer = require('./server');
const { connectDB } = require('./db');
const { loadMongoData, t, getLang } = require('./data');

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
const botOptions = {};

if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    botOptions.telegram = {
        agent: agent,
        fetch: (url, opts) => fetch(url, { ...opts, agent: agent })
    };
    console.log(`🔌 Using Universal Proxy: ${proxyUrl}`);
}

const bot = new Telegraf(BOT_TOKEN, botOptions);

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
        await bot.launch();
    } catch (e) {
        console.error("❌ Telegram Bot failed to launch:", e.message);
        console.error("Make sure your server/Hugging Face Space has internet access to api.telegram.org");
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