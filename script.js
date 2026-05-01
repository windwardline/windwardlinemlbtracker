// Windward Line | Dual-API MLB Engine
const STANDINGS_URL = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason';

// Dynamically get today's date to fetch the remaining schedule
const today = new Date().toISOString().split('T')[0];
const endOfSeason = '2026-10-04'; 
const SCHEDULE_URL = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${today}&endDate=${endOfSeason}&gameType=R`;

const divisionNames = {
    200: "AL WEST", 201: "AL EAST", 202: "AL CENTRAL",
    203: "NL WEST", 204: "NL EAST", 205: "NL CENTRAL"
};

let liveBaselineData = [];
let fullScheduleData = [];
// Track every hypothetical outcome the user selects
let simulatedGameOutcomes = {}; 

async function initializeApp() {
    console.log("Initiating Dual-API request...");
    
    try {
        const [standingsRes, scheduleRes] = await Promise.all([
            fetch(STANDINGS_URL),
            fetch(SCHEDULE_URL)
        ]);

        const standingsData = await standingsRes.json();
        const scheduleData = await scheduleRes.json();

        // 1. Process Standings
        if (standingsData.records) {
            const divisions = standingsData.records.filter(record => divisionNames[record.division.id]);
            liveBaselineData = JSON.parse(JSON.stringify(divisions));
            populateDropdowns(liveBaselineData);
            renderAllDivisions(liveBaselineData);
        }

        // 2. Process Schedule
        if (scheduleData.dates) {
            fullScheduleData = scheduleData.dates;
            console.log("Schedule secured. System Ready.");
        }

    } catch (error) {
        console.error("Data Engine Error:", error);
    }
}

function populateDropdowns(divisions) {
    const teamSelect = document.getElementById('sim-team');
    teamSelect.innerHTML = '<option value="">-- Select Team --</option>'; 
    
    let allTeams = [];
    divisions.forEach(div => allTeams.push(...div.teamRecords));
    allTeams.sort((a, b) => a.team.name.localeCompare(b.team.name));

    allTeams.forEach(team => {
        teamSelect.innerHTML += `<option value="${team.team.id}">${team.team.name}</option>`;
    });
}

// --- SCHEDULE UI LOGIC ---

function loadTeamSchedule() {
    const teamId = document.getElementById('sim-team').value;
    const ticker = document.getElementById('schedule-ticker');
    
    if (!teamId) {
        ticker.innerHTML = '';
        return;
    }

    ticker.innerHTML = ''; 
    let gamesFound = 0;

    for (let i = 0; i < fullScheduleData.length; i++) {
        const dateObj = fullScheduleData[i];
        const games = dateObj.games;

        for (let j = 0; j < games.length; j++) {
            const game = games[j];
            const awayTeam = game.teams.away.team;
            const homeTeam = game.teams.home.team;

            if (awayTeam.id.toString() === teamId || homeTeam.id.toString() === teamId) {
                const isHome = homeTeam.id.toString() === teamId;
                const opponent = isHome ? awayTeam : homeTeam;
                
                renderGameCard(game.gamePk, dateObj.date, opponent.name, teamId, opponent.id, isHome);
                gamesFound++;
                if (gamesFound >= 10) return; // Limit to next 10 games
            }
        }
    }
}

function renderGameCard(gamePk, date, opponentName, targetTeamId, opponentTeamId, isHome) {
    const ticker = document.getElementById('schedule-ticker');
    const vsText = isHome ? `vs ${opponentName}` : `@ ${opponentName}`;
    
    const currentWinner = simulatedGameOutcomes[gamePk];
    const wClass = currentWinner === targetTeamId ? 'active-w' : '';
    const lClass = currentWinner === opponentTeamId.toString() ? 'active-l' : '';

    const cardHTML = `
        <div class="game-card">
            <span class="game-date">${date}</span>
            <span class="game-matchup">${vsText}</span>
            <div class="game-toggles">
                <button class="toggle-btn ${wClass}" onclick="toggleGameOutcome(${gamePk}, '${targetTeamId}', '${opponentTeamId}')">W</button>
                <button class="toggle-btn ${lClass}" onclick="toggleGameOutcome(${gamePk}, '${opponentTeamId}', '${targetTeamId}')">L</button>
            </div>
        </div>
    `;
    ticker.innerHTML += cardHTML;
}

// --- SIMULATION MATH ENGINE ---

function toggleGameOutcome(gamePk, winnerId, loserId) {
    simulatedGameOutcomes[gamePk] = winnerId.toString();
    loadTeamSchedule();
    recalculateStandings();
}

function recalculateStandings() {
    let simulatedData = JSON.parse(JSON.stringify(liveBaselineData));

    Object.keys(simulatedGameOutcomes).forEach(gamePk => {
        const winnerId = simulatedGameOutcomes[gamePk];
        let loserId = null;

        simulatedData.forEach(div => {
            div.teamRecords.forEach(team => {
                if (team.team.id.toString() === winnerId) team.wins += 1;
                else {
                    fullScheduleData.forEach(d => {
                        d.games.forEach(g => {
                            if (g.gamePk.toString() === gamePk) {
                                if (g.teams.away.team.id.toString() === winnerId) loserId = g.teams.home.team.id.toString();
                                if (g.teams.home.team.id.toString() === winnerId) loserId = g.teams.away.team.id.toString();
                            }
                        });
                    });
                }
            });
        });

        simulatedData.forEach(div => {
            div.teamRecords.forEach(team => {
                if (team.team.id.toString() === loserId) team.losses += 1;
            });
        });
    });

    simulatedData.forEach(div => {
        div.teamRecords.forEach(team => {
            team.winningPercentage = team.wins / (team.wins + team.losses);
        });
    });

    renderAllDivisions(simulatedData, Object.keys(simulatedGameOutcomes).length > 0);
}

function resetAllSimulations() {
    simulatedGameOutcomes = {};
    document.getElementById('sim-team').value = "";
    document.getElementById('schedule-ticker').innerHTML = '';
    renderAllDivisions(liveBaselineData, false);
}

// --- RENDER LOGIC ---

function renderAllDivisions(divisions, isSimulated = false) {
    const grid = document.getElementById('standings-grid');
    grid.innerHTML = ''; 

    const layoutOrder = [201, 202, 200, 204, 205, 203];
    divisions.sort((a, b) => layoutOrder.indexOf(a.division.id) - layoutOrder.indexOf(b.division.id));

    divisions.forEach(division => {
        const divId = division.division.id;
        const divName = divisionNames[divId];
        let teams = division.teamRecords;
        const leagueClass = (divId === 200 || divId === 201 || divId === 202) ? 'al-league' : 'nl-league';

        teams.sort((a, b) => b.winningPercentage - a.winningPercentage);

        const leaderWins = teams[0].wins;
        const secondPlaceLosses = teams[1] ? teams[1].losses : 0;

        let tableRows = '';

        teams.forEach((team, index) => {
            const name = team.team.name;
            const w = team.wins;
            const l = team.losses;
            const pct = parseFloat(team.winningPercentage).toFixed(3).replace(/^0+/, '');
            
            let magicNumber = '-';
            if (index === 0) magicNumber = 163 - (leaderWins + secondPlaceLosses);
            else if (team.magicNumber && !isSimulated) magicNumber = team.magicNumber; 
            else if (isSimulated) magicNumber = 'SIM';

            const rowClass = isSimulated ? 'simulated-data' : '';

            tableRows += `
                <tr class="${rowClass}">
                    <td>${name}</td>
                    <td>${w}</td>
                    <td>${l}</td>
                    <td>${pct}</td>
                    <td style="color: var(--accent-green); font-weight: 700;">${magicNumber}</td>
                </tr>
            `;
        });

        grid.innerHTML += `
            <section class="panel ${leagueClass}">
                <h2>${divName}</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>TEAM</th><th>W</th><th>L</th><th>PCT</th><th>MAGIC #</th></tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </section>
        `;
    });
}

// Fire the dual engine on load
initializeApp();