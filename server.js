const express = require('express');
const path = require('path');
const { userData } = require('./data');

function startServer() {
    const app = express();
    const PORT = process.env.PORT || 8000;

    // Serve static files (HTML, CSS, JS) from the "public" directory
    app.use(express.static(path.join(__dirname, 'public')));

    // API Endpoint for leaderboard data
    app.get('/api/leaderboard', (req, res) => {
        // Convert userData object into an array and sort by points descending
        const players = Object.keys(userData).map(id => ({
            id,
            name: userData[id].name.replace(/\\/g, ''), // Un-escape markdown for UI
            points: userData[id].points,
            wins: userData[id].wins,
            kills: userData[id].kills
        }));

        players.sort((a, b) => b.points - a.points);

        // Return top 100 players
        res.json(players.slice(0, 100));
    });

    app.listen(PORT, () => {
        console.log(`🌐 Web Leaderboard running at http://localhost:${PORT}`);
    });
}

module.exports = startServer;
