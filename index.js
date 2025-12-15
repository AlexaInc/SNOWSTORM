require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

// ==================================================================
// ⚠️ CONFIGURATION
// ==================================================================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const OWNER_ID = parseInt(process.env.OWNER_ID);

const REGISTRATION_TIME = 60000; 
const EXTEND_TIME = 30000;
const ROUND_TIME = 30000;       
const START_HP = 100;

const POINTS_FILE = './snowstorm_points.json';

const bot = new Telegraf(BOT_TOKEN);
const games = {}; 

// Load Points
let userPoints = {};
if (fs.existsSync(POINTS_FILE)) {
    try { userPoints = JSON.parse(fs.readFileSync(POINTS_FILE)); } 
    catch (e) {}
}

function savePoints() { 
    fs.writeFileSync(POINTS_FILE, JSON.stringify(userPoints, null, 2)); 
}

function updateUserData(userId, name, pointsToAdd = 0, win = false, kill = false) {
    if (!userPoints[userId]) {
        userPoints[userId] = { points: 0, wins: 0, kills: 0, name: name };
    }
    // Sanitize name for database
    if (name) userPoints[userId].name = name.replace(/[\[\]()_*`]/g, ''); 
    
    userPoints[userId].points += pointsToAdd;
    if (win) userPoints[userId].wins++;
    if (kill) userPoints[userId].kills++;
    savePoints();
}

// ==================================================================
// 🛠️ HELPERS
// ==================================================================

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 THE MENTION HELPER
// Automatically creates [Name](tg://user?id=123) and cleans the name of broken symbols
const mention = (p) => {
    const cleanName = (p.name || "Survivor").replace(/[\[\]()_*`]/g, ''); 
    return `[${cleanName}](tg://user?id=${p.id})`;
};

async function safeDM(userId, text, extra) {
    try { await bot.telegram.sendMessage(userId, text, extra); } 
    catch (e) { }
}
async function isAdminOrOwner(ctx) {
    if (ctx.from.id === OWNER_ID || ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        return ['creator', 'administrator'].includes(member.status);
    } catch (e) { return false; }
}

/* ==================================================================
   COMMANDS
   ================================================================== */

bot.command(['game', 'game@YourBotName'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const chatId = ctx.chat.id;

    if (games[chatId]) return ctx.reply("⚠️ *Game is already active.*", { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id });

    games[chatId] = {
        id: chatId,
        active: true,
        phase: 'register',
        round: 0,
        stormIntensity: 10, // Fast start
        players: {},
        timer: null,
        messageId: null,
        nextPurgeRound: random(2, 3) 
    };

    const botUser = ctx.botInfo.username;
    const joinLink = `https://t.me/${botUser}?start=join_${chatId}`;

    const msg = await ctx.reply(
        `🌨 *SNOWSTORM: CHAOS MODE*\n\n⚡ **Fast Pace:** High Damage\n💀 **Reaper:** Strikes Round 2-3\n🎅 **Round 1:** Santa Gifts\n\n⏳ **Registration:** 60s`,
        { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([Markup.button.url('🔥 Join (PM)', joinLink)])
        }
    );

    games[chatId].messageId = msg.message_id;
    games[chatId].timer = setTimeout(() => startGame(ctx, chatId), REGISTRATION_TIME);
});

bot.command('extend', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const game = games[ctx.chat.id];
    if (game && game.phase === 'register') {
        clearTimeout(game.timer);
        await ctx.reply(`⏳ *Extended +30s*`, { parse_mode: 'Markdown' });
        game.timer = setTimeout(() => startGame(ctx, ctx.chat.id), EXTEND_TIME);
    }
});

bot.command('stop', async (ctx) => {
    if (await isAdminOrOwner(ctx) && games[ctx.chat.id]?.phase === 'register') {
        clearTimeout(games[ctx.chat.id].timer);
        delete games[ctx.chat.id];
        ctx.reply("🛑 *Registration Stopped.*", { parse_mode: 'Markdown' });
    }
});
bot.command('cancel', async (ctx) => {
    if (await isAdminOrOwner(ctx) && games[ctx.chat.id]) {
        clearTimeout(games[ctx.chat.id].timer);
        delete games[ctx.chat.id];
        ctx.reply("🚫 *Game Cancelled.*", { parse_mode: 'Markdown' });
    }
});

bot.command(['top', 'leaderboard'], async (ctx) => {
    const sorted = Object.entries(userPoints).sort((a, b) => b[1].points - a[1].points).slice(0, 10);
    let msg = "🏆 *GLOBAL LEADERBOARD*\n\n";
    if (sorted.length === 0) msg += "No data yet.";
    
    sorted.forEach((entry, i) => {
        const uid = entry[0];
        const data = entry[1];
        // Use the mention helper structure manually here since we only have data
        const cleanName = (data.name || "Survivor").replace(/[\[\]()_*`]/g, ''); 
        msg += `${i+1}. [${cleanName}](tg://user?id=${uid}) | 💎 ${data.points}\n`; 
    });
    
    ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.start(async (ctx) => {
    if (ctx.chat.type !== 'private') {
        const game = games[ctx.chat.id];
        if (game && game.phase === 'register' && await isAdminOrOwner(ctx)) {
            clearTimeout(game.timer);
            return startGame(ctx, ctx.chat.id);
        }
        return;
    }

    const payload = ctx.startPayload;
    if (payload && payload.startsWith('join_')) {
        const gameId = parseInt(payload.replace('join_', ''));
        const game = games[gameId];
        const userId = ctx.from.id;
        const firstName = ctx.from.first_name;

        if (!game) return ctx.reply("❌ *Expired.*", { parse_mode: 'Markdown' });
        if (game.phase !== 'register') return ctx.reply("⚠️ *Game started.*", { parse_mode: 'Markdown' });
        if (game.players[userId]) return ctx.reply("✅ *Already Joined.*", { parse_mode: 'Markdown' });

        updateUserData(userId, firstName, 0);

        game.players[userId] = {
            id: userId,
            name: firstName, 
            hp: START_HP,
            alive: true,
            shield: false,
            action: null,
            actionLog: null,
            targetId: null,
            pendingDmg: 0
        };

        ctx.reply(`✅ *Joined!* HP: ${START_HP}`, { parse_mode: 'Markdown' });

        try {
            const playerNames = Object.values(game.players).map(p => `• ${mention(p)}`).join("\n");
            const botUser = ctx.botInfo.username;
            const joinLink = `https://t.me/${botUser}?start=join_${gameId}`;
            await bot.telegram.editMessageText(
                gameId, game.messageId, null, 
                `🌨 *SNOWSTORM: CHAOS MODE*\n\n👥 *Survivors (${Object.keys(game.players).length}):*\n${playerNames}`, 
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.url('🔥 Join (PM)', joinLink)]) }
            );
        } catch (e) {}
    }
});

/* ==================================================================
   GAME ENGINE
   ================================================================== */

async function startGame(ctx, chatId) {
    const game = games[chatId];
    if (Object.keys(game.players).length < 2) {
        delete games[chatId];
        return bot.telegram.sendMessage(chatId, "❌ *Not enough players.*", { parse_mode: 'Markdown' });
    }
    game.phase = 'active';
    await bot.telegram.sendMessage(chatId, `🌪 *STORM STARTED!*\n\n🎅 **Santa Incoming...**\n⚠️ **High Damage Mode**\n\nSurvivors, check DMs.`, { parse_mode: 'Markdown' });
    setTimeout(() => startRound(chatId), 2000);
}

async function startRound(gameId) {
    const game = games[gameId];
    if (!game) return;

    let alive = Object.values(game.players).filter(p => p.alive);
    
    // WIN CHECK
    if (alive.length <= 1) {
        const winner = alive[0];
        delete games[gameId];
        let msg = `☠️ *GAME OVER*`;
        if (winner) {
            msg = `🏆 *WINNER!*\n\n👑 ${mention(winner)} survived!\n💎 **+100 Points**`;
            updateUserData(winner.id, winner.name, 100, true, false);
        }
        return bot.telegram.sendMessage(gameId, msg, { parse_mode: 'Markdown' });
    }

    game.round++;
    if (game.round > 1) game.stormIntensity += 10; 

    // Reset Data
    alive.forEach(p => { 
        p.action = null; 
        p.actionLog = null; 
        p.targetId = null; 
        p.pendingDmg = 0;
    });

    let roundTitle = `❄️ *ROUND ${game.round}* ❄️`;
    if (game.round === 1) roundTitle = `🎅 *ROUND 1: SANTA ARRIVES* 🎅`;

    let warning = "";
    if (game.round === game.nextPurgeRound) warning = "\n\n💀 *THE REAPER IS COMING...*";

    await bot.telegram.sendMessage(gameId, `${roundTitle}\nTemp: -${game.stormIntensity}°C${warning}\n\nCheck DMs!`, { parse_mode: 'Markdown' });

    for (const p of alive) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔥 Build Fire', `act_fire_${gameId}`)],
            [Markup.button.callback('🎒 Scavenge', `act_loot_${gameId}`)],
            [Markup.button.callback('☃️ Attack Player', `menu_attack_${gameId}`)]
        ]);
        
        let status = `❤️ HP: ${p.hp}`;
        if (p.shield) status += ` | 🛡️ Protected`;

        await safeDM(p.id, `${roundTitle}\n${status}\nStorm: -${game.stormIntensity}\n\nAct now!`, keyboard);
    }

    game.timer = setTimeout(() => resolveRound(gameId), ROUND_TIME);
}

/* ==================================================================
   ACTION HANDLERS (PM)
   ================================================================== */

// NOTIFY GROUP WITH CLICKABLE MENTION
const notifyGroup = (gameId, p) => {
    bot.telegram.sendMessage(gameId, `⚡ ${mention(p)} is ready!`, { parse_mode: 'Markdown' }).catch(()=>{});
};

bot.action(/^act_(fire|loot)_(-?\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const gameId = parseInt(ctx.match[2]);
    const game = games[gameId];
    if (!game) return ctx.editMessageText("❌ Ended");
    const p = game.players[ctx.from.id];
    if (!p || !p.alive || p.action) return ctx.answerCbQuery("⚠️ Error");

    p.action = action;
    const waitText = action === 'fire' ? "🔥 Building fire..." : "🎒 Searching...";
    await ctx.editMessageText(`⏳ *Action Confirmed:*\n${waitText}`, { parse_mode: 'Markdown' });
    await sleep(2000);

    let resultMsg = "";
    if (action === 'fire') {
        const heal = random(10, 20);
        p.hp += heal;
        p.actionLog = `🔥 ${mention(p)} built a fire (+${heal})`;
        resultMsg = `🔥 **Fire Built!**\n❤️ +${heal} HP\n\nCurrent HP: ${p.hp}`;
    } else {
        if (Math.random() > 0.4) {
            const heal = random(25, 45);
            p.hp += heal;
            p.actionLog = `🎒 ${mention(p)} found supplies! (+${heal})`;
            resultMsg = `🎒 **Supplies Found!**\n💚 +${heal} HP\n\nCurrent HP: ${p.hp}`;
        } else {
            const dmg = random(15, 25);
            p.hp -= dmg;
            p.actionLog = `🐺 ${mention(p)} bit by wolf! (-${dmg})`;
            resultMsg = `🐺 **Wolf Attack!**\n💔 -${dmg} HP\n\nCurrent HP: ${p.hp}`;
        }
    }
    await ctx.editMessageText(`✅ *Action Complete:*\n${resultMsg}`, { parse_mode: 'Markdown' });
    notifyGroup(gameId, p);
});

bot.action(/^menu_attack_(-?\d+)$/, async (ctx) => {
    const gameId = parseInt(ctx.match[1]);
    const game = games[gameId];
    if (!game) return;
    const p = game.players[ctx.from.id];
    if (p.action) return ctx.answerCbQuery("⚠️ Error");

    const enemies = Object.values(game.players).filter(pl => pl.alive && pl.id !== ctx.from.id);
    const buttons = enemies.map(t => [Markup.button.callback(`☃️ ${t.name}`, `atk_${gameId}_${t.id}`)]);
    buttons.push([Markup.button.callback('🔙 Back', `back_${gameId}`)]);

    await ctx.editMessageText("🎯 *Select Target:*", { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/^atk_(-?\d+)_(\d+)$/, async (ctx) => {
    const gameId = parseInt(ctx.match[1]);
    const targetId = parseInt(ctx.match[2]);
    const game = games[gameId];
    const p = game.players[ctx.from.id];
    if (!game || !p || p.action) return ctx.answerCbQuery("⚠️ Error");
    
    const target = game.players[targetId];
    const dmg = random(15, 25);
    p.action = 'attack';
    p.pendingDmg = dmg;
    p.targetId = targetId;
    p.actionLog = target ? `☃️ ${mention(p)} hit ${mention(target)}! (-${dmg})` : `☃️ ${mention(p)} missed!`;

    await ctx.editMessageText(`⏳ *Packing Snowball...*`, { parse_mode: 'Markdown' });
    await sleep(2000);
    await ctx.editMessageText(`✅ *Attack Launched!* \nTarget: ${target ? target.name : 'Unknown'}\n💔 Potential Dmg: ${dmg}`, { parse_mode: 'Markdown' });
    notifyGroup(gameId, p);
});

bot.action(/^back_(-?\d+)$/, async (ctx) => {
    const gameId = parseInt(ctx.match[1]);
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔥 Build Fire', `act_fire_${gameId}`)],
        [Markup.button.callback('🎒 Scavenge', `act_loot_${gameId}`)],
        [Markup.button.callback('☃️ Attack Player', `menu_attack_${gameId}`)]
    ]);
    await ctx.editMessageText("Choose Action:", keyboard);
});

/* ==================================================================
   RESOLUTION LOGIC
   ================================================================== */

async function resolveRound(gameId) {
    const game = games[gameId];
    if (!game) return;

    let report = `📢 *ROUND ${game.round} RESULTS*\n\n`;
    let alive = Object.values(game.players).filter(p => p.alive);
    const deaths = [];

    // 1. ROUND 1: SANTA
    if (game.round === 1) {
        report += `🎅 *SANTA VISITED!* Gifts distributed.\n\n`;
        alive.forEach(p => {
            if (Math.random() > 0.5) {
                p.shield = true;
                report += `🛡️ ${mention(p)} got a **Holy Shield**!\n`;
                safeDM(p.id, "🎅 Santa gave you a **Holy Shield**!");
            } else {
                const heal = 25;
                p.hp += heal;
                report += `🍷 ${mention(p)} drank **Warm Wine**! (+${heal})\n`;
                safeDM(p.id, `🎅 Santa gave you **Warm Wine**! (+${heal} HP)`);
            }
        });
        report += "\n";
    }

    // 2. PvP
    alive.forEach(atk => {
        if (atk.pendingDmg > 0 && atk.targetId) {
            const vic = game.players[atk.targetId];
            if (vic?.alive) {
                vic.hp -= atk.pendingDmg;
                if (vic.hp <= 0) updateUserData(atk.id, atk.name, 20, false, true);
            }
        }
    });

    // 3. Storm & Actions
    report += `🌨 *Storm:* -${game.stormIntensity} HP\n\n`;
    alive.forEach(p => {
        p.hp -= game.stormIntensity;
        if (p.actionLog) report += `${p.actionLog}\n`;
        else { p.hp -= 20; report += `💤 ${mention(p)} froze! (-20)\n`; }
    });

    // 4. RANDOM EVENTS (75% Chance)
    if (game.round > 1) {
        if (Math.random() < 0.75) {
            const eventRoll = Math.random();
            
            // NIGHT (Wolf/Demon)
            if (eventRoll < 0.4) {
                report += `\n🌑 *NIGHT HAS FALLEN...*\n`;
                const mobRoll = Math.random();
                
                if (mobRoll < 0.6) { // WOLF
                    const numVictims = Math.min(alive.length, random(1, 3));
                    const victims = alive.sort(() => 0.5 - Math.random()).slice(0, numVictims);
                    victims.forEach(v => {
                        if (v.shield) {
                            v.shield = false;
                            report += `🛡️ ${mention(v)} blocked Wolves!\n`;
                        } else {
                            const dmg = random(25, 45);
                            v.hp -= dmg;
                            report += `🐺 **Wolves** mauled ${mention(v)}! (-${dmg})\n`;
                        }
                    });
                } else { // DEMON
                    const numVictims = Math.min(alive.length, random(1, 2));
                    const victims = alive.sort(() => 0.5 - Math.random()).slice(0, numVictims);
                    victims.forEach(v => {
                        const dmg = 99;
                        v.hp -= dmg;
                        report += `👹 *DEMON!* ${mention(v)} struck! (-${dmg}) (No Block)\n`;
                    });
                }
            }
            // DAY (Bear/Wind)
            else {
                if (Math.random() < 0.5) { // BEAR
                     const numVictims = Math.min(alive.length, random(1, 2));
                     const victims = alive.sort(() => 0.5 - Math.random()).slice(0, numVictims);
                     victims.forEach(v => {
                        if (v.shield) {
                            v.shield = false;
                            report += `\n🛡️ ${mention(v)} blocked a Bear!\n`;
                        } else {
                            const dmg = random(40, 60);
                            v.hp -= dmg;
                            report += `\n🐻 *BEAR!* ${mention(v)} crushed! (-${dmg})\n`;
                        }
                     });
                } else { // BLIZZARD
                    const windDmg = 25;
                    alive.forEach(p => p.hp -= windDmg);
                    report += `\n🌬 *BLIZZARD!* Everyone took -25 HP!\n`;
                }
            }
        }
    }

    // 5. CHECK DEATHS & PREVENT WIPEOUT
    const newlyDead = [];
    alive.forEach(p => {
        if (p.hp <= 0) {
            p.alive = false;
            newlyDead.push(p);
        }
    });

    const survivors = Object.values(game.players).filter(p => p.alive);
    if (survivors.length === 0 && newlyDead.length > 0) {
        newlyDead.sort((a, b) => b.hp - a.hp);
        const luckyOne = newlyDead[0];
        luckyOne.alive = true;
        luckyOne.hp = 1; 

        // Remove from death list
        const index = newlyDead.indexOf(luckyOne);
        if (index > -1) newlyDead.splice(index, 1);
        report += `\n✨ *MIRACLE!* ${mention(luckyOne)} refused to die! (1 HP)\n`;
    }

    newlyDead.forEach(p => deaths.push(mention(p)));

    // 6. REAPER (Purge)
    const currentSurvivors = Object.values(game.players).filter(p => p.alive);
    if (game.round === game.nextPurgeRound && currentSurvivors.length > 1) {
        currentSurvivors.sort((a, b) => a.hp - b.hp);
        const lowestHP = currentSurvivors[0].hp;
        const weaklings = currentSurvivors.filter(p => p.hp === lowestHP);
        const victim = weaklings[Math.floor(Math.random() * weaklings.length)];

        victim.alive = false;
        victim.hp = 0;
        report += `\n💀 *THE REAPER:* ${mention(victim)} was weakest and died!\n`;
        deaths.push(`${mention(victim)} (Reaper)`);
        
        game.nextPurgeRound += random(2, 3);
    }

    if (deaths.length > 0) report += `\n💀 *DIED:* ${deaths.join(', ')}`;

    // 7. STATUS
    const finalSurvivors = Object.values(game.players).filter(p => p.alive).sort((a,b) => b.hp - a.hp);
    if (finalSurvivors.length > 0) {
        report += `\n\n❤️ *Status:* ` + finalSurvivors.map(p => {
            let s = `${mention(p)}(${p.hp})`;
            if (p.shield) s += `🛡️`;
            return s;
        }).join(', ');
    }

    await bot.telegram.sendMessage(gameId, report, { parse_mode: 'Markdown' });
    setTimeout(() => startRound(gameId), 4000);
}

bot.launch().then(() => console.log("🤖 Snowstorm Bot Running..."));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
