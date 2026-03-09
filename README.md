# 🌨️ Snowstorm Telegram Bot 

Welcome to **Snowstorm**, a highly interactive, multiplayer survival game bot for Telegram!

You and your friends are stuck in a deadly blizzard. Only the last survivor wins! Scavenge for loot, build fires to stay warm, buy powerful skills from the shop, and betray your friends to survive the freezing storms.

## ✨ Features
- **Multiplayer survival:** Play with your friends in Telegram groups.
- **Dynamic weather & events:** The storm gets colder every round. Watch out for wolves, bears, and blizzards!
- **Skill Shop:** Buy powerful items, weapons, and heals with your points before the game starts. Use them to outsmart your opponents.
- **Persistent Data Storage:** Automatic syncing to a MongoDB database to seamlessly preserve player points, stats, and inventories across rounds.
- **Web Leaderboard:** A beautiful, dark-themed responsive website to track the top survivors! 
- **Internationalization (i18n):** Supports multiple languages across different chat groups and topics!

## 🚀 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/en/) installed.
- A MongoDB cluster (e.g., [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)).
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather).

### 1. Clone the repository
```bash
git clone https://github.com/AlexaInc/SNOWSTORM.git
cd SNOWSTORM
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and configure it:
```env
BOT_TOKEN=your_telegram_bot_token_here
OWNER_ID=your_telegram_user_id
MONGO_URL=your_mongodb_connection_string
PORT=8000
```
> **Note:** If `MONGO_URL` is omitted, the bot will fall back to using local JSON files (`snowstorm_data.json`).

### 4. Run the Bot
```bash
npm start
```

## 🎮 How to Play

### Joining a Game
1. Add the bot to your Telegram Group.
2. The Group Admin types `/game` to open the game lobby.
3. Players click the **Join** button (ensure you have started a private message with the bot first).
4. The Admin clicks **Force Start** when everyone is ready.

### Surviving the Rounds
Every round, the bot will send you a Direct Message with your choices:
- 🔥 **Build Fire:** Safely restore a small amount of health.
- 🎒 **Scavenge:** High risk, high reward. Find big heals, or get ambushed by wolves!
- ⚔️ **Basic Attack:** Throw a snowball to damage another player.
- ⚡ **Skills:** Use your pre-purchased items (like a Shield or Medkit) to gain an advantage.

The storm will damage everyone at the end of the round. The last player standing wins points!

### The Shop
Use `/shop` in a private message with the bot to spend your hard-earned points on powerful weapons, heals, or buffs to equip for your next game! Use `/equip` to manage your loadout.

## 🏆 Leaderboard
When you start the bot, an Express web server also boots up.
Open `http://localhost:8000` (or your hosted URL) in your browser to view the amazing animated Web Leaderboard of top survivors!

---

*Can you survive the storm?*
