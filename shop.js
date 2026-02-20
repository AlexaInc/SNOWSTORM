const { Markup } = require('telegraf');
const { userData, SKILLS, getUser, saveData, escapeMarkdown } = require('./data');
const { mention } = require('./utils');
const { MAX_EQUIP } = require('./config');

module.exports = (bot) => {

    // 👤 PROFILE
    bot.command('profile', (ctx) => {
        const u = getUser(ctx.from.id, ctx.from.first_name);
        
        let msg = `👤 *PROFILE: ${u.name}*\n\n💎 Points: **${u.points}**\n🏆 Wins: ${u.wins}\n\n`;
        
        msg += `🎒 **Inventory (Stock):**\n`;
        const items = Object.keys(u.inventory);
        if (items.length === 0) msg += "_Empty_\n";
        else {
            items.forEach(k => {
                const count = u.inventory[k];
                if(SKILLS[k] && count > 0) msg += `• ${SKILLS[k].name}: **x${count}**\n`;
            });
        }

        msg += `\n⚡ **Active Loadout:**\n`;
        if (u.equipped_skills.length === 0) msg += "_None_";
        else u.equipped_skills.forEach(k => { if(SKILLS[k]) msg += `• ${SKILLS[k].name}\n`; });

        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // 🛒 SHOP
    bot.command('shop', (ctx) => {
        const u = getUser(ctx.from.id);
        let msg = `🛒 *SKILL SHOP*\n💎 **Points:** ${u.points}\n⚠️ *One item is consumed per game joined.*\n\n`;
        let buttons = [];
        
        Object.keys(SKILLS).sort((a, b) => SKILLS[a].cost - SKILLS[b].cost).forEach(key => {
            const item = SKILLS[key];
            const count = u.inventory[key] || 0;
            
            msg += `⚡ *${item.name}* (💎 ${item.cost})\n   └ _${item.desc}_\n\n`;
            buttons.push([Markup.button.callback(`💎 Buy ${item.name} (Own: ${count})`, `buy_skill_${key}`)]);
        });
        
        ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // 🛍️ BUY ACTION
    bot.action(/^buy_skill_(.+)$/, (ctx) => {
        const key = ctx.match[1];
        const u = getUser(ctx.from.id);
        const item = SKILLS[key];

        if (!item || u.points < item.cost) return ctx.answerCbQuery("Insufficient Points");
        
        u.points -= item.cost;
        if (!u.inventory[key]) u.inventory[key] = 0;
        u.inventory[key]++;
        
        saveData();
        ctx.answerCbQuery(`Bought ${item.name}!`);
        
        // Refresh Shop
        const buttons = [];
        Object.keys(SKILLS).sort((a, b) => SKILLS[a].cost - SKILLS[b].cost).forEach(k => {
            const i = SKILLS[k];
            const count = u.inventory[k] || 0;
            buttons.push([Markup.button.callback(`💎 Buy ${i.name} (Own: ${count})`, `buy_skill_${k}`)]);
        });
        ctx.editMessageReplyMarkup({ inline_keyboard: buttons }).catch(()=>{});
    });

    // ⚡ EQUIP (Simple Toggle)
    bot.command('equip', (ctx) => {
        const u = getUser(ctx.from.id);
        const availableItems = Object.keys(u.inventory).filter(k => u.inventory[k] > 0);
        
        if (availableItems.length === 0) return ctx.reply("🎒 Inventory empty! Buy skills in /shop first.");

        const buttons = availableItems.map(k => {
            if (!SKILLS[k]) return [];
            
            // Check if equipped (Simple Includes Check)
            const isEquipped = u.equipped_skills.includes(k);
            const btnText = isEquipped ? `✅ ${SKILLS[k].name}` : `⬛ ${SKILLS[k].name}`;

            return [Markup.button.callback(btnText, `toggle_skill_${k}`)];
        });
        buttons.push([Markup.button.callback('✅ Done', 'equip_done')]);
        
        ctx.reply(`⚡ **LOADOUT MANAGER**\nSlots: ${u.equipped_skills.length}/${MAX_EQUIP}\nSelect up to 4 unique skills.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // 🔄 TOGGLE ACTION (Simple On/Off)
    bot.action(/^toggle_skill_(.+)$/, (ctx) => {
        const key = ctx.match[1];
        const u = getUser(ctx.from.id);

        if (!u.inventory[key] || u.inventory[key] <= 0) return ctx.answerCbQuery("You don't own this!");

        if (u.equipped_skills.includes(key)) {
            // Remove
            u.equipped_skills = u.equipped_skills.filter(k => k !== key);
        } else {
            // Add (Limit Check)
            if (u.equipped_skills.length >= MAX_EQUIP) return ctx.answerCbQuery(`Max ${MAX_EQUIP} slots full!`);
            u.equipped_skills.push(key);
        }
        
        saveData();
        
        // Refresh Buttons
        const availableItems = Object.keys(u.inventory).filter(k => u.inventory[k] > 0);
        const buttons = availableItems.map(k => {
            if (!SKILLS[k]) return [];
            const isEquipped = u.equipped_skills.includes(k);
            const btnText = isEquipped ? `✅ ${SKILLS[k].name}` : `⬛ ${SKILLS[k].name}`;
            return [Markup.button.callback(btnText, `toggle_skill_${k}`)];
        });
        buttons.push([Markup.button.callback('✅ Done', 'equip_done')]);
        
        ctx.editMessageText(`⚡ **LOADOUT MANAGER**\nSlots: ${u.equipped_skills.length}/${MAX_EQUIP}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
        ctx.answerCbQuery();
    });

    bot.action('equip_done', (ctx) => ctx.deleteMessage());
    
    // GIFT
    bot.command('gift', (ctx) => {
        if (!ctx.message.reply_to_message) return ctx.reply("Reply to user.");
        const amount = parseInt(ctx.message.text.split(' ')[1]);
        if (isNaN(amount) || amount <= 0) return ctx.reply("Invalid amount.");

        const sender = getUser(ctx.from.id, ctx.from.first_name);
        const recipient = getUser(ctx.message.reply_to_message.from.id, ctx.message.reply_to_message.from.first_name);

        if (sender.points < amount) return ctx.reply("Insufficient funds.");
        
        sender.points -= amount;
        recipient.points += amount;
        saveData();
        ctx.reply(`🎁 Sent 💎 ${amount} to ${mention(recipient)}!`, { parse_mode: 'Markdown' });
    });

    // LEADERBOARD
    bot.command(['top', 'leaderboard'], (ctx) => {
        const sorted = Object.entries(userData).sort((a, b) => b[1].points - a[1].points).slice(0, 10);
        let msg = "🏆 *LEADERBOARD*\n\n";
        sorted.forEach((e, i) => msg += `${i+1}. ${escapeMarkdown(e[1].name)} | 💎 ${e[1].points}\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });
};