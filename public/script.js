document.addEventListener('DOMContentLoaded', () => {
    fetchLeaderboard();
    // Refresh every 30 seconds
    setInterval(fetchLeaderboard, 30000);
});

async function fetchLeaderboard() {
    const tableBody = document.getElementById('leaderboard-body');

    try {
        const response = await fetch('/api/leaderboard');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = '<div class="loading">No survivors yet. Start a game!</div>';
            return;
        }

        data.forEach((player, index) => {
            const rank = index + 1;
            const delay = Math.min(index * 0.05, 1); // Staggered animation

            const row = document.createElement('div');
            row.className = `player-row rank-${rank}`;
            row.style.animationDelay = `${delay}s`;

            row.innerHTML = `
                <div class="col rank">${rank}</div>
                <div class="col player">${escapeHTML(player.name)}</div>
                <div class="col stats points">${formatNumber(player.points)}</div>
                <div class="col stats wins">${formatNumber(player.wins)}</div>
                <div class="col stats kills">${formatNumber(player.kills)}</div>
            `;

            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        tableBody.innerHTML = '<div class="loading">❌ Failed to load leaderboard data. Retrying soon...</div>';
    }
}

// Utility to escape HTML and prevent XSS
function escapeHTML(str) {
    if (!str) return 'Unknown';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

// Format numbers nicely (e.g., 1000 -> 1,000)
function formatNumber(num) {
    if (num === null || num === undefined) return 0;
    return num.toLocaleString();
}
