const { Markup } = require('telegraf');
const C = require('./config');
const { userData, SKILLS, getUser, saveData, escapeMarkdown } = require('./data');
const { sleep, random, mention, safeDM, isAdminOrOwner } = require('./utils');
const { getLang, t } = require('./i18n');

const games = {};

module.exports = (bot) => {

    // Helper: Topic-Safe Notification
    async function notify(chatId, text, threadId = null) {
        const options = { parse_mode: 'Markdown', disable_notification: true };
        if (threadId) options.message_thread_id = threadId;
        try { await bot.telegram.sendMessage(chatId, text, options); } catch (e) {}
    }

    // Helper: Generate Unique Game Key
    function getGameKey(chatId, threadId) {
        return threadId ? `${chatId}_${threadId}` : `${chatId}`;
    }

    // ==================================================================
    // 🎮 COMMANDS
    // ==================================================================

    bot.command(['game', 'game@YourBotName'], (ctx) => {
        if (ctx.chat.type === 'private') return;
        const chatId = ctx.chat.id;
        const threadId = ctx.message.message_thread_id || null;
        
        // 🔑 UNIQUE KEY (Allows multiple games in one group)
        const gameKey = getGameKey(chatId, threadId);
        
        const lang = getLang(chatId, threadId);

        if (games[gameKey]) return ctx.reply(t('game_active', lang), {parse_mode:'Markdown'});

        games[gameKey] = {
            key: gameKey, // Store the unique key
            id: chatId,
            threadId: threadId,
            lang: lang,
            title: escapeMarkdown(ctx.chat.title),
            phase: 'register',
            round: 0,
            stormIntensity: 10,
            players: {},
            startTime: Date.now(),
            endTime: Date.now() + C.REGISTRATION_TIME,
            nextPurgeRound: 5,
            mainTimer: null,
            reminderInterval: null,
            messageId: null
        };

        const joinLink = `https://t.me/${bot.botInfo.username}?start=join_${gameKey}`;
        const buttons = [
            [Markup.button.url(t('join_btn', lang), joinLink)],
            [Markup.button.callback(t('start_btn', lang), `force_start_${gameKey}`)]
        ];

        ctx.reply(t('game_intro', lang), { 
            parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) 
        }).then(m => { 
            if (games[gameKey]) games[gameKey].messageId = m.message_id; 
        });

        games[gameKey].mainTimer = setTimeout(() => startGame(bot, gameKey), C.REGISTRATION_TIME);
        games[gameKey].reminderInterval = setInterval(() => sendReminder(gameKey), C.REMINDER_INTERVAL);
    });

    bot.action(/^force_start_(.+)$/, async (ctx) => {
        if (await isAdminOrOwner(ctx)) {
            const gameKey = ctx.match[1];
            const game = games[gameKey];
            if (game && game.phase === 'register') {
                startGame(bot, gameKey);
                ctx.answerCbQuery("Starting...");
            }
        } else {
            ctx.answerCbQuery("Admins only!");
        }
    });

    bot.command('extend', (ctx) => {
        if (ctx.chat.type === 'private') return;
        const gameKey = getGameKey(ctx.chat.id, ctx.message.message_thread_id);
        const game = games[gameKey];
        
        if (game && game.phase === 'register') {
            clearTimeout(game.mainTimer); 
            game.endTime += C.EXTEND_TIME;
            const timeLeft = Math.ceil((game.endTime - Date.now()) / 1000);
            const lang = game.lang;
            
            ctx.reply(t('extended', lang, {time: timeLeft}), { parse_mode: 'Markdown' });
            game.mainTimer = setTimeout(() => startGame(bot, gameKey), timeLeft * 1000);
        }
    });

    bot.command(['stop', 'cancel'], async (ctx) => {
        if (await isAdminOrOwner(ctx)) {
            const gameKey = getGameKey(ctx.chat.id, ctx.message.message_thread_id);
            if (games[gameKey]) {
                const g = games[gameKey];
                clearTimeout(g.mainTimer);
                clearInterval(g.reminderInterval);
                if (g.timer) clearTimeout(g.timer);
                const lang = g.lang || 'en';
                delete games[gameKey];
                ctx.reply(t('cancelled', lang), { parse_mode: 'Markdown' });
            }
        }
    });

    // ==================================================================
    // 🔗 JOIN LOGIC
    // ==================================================================

    bot.start((ctx) => {
        if (ctx.chat.type !== 'private') return;
        
        const payload = ctx.startPayload;
        if (!payload || !payload.startsWith('join_')) return;

        // 🔑 Parse the Unique Key
        const gameKey = payload.replace('join_', '');
        const game = games[gameKey];
        
        if (!game || game.phase !== 'register') return ctx.reply("❌ Closed.");
        if (game.players[ctx.from.id]) return ctx.reply("✅ Already joined.");

        const u = getUser(ctx.from.id, ctx.from.first_name);
        const lang = game.lang;

        const skillsToBring = [];
        u.equipped_skills.forEach(skillKey => {
            if (u.inventory[skillKey] > 0) skillsToBring.push(skillKey);
        });

        game.players[ctx.from.id] = {
            id: ctx.from.id, name: u.name, hp: C.START_HP, 
            alive: true, skills: skillsToBring, cooldowns: {}, consumed: [],
            action: null, val: 0
        };

        updateLobby(gameKey);

        let msg = t('joined', lang, { title: game.title, hp: C.START_HP });
        if (skillsToBring.length === 0 && u.equipped_skills.length > 0) {
            msg += `\n` + t('inventory_empty', lang);
        }

        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // ==================================================================
    // ⚙️ GAME ENGINE
    // ==================================================================

    async function startGame(bot, gameKey) {
        const game = games[gameKey];
        if (!game) return;
        
        clearTimeout(game.mainTimer);
        clearInterval(game.reminderInterval);
        if(game.reminderMsgId) try{bot.telegram.deleteMessage(game.id, game.reminderMsgId)}catch(e){}

        if (Object.keys(game.players).length < 2) {
            const chatId = game.id;
            const threadId = game.threadId;
            delete games[gameKey]; // Delete by Key
            return notify(chatId, t('not_enough', game.lang), threadId);
        }
        
        game.phase = 'active';
        
        const opts = { 
            parse_mode: 'Markdown', 
            message_thread_id: game.threadId,
            ...Markup.inlineKeyboard([Markup.button.url(t('check_dm_btn', game.lang), `https://t.me/${bot.botInfo.username}`)]) 
        };
        if(!game.threadId) delete opts.message_thread_id;
        
        await bot.telegram.sendMessage(game.id, t('storm_started', game.lang), opts);
        
        setTimeout(() => startRound(bot, gameKey), 2000);
    }

    async function startRound(bot, gameKey) {
        const game = games[gameKey];
        if (!game) return;

        let alive = Object.values(game.players).filter(p => p.alive);
        const lang = game.lang;
        
        if (alive.length <= 1) {
            const winner = alive[0];
            const chatId = game.id;
            const threadId = game.threadId;
            
            delete games[gameKey];
            
            let msg = t('game_over', lang);
            if (winner) {
                const u = getUser(winner.id); u.points += 200; u.wins++; saveData();
                msg = t('winner', lang, { name: mention(winner) });
            }
            return notify(chatId, msg, threadId);
        }

        game.round++;
        game.stormIntensity += 10; 
        alive.forEach(p => { p.action = null; p.pendingDmg = 0; p.val = 0; });

        let roundText = t('round_title', lang, { round: game.round, temp: game.stormIntensity });
        if (game.round === 2) roundText += t('santa_visit', lang);

        const opts = { 
            parse_mode: 'Markdown',
            message_thread_id: game.threadId, 
            ...Markup.inlineKeyboard([Markup.button.url(t('play_turn_btn', lang), `https://t.me/${bot.botInfo.username}`)]) 
        };
        if(!game.threadId) delete opts.message_thread_id;

        await bot.telegram.sendMessage(game.id, roundText, opts);

        const dmPromises = alive.map(p => sendPlayerMenu(gameKey, p, game.stormIntensity, lang));
        await Promise.all(dmPromises);

        game.timer = setTimeout(() => resolveRound(bot, gameKey), C.ROUND_TIME);
    }

    async function sendPlayerMenu(gameKey, p, stormDmg, lang) {
        // Pass gameKey (composite) instead of simple ID
        const buttons = [
            [Markup.button.callback(t('btn_fire', lang), `act_fire_${gameKey}`)],
            [Markup.button.callback(t('btn_loot', lang), `act_loot_${gameKey}`)],
            [Markup.button.callback(t('btn_attack', lang), `menu_attack_${gameKey}`)]
        ];
        if (p.skills.length > 0) buttons.push([Markup.button.callback(t('btn_skills', lang), `menu_skills_${gameKey}`)]);
        
        const txt = t('round_title', lang, { round: "", temp: stormDmg })
            .replace("❄️ *ROUND *", "❄️")
            .replace("❄️ *වටය *", "❄️")
            .trim() + `\n${t('hp_tag', lang)} ${p.hp}`;

        await safeDM(bot, p.id, txt, Markup.inlineKeyboard(buttons));
    }

    function tryConsumeItem(player, itemKey) {
        if (player.consumed.includes(itemKey)) return true;
        const user = getUser(player.id);
        if (user.inventory[itemKey] && user.inventory[itemKey] > 0) {
            user.inventory[itemKey]--;
            if (user.inventory[itemKey] === 0) delete user.inventory[itemKey];
            saveData();
            player.consumed.push(itemKey);
            return true;
        }
        return false;
    }

    // ==================================================================
    // 🔥 ACTIONS (UPDATED REGEX for Composite Keys)
    // ==================================================================

    // Regex updated to (.+) to accept underscores in keys (e.g. -100123_5)
    bot.action(/^act_(fire|loot)_(.+)$/, async (ctx) => {
        const action = ctx.match[1];
        const gameKey = ctx.match[2]; // Composite Key
        const game = games[gameKey];
        
        if (!game) return ctx.editMessageText("❌ Ended");
        
        const p = game.players[ctx.from.id];
        if (!p || !p.alive || p.action) return ctx.answerCbQuery(t('action_locked', game.lang));
        const lang = game.lang;

        if (action === 'fire') {
            p.action = 'fire'; p.val = random(15, 25); 
            await ctx.editMessageText(t('act_wait', lang), {parse_mode:'Markdown'});
            await sleep(1500);
            await ctx.editMessageText(t('act_fire', lang, {val: p.val}), {parse_mode:'Markdown'});
        } else {
            await ctx.editMessageText(t('act_search', lang), {parse_mode:'Markdown'});
            await sleep(1500);
            if (Math.random() > 0.4) {
                p.action = 'loot'; p.val = random(25, 45);
                await ctx.editMessageText(t('act_loot', lang, {val: p.val}), {parse_mode:'Markdown'});
            } else {
                p.action = 'loot_fail'; p.val = random(15, 25);
                await ctx.editMessageText(t('act_ambush', lang, {val: p.val}), {parse_mode:'Markdown'});
            }
        }
        notify(game.id, t('ready_msg', lang, {name: mention(p)}), game.threadId);
    });

    bot.action(/^menu_attack_(.+)$/, (ctx) => {
        const gameKey = ctx.match[1];
        const game = games[gameKey];
        if(!game) return ctx.answerCbQuery("Ended");
        
        const p = game.players[ctx.from.id];
        if (!p || !p.alive) return ctx.answerCbQuery(t('dead_error', game.lang));
        if (p.action) return ctx.answerCbQuery(t('action_locked', game.lang));

        const enemies = Object.values(game.players).filter(pl => pl.alive && pl.id !== ctx.from.id);
        const btns = enemies.map(t => [Markup.button.callback(`☃️ ${t.name.replace(/\\/g,'')}`, `atk_${gameKey}_${t.id}`)]);
        btns.push([Markup.button.callback(t('btn_back', game.lang), `back_${gameKey}`)]);
        
        ctx.editMessageText(t('select_target', game.lang), {parse_mode:'Markdown', ...Markup.inlineKeyboard(btns)}).catch(()=>{});
    });

    bot.action(/^atk_(.+)_(.+)$/, async (ctx) => {
        const gameKey = ctx.match[1];
        const tId = parseInt(ctx.match[2]);
        const game = games[gameKey];
        
        if (!game) return ctx.answerCbQuery("Ended");
        const p = game.players[ctx.from.id];
        if (p.action) return ctx.answerCbQuery(t('action_locked', game.lang));

        const lang = game.lang;
        p.action = 'attack'; p.pendingDmg = random(15, 25); p.targetId = tId;
        const target = game.players[tId];
        const tName = target ? target.name : "Unknown";
        
        await ctx.editMessageText(t('attack_aim', lang), {parse_mode:'Markdown'});
        await sleep(1500);
        await ctx.editMessageText(t('attack_confirm', lang, { target: tName }), {parse_mode:'Markdown'});
        notify(game.id, t('ready_msg', lang, {name: mention(p)}), game.threadId);
    });

    bot.action(/^menu_skills_(.+)$/, (ctx) => {
        const gameKey = ctx.match[1];
        const game = games[gameKey];
        if(!game) return ctx.answerCbQuery("Ended");
        
        const p = game.players[ctx.from.id];
        const lang = game.lang;
        
        const btns = p.skills.map(k => {
            let txt = SKILLS[k].name;
            if(p.cooldowns[k] && p.cooldowns[k] > game.round) txt += " (⏳)";
            return [Markup.button.callback(txt, `use_skill_${gameKey}_${k}`)];
        });
        btns.push([Markup.button.callback(t('btn_back', lang), `back_${gameKey}`)]);
        ctx.editMessageText(t('btn_skills', lang), {parse_mode:'Markdown', ...Markup.inlineKeyboard(btns)});
    });

    bot.action(/^use_skill_(.+)_(.+)$/, async (ctx) => {
        const gameKey = ctx.match[1];
        const k = ctx.match[2];
        const game = games[gameKey];
        if(!game) return ctx.answerCbQuery("Ended");
        
        const p = game.players[ctx.from.id];
        const lang = game.lang;

        if (game.round === 1) return ctx.answerCbQuery(t('round_1_lock', lang));
        if (p.cooldowns[k] && p.cooldowns[k] > game.round) return ctx.answerCbQuery(t('cooldown_msg', lang, {rounds: p.cooldowns[k] - game.round}));
        if (!tryConsumeItem(p, k)) return ctx.answerCbQuery(t('skill_no_stock', lang));

        const skill = SKILLS[k];
        if (skill.type === 'atk') {
             const btns = Object.values(game.players).filter(pl=>pl.alive && pl.id!==p.id).map(t=>[Markup.button.callback(t.name, `skill_atk_${gameKey}_${k}_${t.id}`)]);
             return ctx.editMessageText(t('select_target', lang), {parse_mode:'Markdown', ...Markup.inlineKeyboard(btns)});
        }
        
        p.action='skill'; p.skillUsed=k; p.val=skill.val;
        p.cooldowns[k] = game.round + C.SKILL_COOLDOWN;
        await ctx.editMessageText(t('skill_used', lang, {skill: skill.name}), {parse_mode:'Markdown'});
        notify(game.id, t('ready_msg', lang, {name: mention(p)}), game.threadId);
    });

// 6. SKILL ATTACK (FIXED TYPO)
    bot.action(/^skill_atk_(.+)_(.+)_(.+)$/, async (ctx) => {
        const gameKey = ctx.match[1];
        const k = ctx.match[2];
        const tId = parseInt(ctx.match[3]);
        
        const game = games[gameKey];
        if(!game) return ctx.answerCbQuery("Ended");

        // 🛡️ FIX: Used 'game.players' instead of 'games[gameId].players'
        const p = game.players[ctx.from.id]; 
        
        if (!p) return ctx.answerCbQuery("Error");

        const skill = SKILLS[k];
        const lang = game.lang;
        
        p.action = 'skill_atk'; 
        p.skillUsed = k; 
        p.targetId = tId; 
        p.pendingDmg = skill.val;
        
        // Update Cooldowns
        if (!p.cooldowns) p.cooldowns = {}; // Safety check
        p.cooldowns[k] = game.round + C.SKILL_COOLDOWN;
        
        await ctx.editMessageText(t('skill_used', lang, {skill: skill.name}), {parse_mode:'Markdown'});
        notify(game.id, t('ready_msg', lang, {name: mention(p)}), game.threadId);
    });

    bot.action(/^back_(.+)$/, (ctx) => {
        const gameKey = ctx.match[1];
        const game = games[gameKey];
        if (!game) return ctx.editMessageText("❌ Ended");
        
        const p = game.players[ctx.from.id];
        const lang = game.lang;

        const buttons = [
            [Markup.button.callback(t('btn_fire', lang), `act_fire_${gameKey}`)],
            [Markup.button.callback(t('btn_loot', lang), `act_loot_${gameKey}`)],
            [Markup.button.callback(t('btn_attack', lang), `menu_attack_${gameKey}`)]
        ];
        if (p.skills.length > 0) buttons.push([Markup.button.callback(t('btn_skills', lang), `menu_skills_${gameKey}`)]);

        const txt = t('round_title', lang, { round: "", temp: game.stormIntensity })
            .replace("❄️ *ROUND *", "❄️")
            .replace("❄️ *වටය *", "❄️")
            .trim() + `\n${t('hp_tag', lang)} ${p.hp}`;

        ctx.editMessageText(txt, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(() => ctx.answerCbQuery());
    });

    // ==================================================================
    // 📝 HELPERS
    // ==================================================================

    async function updateLobby(gameKey) {
        const game = games[gameKey];
        if (!game || game.phase !== 'register') return;
        const playerNames = Object.values(game.players).map(p => `• ${mention(p)}`).join("\n");
        const count = Object.keys(game.players).length;
        const lang = game.lang;

        const text = t('game_intro', lang) + `\n\n👥 (${count}):\n${playerNames}`;
        const buttons = [[Markup.button.url(t('join_btn', lang), `https://t.me/${bot.botInfo.username}?start=join_${gameKey}`)],[Markup.button.callback(t('start_btn', lang), `force_start_${gameKey}`)]];
        
        try { if (game.messageId) await bot.telegram.editMessageText(game.id, game.messageId, null, text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }); } catch (e) {}
    }

    async function sendReminder(gameKey) {
        const game = games[gameKey];
        if (!game || game.phase !== 'register') return;
        if(game.reminderMsgId) try{await bot.telegram.deleteMessage(game.id, game.reminderMsgId)}catch(e){}
        
        const lang = game.lang;
        const timeLeft = Math.max(0, Math.ceil((game.endTime - Date.now()) / 1000));
        const count = Object.keys(game.players).length;
        const names = Object.values(game.players).map(p => `• ${mention(p)}`).join("\n");

        const msg_text = t('time_left', lang, {time: timeLeft, count: count, names: names || "_None_"});
        
        const opts = { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.url(t('join_btn', lang), `https://t.me/${bot.botInfo.username}?start=join_${gameKey}`)]) };
        if(game.threadId) opts.message_thread_id = game.threadId;

        const msg = await bot.telegram.sendMessage(game.id, msg_text, opts);
        game.reminderMsgId = msg.message_id;
    }

    // ==================================================================
    // 📝 RESOLUTION
    // ==================================================================

    async function resolveRound(bot, gameKey) {
        const game = games[gameKey];
        if (!game) return;

        const lang = game.lang;
        let report = t('round_title', lang, { round: game.round, temp: game.stormIntensity }) + "\n";
        const alive = Object.values(game.players).filter(p => p.alive);
        const deadInRound = [];

        // EVENTS
        if (game.round > 2 && Math.random() < 0.75) {
            if (Math.random() < 0.4) { 
                report += t('event_night', lang) + "\n";
                if (Math.random() < 0.6) { 
                    const v = alive[Math.floor(Math.random()*alive.length)];
                    const dmg = random(25, 45);
                    v.hp -= dmg;
                    report += t('event_wolves', lang, {name: mention(v), val: dmg}) + "\n";
                } else { 
                    const v = alive[Math.floor(Math.random()*alive.length)];
                    v.hp -= 99;
                    report += t('event_demon', lang, {name: mention(v)}) + "\n";
                }
            } else {
                report += t('event_day', lang) + "\n";
                if (Math.random() < 0.5) { 
                    const v = alive[Math.floor(Math.random()*alive.length)];
                    const dmg = random(40, 60);
                    v.hp -= dmg;
                    report += t('event_bear', lang, {name: mention(v), val: dmg}) + "\n";
                } else { 
                    alive.forEach(p => p.hp -= 25);
                    report += t('event_blizzard', lang) + "\n";
                }
            }
            report += "\n";
        }

        // SANTA (Round 2)
        if (game.round === 2) {
            report += t('santa_visit', lang) + "\n";
            alive.forEach(p => {
                if (Math.random() > 0.5) {
                    p.shield = true;
                    safeDM(bot, p.id, t('santa_shield_dm', lang)); 
                    report += t('santa_shield_log', lang, {name: mention(p)}) + "\n";
                } else {
                    p.hp += 25;
                    safeDM(bot, p.id, t('santa_wine_dm', lang));
                    report += t('santa_wine_log', lang, {name: mention(p)}) + "\n";
                }
            });
            report += "\n";
        }

        // Actions
        alive.forEach(p => {
            if(p.action === 'fire') { p.hp += p.val; report += t('log_fire', lang, {name: mention(p), val: p.val}) + "\n"; }
            else if(p.action === 'loot') { p.hp += p.val; report += t('log_loot', lang, {name: mention(p), val: p.val}) + "\n"; }
            else if(p.action === 'loot_fail') { p.hp -= p.val; report += t('log_ambush', lang, {name: mention(p), val: p.val}) + "\n"; }
            else if(p.action === 'attack') { 
                const tPlayer = game.players[p.targetId];
                if(tPlayer) report += t('log_attack', lang, {name: mention(p), target: mention(tPlayer), val: p.pendingDmg}) + "\n";
                else report += t('log_miss', lang, {name: mention(p)}) + "\n";
            }
            else if(p.action === 'skill_atk') {
                const tPlayer = game.players[p.targetId];
                const skill = SKILLS[p.skillUsed];
                if(tPlayer) report += t('log_skill_atk', lang, {name: mention(p), skill: skill.name, val: p.pendingDmg}) + "\n";
            }
            else if(p.action === 'skill') {
                const skill = SKILLS[p.skillUsed];
                if(skill.type === 'heal') { p.hp += p.val; report += t('log_heal', lang, {name: mention(p), val: p.val}) + "\n"; }
                if(skill.type === 'buff') report += t('log_bunker', lang, {name: mention(p)}) + "\n"; 
                if(skill.type === 'buff' && p.skillUsed === 'radar') { p.hp += p.val; report += t('log_radar', lang, {name: mention(p), val: p.val}) + "\n"; }
            }
            else { 
                p.hp -= 20; 
                report += t('log_freeze', lang, {name: mention(p)}) + "\n"; 
            }
        });

        // Apply Damage
        alive.forEach(atk => {
            if ((atk.action === 'attack' || atk.action === 'skill_atk') && atk.targetId) {
                const vic = game.players[atk.targetId];
                if (vic?.alive) { vic.hp -= atk.pendingDmg; if (vic.hp <= 0) { const u = getUser(atk.id); u.kills++; saveData(); } }
            }
        });

        // Storm & Death
        report += t('storm_damage', lang, {val: game.stormIntensity});
        alive.forEach(p => {
            if (!p.immune) p.hp -= game.stormIntensity; 
            else p.immune = false;

            if (p.hp <= 0) {
                p.alive = false;
                deadInRound.push(p);
            }
        });

        // Miracle
        const survivors = Object.values(game.players).filter(p => p.alive);
        if (survivors.length === 0 && deadInRound.length > 0) {
            deadInRound.sort((a, b) => b.hp - a.hp);
            const lucky = deadInRound[0];
            lucky.alive = true; lucky.hp = 1;
            report += t('miracle', lang, {name: mention(lucky)}) + "\n";
            survivors.push(lucky);
            deadInRound.splice(0, 1);
        }

        // Reaper
        if (game.round === game.nextPurgeRound && survivors.length > 1) {
            survivors.sort((a,b) => a.hp - b.hp);
            const victim = survivors[0];
            victim.alive = false; victim.hp = 0;
            deadInRound.push(victim);
            report += t('reaper', lang, {name: mention(victim)}) + "\n";
            game.nextPurgeRound += 5;
        }

        if (deadInRound.length > 0) {
            report += t('died', lang, { names: [...new Set(deadInRound.map(p => mention(p)))].join(', ') });
        }

        const final = Object.values(game.players).filter(p => p.alive).sort((a,b) => b.hp - a.hp);
        if (final.length > 0) report += t('status_header', lang) + final.map(p => `${mention(p)}(${p.hp})`).join(', ');

        notify(game.id, report, game.threadId);
        setTimeout(() => startRound(bot, gameKey), 4000);
    }
};