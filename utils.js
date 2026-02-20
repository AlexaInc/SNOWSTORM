const { OWNER_ID } = require('./config');
const { escapeMarkdown } = require('./data');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const mention = (p) => `[${p.name}](tg://user?id=${p.id})`;

async function safeDM(bot, userId, text, extra) {
    try { await bot.telegram.sendMessage(userId, text, extra); } 
    catch (e) { /* Ignore block errors */ }
}

async function isAdminOrOwner(ctx) {
    if (ctx.from.id === OWNER_ID || ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        return ['creator', 'administrator'].includes(member.status);
    } catch (e) { return false; }
}

module.exports = { sleep, random, mention, safeDM, isAdminOrOwner };
