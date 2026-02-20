const { Markup } = require('telegraf');
const { settings, saveSettings } = require('./data');
const { isAdminOrOwner } = require('./utils');
const { locales } = require('./i18n');

module.exports = (bot) => {

    // 🌍 List of supported languages
    const languages = [
        { code: 'en', label: '🇺🇸 English' },
        { code: 'si', label: '🇱🇰 Sinhala' },
        { code: 'es', label: '🇪🇸 Español' },
        { code: 'fr', label: '🇫🇷 Français' },
        { code: 'de', label: '🇩🇪 Deutsch' },
        { code: 'pt', label: '🇵🇹 Português' },
        { code: 'hi', label: '🇮🇳 हिंदी' },
        { code: 'it', label: '🇮🇹 Italiano' }
    ];

    // Helper to generate buttons with Tick Mark
    function getButtons(currentLang, threadIdString) {
        return languages.map(lang => {
            // If this is the selected language, add a Check Mark
            const text = lang.code === currentLang ? `✅ ${lang.label}` : lang.label;
            return [Markup.button.callback(text, `set_lang_${lang.code}_${threadIdString}`)];
        });
    }

    // 🎮 COMMAND: /lang
    bot.command('lang', async (ctx) => {
        if (ctx.chat.type === 'private') return ctx.reply("Use in group.");
        if (!(await isAdminOrOwner(ctx))) return ctx.reply("👮 Admins only.");

        const threadId = ctx.message.message_thread_id;
        const threadIdString = threadId || 'gen'; // 'gen' = General Topic
        const chatId = ctx.chat.id;

        // 1. Get Current Language Setting
        const key = threadId ? `${chatId}_${threadId}` : `${chatId}`;
        const currentLang = settings[key] || 'en';

        const topicName = ctx.message.is_topic_message ? "Topic" : "Group";
        
        // 2. Generate Buttons with Tick
        const buttons = getButtons(currentLang, threadIdString);

        ctx.reply(`🌍 **Select Language for this ${topicName}:**`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    });

    // ⚡ ACTION: Set Language
    bot.action(/^set_lang_(.+)_(.+)$/, async (ctx) => {
        if (!(await isAdminOrOwner(ctx))) return ctx.answerCbQuery("Admins only!");

        const newLangCode = ctx.match[1];
        const threadIdString = ctx.match[2];
        const chatId = ctx.chat.id;

        let threadId = null;
        if (threadIdString !== 'gen') threadId = parseInt(threadIdString);

        // 1. Save New Setting
        const key = threadId ? `${chatId}_${threadId}` : `${chatId}`;
        
        // Optimization: If clicking the same language, just answer query
        if (settings[key] === newLangCode) {
            return ctx.answerCbQuery("✅ Already active!");
        }

        settings[key] = newLangCode;
        saveSettings();

        // 2. Get Success Text (Safety check if locale file missing)
        let successText = "✅ Language updated!";
        if (locales[newLangCode] && locales[newLangCode]['lang_set']) {
            successText = locales[newLangCode]['lang_set'];
        }

        // 3. Re-generate Buttons (Move the Tick Mark)
        const buttons = getButtons(newLangCode, threadIdString);

        // 4. Edit the Message (Don't delete/resend)
        try {
            await ctx.editMessageText(successText, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });
        } catch (e) {
            // Ignore "message is not modified" errors if clicked too fast
        }

        ctx.answerCbQuery(successText);
    });
};