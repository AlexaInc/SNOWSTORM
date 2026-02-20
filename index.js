require('dotenv').config();
const { Telegraf } = require('telegraf');
const http = require('http');
const { BOT_TOKEN } = require('./config');

const bot = new Telegraf(BOT_TOKEN);

// Load Modules
require('./shop')(bot);
require('./game')(bot);
require('./lang')(bot);
// HTTP Server for Uptime
const PORT = process.env.PORT || 8000;
http.createServer((req, res) => res.end('OK')).listen(PORT);

console.log("🤖 Modular Snowstorm Bot Running...");
bot.launch();

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));