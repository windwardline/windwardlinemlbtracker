// Windward Line | Full MLB Data Engine
const API_URL = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason';

// Division ID mapping for MLB
const divisionNames = {
    200: "AL WEST",
    201: "AL EAST",
    202: "AL CENTRAL",
    203: "NL WEST",
    204: "NL EAST",
    205: "NL CENTRAL"
};

let liveBaselineData = [];

async function fetchStandings() {
    console.log("Initiating API request for full MLB Stats...");
    
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        if (data.records) {
            console.log("Full MLB data secured.");
            // Filter to only include the 6 standard divisions
            const divisions = data.records.filter(record => divisionNames[record.division.id]);
            
            // Deep copy original data to preserve the baseline
            liveBaselineData = JSON.parse(JSON.stringify(divisions));
            
            populateDropdowns(liveBaselineData);
            renderAllDivisions(liveBaselineData);
        } else {
            throw new Error("Invalid payload received from MLB API.");
        }
    } catch (error) {
        console.error("Data Engine Error:", error);
        document.getElementById('standings-grid').innerHTML = `
            <div style="color: #ef4444; width: 100%; text-align: center;">Connection failed. Check console.</div>
        `;
    }
}

function populateDropdowns(divisions) {
    const winnerSelect = document.getElementById('sim-winner');
    const loserSelect = document.getElementById('sim-loser');
    
    let allTeams = [];
    divisions.forEach(div => {
        allTeams.push(...div.teamRecords);
    });

    // Sort all 30 teams alphabetically for the dropdowns
    allTeams.sort((a, b) => a.team.name.localeCompare(b.team.name));

    allTeams.forEach(team => {
        const optionHTML = `<option value="${team.team.id}">${team.team.name}</option>`;
        winnerSelect.innerHTML += optionHTML;
        loserSelect.innerHTML += optionHTML;
    });
}

function renderAllDivisions(divisions, isSimulated = false) {
    const grid = document.getElementById('standings-grid');
    grid.innerHTML = ''; // Clear grid

    // 1. Force the layout order: AL (East, Central, West) then NL (East, Central, West)
    const layoutOrder = [201, 202, 200, 204, 205, 203];
    divisions.sort((a, b) => layoutOrder.indexOf(a.division.id) - layoutOrder.indexOf(b.division.id));

    divisions.forEach(division => {
        const divId = division.division.id;
        const divName = divisionNames[divId];
        let teams = division.teamRecords;

        // 2. Determine league for color coding (AL IDs are 200, 201, 202)
        const leagueClass = (divId === 200 || divId === 201 || divId === 202) ? 'al-league' : 'nl-league';

        // Sort teams by win percentage within their division
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
            if (index === 0) {
                magicNumber = 163 - (leaderWins + secondPlaceLosses);
            } else if (team.magicNumber && !isSimulated) {
                magicNumber = team.magicNumber; 
            } else if (isSimulated) {
                magicNumber = 'SIM';
            }

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

        // 3. Inject the leagueClass into the HTML panel
        const panelHTML = `
            <section class="panel ${leagueClass}">
                <h2>${divName}</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>TEAM</th>
                                <th>W</th>
                                <th>L</th>
                                <th>PCT</th>
                                <th>MAGIC #</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
        
        grid.innerHTML += panelHTML;
    });
}

// --- SIMULATION ENGINE ---

function runSimulation() {
    const winnerId = document.getElementById('sim-winner').value;
    const loserId = document.getElementById('sim-loser').value;

    if (!winnerId || !loserId || winnerId === loserId) {
        alert("Please select two different teams to simulate a matchup.");
        return;
    }

    let simulatedData = JSON.parse(JSON.stringify(liveBaselineData));

    // Loop through all divisions and teams to find the selected matchups
    simulatedData.forEach(division => {
        division.teamRecords.forEach(team => {
            if (team.team.id.toString() === winnerId) {
                team.wins += 1;
                team.winningPercentage = team.wins / (team.wins + team.losses);
            }
            if (team.team.id.toString() === loserId) {
                team.losses += 1;
                team.winningPercentage = team.wins / (team.wins + team.losses);
            }
        });
    });

    renderAllDivisions(simulatedData, true);
}

function resetSimulation() {
    document.getElementById('sim-winner').value = "";
    document.getElementById('sim-loser').value = "";
    renderAllDivisions(liveBaselineData, false);
}

// Fire the engine on load
fetchStandings();