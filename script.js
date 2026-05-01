// Windward Line | Core Data Engine
const API_URL = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103&season=2026&standingsTypes=regularSeason';

async function fetchStandings() {
    console.log("Initiating API request to MLB Stats...");
    
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        // Isolate the AL East (Division ID: 201)
        const records = data.records;
        const alEast = records.find(record => record.division.id === 201);
        
        if (alEast) {
            console.log("AL East data secured. Rendering table...");
            renderTable(alEast.teamRecords);
        } else {
            throw new Error("Could not locate AL East data in the payload.");
        }
        
    } catch (error) {
        console.error("Data Engine Error:", error);
        document.getElementById('standings-body').innerHTML = `
            <tr>
                <td colspan="6" class="loading" style="color: #ef4444;">Connection failed. Check console.</td>
            </tr>
        `;
    }
}

function renderTable(teams) {
    const tbody = document.getElementById('standings-body');
    tbody.innerHTML = ''; 

    // Sort teams by rank
    teams.sort((a, b) => a.divisionRank - b.divisionRank);

    // Baseline metrics for Magic Number math
    const leaderWins = teams[0].wins;
    const secondPlaceLosses = teams[1] ? teams[1].losses : 0;

    teams.forEach((team) => {
        const name = team.team.name;
        const w = team.wins;
        const l = team.losses;
        const pct = team.winningPercentage;
        const gb = team.gamesBack;
        
        // The Magic Number Logic
        let magicNumber = '-';
        if (team.divisionRank === "1") {
            magicNumber = 163 - (leaderWins + secondPlaceLosses);
        } else if (team.magicNumber) {
            magicNumber = team.magicNumber; 
        }

        const row = `
            <tr>
                <td>${name}</td>
                <td>${w}</td>
                <td>${l}</td>
                <td>${pct}</td>
                <td>${gb}</td>
                <td style="color: var(--accent-green); font-weight: 700;">${magicNumber}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// Fire the engine
fetchStandings();