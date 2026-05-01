// Windward Line | Full Analytics Engine
const STANDINGS_URL = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason';
const today = new Date().toISOString().split('T')[0];
const endOfSeason = '2026-10-04'; 
const SCHEDULE_URL = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${today}&endDate=${endOfSeason}&gameType=R`;

const divisionNames = {
    200: "AL WEST", 201: "AL EAST", 202: "AL CENTRAL",
    203: "NL WEST", 204: "NL EAST", 205: "NL CENTRAL"
};

let liveBaselineData = [];
let fullScheduleData = [];
let simulatedGameOutcomes = {}; 

// Timer trackers
let activeLiveGameInterval = null;
let activeCountdownInterval = null;

async function initializeApp() {
    console.log("Initiating Core Systems...");
    try {
        const [standingsRes, scheduleRes] = await Promise.all([
            fetch(STANDINGS_URL),
            fetch(SCHEDULE_URL)
        ]);

        const standingsData = await standingsRes.json();
        const scheduleData = await scheduleRes.json();

        if (standingsData.records) {
            const divisions = standingsData.records.filter(record => divisionNames[record.division.id]);
            liveBaselineData = JSON.parse(JSON.stringify(divisions));
            populateDropdowns(liveBaselineData);
            renderAllDivisions(liveBaselineData);
        }

        if (scheduleData.dates) {
            fullScheduleData = scheduleData.dates;
            initLiveTracker(); 
        }
    } catch (error) {
        console.error("System Error:", error);
    }
}

// --- LIVE TRACKER & COUNTDOWN ENGINE ---

function initLiveTracker() {
    const todayGames = fullScheduleData[0]?.games || [];
    const selectEl = document.getElementById('live-game-select');
    const container = document.getElementById('live-feed-container');

    const liveGames = todayGames.filter(g => g.status.abstractGameState === 'Live');
    const upcomingGames = todayGames.filter(g => g.status.abstractGameState === 'Preview');

    if (liveGames.length > 0) {
        clearInterval(activeCountdownInterval);
        document.getElementById('global-status').innerHTML = '<span class="pulse" style="background-color: #f59e0b;"></span> STREAMING LIVE DATA';
        
        selectEl.style.display = 'block';
        selectEl.innerHTML = '';
        liveGames.forEach(g => {
            const option = document.createElement('option');
            option.value = g.gamePk;
            option.text = `${g.teams.away.team.name} @ ${g.teams.home.team.name}`;
            selectEl.appendChild(option);
        });

        startPolling(liveGames[0].gamePk);

    } else if (upcomingGames.length > 0) {
        selectEl.style.display = 'none';
        document.getElementById('global-status').innerHTML = '<span style="color: var(--text-muted);">AWAITING FIRST PITCH</span>';
        const nextGame = upcomingGames[0]; 
        startCountdown(nextGame);
    } else {
        selectEl.style.display = 'none';
        container.innerHTML = '<div class="loading">No games remaining today.</div>';
    }
}

function switchLiveGame() {
    const selectedGamePk = document.getElementById('live-game-select').value;
    startPolling(selectedGamePk);
}

function startPolling(gamePk) {
    if (activeLiveGameInterval) clearInterval(activeLiveGameInterval);
    
    fetchLivePitchData(gamePk);
    activeLiveGameInterval = setInterval(() => {
        fetchLivePitchData(gamePk);
    }, 5000);
}

function startCountdown(game) {
    const container = document.getElementById('live-feed-container');
    const startTime = new Date(game.gameDate).getTime();
    const matchup = `${game.teams.away.team.name} @ ${game.teams.home.team.name}`;

    if (activeCountdownInterval) clearInterval(activeCountdownInterval);

    activeCountdownInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = startTime - now;

        if (distance < 0) {
            clearInterval(activeCountdownInterval);
            initLiveTracker(); 
            return;
        }

        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);

        container.innerHTML = `
            <div class="countdown-display">
                <div style="color: var(--text-muted); font-size: 0.85rem;">NEXT SCHEDULED MATCHUP</div>
                <div style="font-weight: 700; margin-top: 5px;">${matchup}</div>
                <div class="clock">${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}</div>
            </div>
        `;
    }, 1000);
}

async function fetchLivePitchData(gamePk) {
    const LIVE_FEED_URL = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
    const METRICS_URL = `https://statsapi.mlb.com/api/v1/game/${gamePk}/contextMetrics`; 
    
    try {
        const [feedRes, metricsRes] = await Promise.all([
            fetch(LIVE_FEED_URL),
            fetch(METRICS_URL).catch(() => null) 
        ]);

        const data = await feedRes.json();
        const metricsData = metricsRes ? await metricsRes.json() : null;

        const currentPlay = data.liveData.plays.currentPlay;
        const linescore = data.liveData.linescore;
        
        if (!currentPlay) return;

        const container = document.getElementById('live-feed-container');
        
        const awayTeam = data.gameData.teams.away.abbreviation;
        const homeTeam = data.gameData.teams.home.abbreviation;
        const awayScore = linescore.teams.away.runs || 0;
        const homeScore = linescore.teams.home.runs || 0;
        const inningState = `${linescore.inningHalf} ${linescore.currentInning}`;
        
        const batter = currentPlay.matchup.batter.fullName;
        const pitcher = currentPlay.matchup.pitcher.fullName;
        const balls = currentPlay.count.balls;
        const strikes = currentPlay.count.strikes;
        const outs = currentPlay.count.outs;
        
        const events = currentPlay.playEvents;
        let pitchData = "Awaiting Pitch...";
        if (events && events.length > 0) {
            const lastPitch = events[events.length - 1].pitchData;
            if (lastPitch && lastPitch.startSpeed) {
                pitchData = `${lastPitch.startSpeed}mph ${events[events.length - 1].details.type.description}`;
            }
        }
        
        const result = currentPlay.result.description || "At Bat in Progress...";

        let homeProb = 50;
        let awayProb = 50;
        if (metricsData && metricsData.game) {
            homeProb = (metricsData.game.homeWinProbability || 50);
            awayProb = (metricsData.game.awayWinProbability || 50);
        }

        container.innerHTML = `
            <div class="live-matchup-header">
                <span class="live-score">${awayTeam} ${awayScore} - ${homeScore} ${homeTeam}</span>
                <span class="live-inning">${inningState} | ${outs} Outs</span>
            </div>
            <div class="live-pitch-data">
                <div class="data-box">
                    <span class="data-label">MATCHUP</span>
                    <span class="data-value" style="font-size: 0.9rem;">${pitcher} vs ${batter}</span>
                </div>
                <div class="data-box">
                    <span class="data-label">COUNT</span>
                    <span class="data-value">${balls} - ${strikes}</span>
                </div>
                <div class="data-box">
                    <span class="data-label">LAST PITCH</span>
                    <span class="data-value">${pitchData}</span>
                </div>
            </div>
            <div class="play-result">> ${result}</div>
            
            <div class="win-prob-wrapper">
                <div class="win-prob-labels">
                    <span>${awayTeam} Win Prob: ${awayProb.toFixed(1)}%</span>
                    <span>${homeTeam} Win Prob: ${homeProb.toFixed(1)}%</span>
                </div>
                <div class="win-prob-bar-container">
                    <div class="prob-away" style="width: ${awayProb}%"></div>
                    <div class="prob-home" style="width: ${homeProb}%"></div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Live Feed Error:", error);
    }
}

// --- SCHEDULE UI & SIMULATION ENGINE ---

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

function loadTeamSchedule() {
    const teamId = document.getElementById('sim-team').value;
    const ticker = document.getElementById('schedule-ticker');
    if (!teamId) { ticker.innerHTML = ''; return; }
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
                if (gamesFound >= 10) return; 
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

initializeApp();