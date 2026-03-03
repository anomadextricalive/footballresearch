const form = document.querySelector("#search-form");
const input = document.querySelector("#team-input");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const breakdownEl = document.querySelector("#breakdown");
const historyEl = document.querySelector("#history");
const button = form.querySelector("button");
const suggestBox = document.querySelector("#club-suggest-box");
const playerSeasonSelect = document.querySelector("#player-season-select");
const playerStatusEl = document.querySelector("#player-status");
const playerResultsEl = document.querySelector("#player-results");
const healthFab = document.querySelector("#health-fab");
const healthPop = document.querySelector("#health-pop");
const healthPopClose = document.querySelector("#health-pop-close");
const healthPopSeason = document.querySelector("#health-pop-season");
const healthPopScore = document.querySelector("#health-pop-score");
const healthPopFactors = document.querySelector("#health-pop-factors");
const batchForm = document.querySelector("#batch-form");
const batchInput = document.querySelector("#batch-input");
const batchStatusEl = document.querySelector("#batch-status");
const batchResultsEl = document.querySelector("#batch-results");
const batchButton = document.querySelector("#batch-button");
const toggleMetricTileButton = document.querySelector("#toggle-metric-tile");
const metricTileBody = document.querySelector("#metric-tile-body");
let suggestTimer = null;
let suggestions = [];
let activeSuggestionIndex = -1;
let activeTeamRecords = [];
let activeSquadHealth = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function hideSections() {
  summaryEl.classList.add("hidden");
  breakdownEl.classList.add("hidden");
  historyEl.classList.add("hidden");
}

function setBatchStatus(message) {
  batchStatusEl.textContent = message;
}

function setPlayerStatus(message) {
  playerStatusEl.textContent = message;
}

function resetHealthWidget() {
  activeSquadHealth = null;
  healthFab.textContent = "--%";
  healthPop.classList.add("hidden");
  healthPopSeason.textContent = "";
  healthPopScore.textContent = "";
  healthPopFactors.innerHTML = "";
}

function renderHealthWidget(record, squadHealth) {
  if (!record || !squadHealth) {
    resetHealthWidget();
    return;
  }

  activeSquadHealth = { record, squadHealth };
  healthFab.textContent = `${Math.round(squadHealth.score)}%`;
  healthPopSeason.textContent = `${record.season} — ${record.league}`;
  healthPopScore.textContent = `health: ${squadHealth.score}/100 (${squadHealth.label})`;
  healthPopFactors.innerHTML = `
    <li>scorer dependency: ${squadHealth.factors.scorerDependency}%</li>
    <li>assist dependency: ${squadHealth.factors.assistDependency}%</li>
    <li>depth contributors: ${squadHealth.factors.depthContributors}</li>
    <li>avg appearances: ${squadHealth.factors.avgAppearances}</li>
  `;
}

function hideSuggestions() {
  suggestions = [];
  activeSuggestionIndex = -1;
  suggestBox.classList.add("hidden");
  suggestBox.innerHTML = "";
}

function selectSuggestion(name) {
  input.value = name;
  hideSuggestions();
}

function renderSuggestions(items) {
  suggestions = items;
  activeSuggestionIndex = -1;

  if (!items.length) {
    hideSuggestions();
    return;
  }

  const rows = items
    .map(
      (item, index) => `
      <button
        class="suggest-item flex w-full items-start justify-between gap-3 border-2 border-black bg-white px-3 py-2 text-left text-sm shadow-[4px_4px_0_0_#000]"
        data-index="${index}"
        type="button"
      >
        <strong class="font-bold">${item.name}</strong>
        <small class="text-xs">${item.league}</small>
      </button>
    `
    )
    .join("");

  suggestBox.innerHTML = rows;
  suggestBox.classList.remove("hidden");
}

function highlightSuggestion() {
  const buttons = suggestBox.querySelectorAll(".suggest-item");
  buttons.forEach((btn, idx) => {
    if (idx === activeSuggestionIndex) {
      btn.classList.add("bg-[#FFFF88]");
    } else {
      btn.classList.remove("bg-[#FFFF88]");
    }
  });
}

function renderSummary(data) {
  summaryEl.innerHTML = `
    <h2 class="text-xl font-bold">${data.records[0].team}</h2>
    <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div class="border-2 border-black bg-white p-3">
        <small class="block text-xs">Matrix Score</small>
        <strong class="text-lg">${data.matrix.total}/10</strong>
      </div>
      <div class="border-2 border-black bg-white p-3">
        <small class="block text-xs">Seasons Found</small>
        <strong class="text-lg">${data.seasonsFound}</strong>
      </div>
      <div class="border-2 border-black bg-white p-3">
        <small class="block text-xs">Latest League</small>
        <strong class="text-lg">${data.records[0].league}</strong>
      </div>
    </div>
  `;
  summaryEl.classList.remove("hidden");
}

function renderBreakdown(data) {
  const b = data.matrix.breakdown;
  breakdownEl.innerHTML = `
    <h3 class="text-lg font-bold">Score Breakdown</h3>
    <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="border-2 border-black bg-white p-3"><small class="block text-xs">Consistency</small><strong class="text-lg">${b.consistency}</strong></div>
      <div class="border-2 border-black bg-white p-3"><small class="block text-xs">Longevity</small><strong class="text-lg">${b.longevity}</strong></div>
      <div class="border-2 border-black bg-white p-3"><small class="block text-xs">Peak</small><strong class="text-lg">${b.peak}</strong></div>
      <div class="border-2 border-black bg-white p-3"><small class="block text-xs">Recent Form</small><strong class="text-lg">${b.recent}</strong></div>
    </div>
  `;
  breakdownEl.classList.remove("hidden");
}

function renderTable(data) {
  const rows = data.records
    .map(
      (r) => `
      <tr>
        <td class="border-2 border-black px-2 py-2">${r.season}</td>
        <td class="border-2 border-black px-2 py-2">${r.league}</td>
        <td class="border-2 border-black px-2 py-2">${r.position}/${r.teamsInLeague}</td>
        <td class="border-2 border-black px-2 py-2">${r.points}</td>
        <td class="border-2 border-black px-2 py-2">${r.wins}-${r.draws}-${r.losses}</td>
        <td class="border-2 border-black px-2 py-2">${r.gf}:${r.ga}</td>
      </tr>
    `
    )
    .join("");

  historyEl.innerHTML = `
    <h3 class="text-lg font-bold">League History</h3>
    <div class="mt-3 overflow-x-auto border-2 border-black">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Season</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">League</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Finish</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Pts</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">W-D-L</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">GF:GA</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  historyEl.classList.remove("hidden");
}

function resetPlayerPanel() {
  activeTeamRecords = [];
  playerSeasonSelect.innerHTML = "<option>Search a club first</option>";
  playerSeasonSelect.disabled = true;
  playerResultsEl.innerHTML = "";
  playerResultsEl.classList.add("hidden");
  setPlayerStatus("");
  resetHealthWidget();
}

function renderPlayerTables(data) {
  if (!data.available) {
    playerResultsEl.innerHTML = `<p class="text-sm">${data.message || "No player data available."}</p>`;
    playerResultsEl.classList.remove("hidden");
    return;
  }

  const blocks = (data.tables || [])
    .map((table) => {
      const headers = ["RK", "Player", "Market Value", ...(table.headers || []).slice(2).map((h) => h.title)];
      const rows = (table.rows || [])
        .slice(0, 10)
        .map((row) => {
          const metricCells = row.metrics
            .map((m) => `<td class="border-2 border-black px-2 py-1">${m.value}</td>`)
            .join("");
          const marketValue = row.marketValue || "-";
          const previous = row.marketValuePrevious || null;
          const trend = row.marketTrend || "unknown";
          const trendClass =
            trend === "up" ? "text-green-700 font-bold" : trend === "down" ? "text-red-700 font-bold" : "";
          const trendLabel =
            trend === "up" ? "▲" : trend === "down" ? "▼" : trend === "flat" ? "•" : "";
          const trendText = previous ? ` <span class="text-xs">(${trendLabel} prev: ${previous})</span>` : "";
          return `<tr><td class="border-2 border-black px-2 py-1">${row.rank}</td><td class="border-2 border-black px-2 py-1">${row.playerName}</td><td class="border-2 border-black px-2 py-1 ${trendClass}">${marketValue}${trendText}</td>${metricCells}</tr>`;
        })
        .join("");

      return `
        <div class="mt-3 border-2 border-black p-2">
          <h4 class="text-sm font-bold">${table.title}</h4>
          <div class="mt-2 overflow-x-auto border-2 border-black">
            <table class="w-full border-collapse text-sm">
              <thead><tr>${headers.map((h) => `<th class="border-2 border-black bg-[#FFFF88] px-2 py-1 text-left">${h}</th>`).join("")}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join("");

  playerResultsEl.innerHTML = blocks || "<p class='text-sm'>No player tables available for this season.</p>";
  playerResultsEl.classList.remove("hidden");
}

async function fetchPlayerPerformanceForSelectedSeason() {
  const idx = Number(playerSeasonSelect.value);
  const record = activeTeamRecords[idx];
  if (!record) return;

  setPlayerStatus("loading player performance...");
  playerResultsEl.classList.add("hidden");

  try {
    const res = await fetch(
      `/api/team-player-performance?teamId=${encodeURIComponent(record.teamId)}&leagueSlug=${encodeURIComponent(record.leagueSlug)}&seasonYear=${encodeURIComponent(record.seasonYear)}`
    );
    const data = await res.json();
    if (!res.ok) {
      setPlayerStatus(data.error || "could not load player stats for this season.");
      return;
    }
    renderPlayerTables(data);
    renderHealthWidget(record, data.squadHealth);
    setPlayerStatus("player stats loaded.");
  } catch {
    setPlayerStatus("could not reach player performance service.");
  }
}

function wirePlayerSeasonOptions(records) {
  activeTeamRecords = records.filter((r) => r.teamId && r.leagueSlug && r.seasonYear);
  if (!activeTeamRecords.length) {
    resetPlayerPanel();
    setPlayerStatus("no player-season links found for this club.");
    return;
  }

  playerSeasonSelect.innerHTML = activeTeamRecords
    .map((r, idx) => `<option value="${idx}">${r.season} — ${r.league}</option>`)
    .join("");
  playerSeasonSelect.disabled = false;
  fetchPlayerPerformanceForSelectedSeason();
}

function renderBatchTable(data) {
  const rows = data.teams
    .map((team) => {
      if (!team.found) {
        return `
          <tr>
            <td class="border-2 border-black px-2 py-2">${team.inputTeam}</td>
            <td class="border-2 border-black px-2 py-2">Not found</td>
            <td class="border-2 border-black px-2 py-2">-</td>
            <td class="border-2 border-black px-2 py-2">-</td>
            <td class="border-2 border-black px-2 py-2">-</td>
            <td class="border-2 border-black px-2 py-2">-</td>
          </tr>
        `;
      }

      const leagues = team.associatedLeagues.join(", ");
      const uclCount = Number(team.championsLeagueParticipation?.seasonsCount || 0);
      const ucl = `${uclCount} seasons`;

      return `
        <tr>
          <td class="border-2 border-black px-2 py-2">${team.resolvedTeam}</td>
          <td class="border-2 border-black px-2 py-2">${team.currentLeague}</td>
          <td class="border-2 border-black px-2 py-2">${leagues}</td>
          <td class="border-2 border-black px-2 py-2">${ucl}</td>
          <td class="border-2 border-black px-2 py-2">${team.secondTierConsecutive.current}</td>
          <td class="border-2 border-black px-2 py-2">${team.secondTierConsecutive.max}</td>
        </tr>
      `;
    })
    .join("");

  batchResultsEl.innerHTML = `
    <p class="text-sm">B-League means Tier 2 domestic league (for example, EFL Championship in England).</p>
    <div class="mt-2 overflow-x-auto border-2 border-black">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Club</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Current League (Explicit)</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Associated Leagues (Explicit)</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Champions League</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Current B-League Streak</th>
            <th class="border-2 border-black bg-[#FFFF88] px-2 py-2 text-left">Max B-League Streak</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  batchResultsEl.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const team = input.value.trim();

  if (!team) {
    setStatus("enter a team name first.");
    hideSections();
    resetPlayerPanel();
    return;
  }

  button.disabled = true;
  hideSuggestions();
  hideSections();
  setStatus("pulling history and calculating matrix score...");

  try {
    const res = await fetch(`/api/team-history?team=${encodeURIComponent(team)}`);
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "could not find that team right now.");
      return;
    }

    renderSummary(data);
    renderBreakdown(data);
    renderTable(data);
    wirePlayerSeasonOptions(data.records || []);
    setStatus(`done. showing ${data.seasonsFound} seasons for ${data.records[0].team}.`);
  } catch {
    setStatus("could not reach the history service. try again in a few seconds.");
    resetPlayerPanel();
  } finally {
    button.disabled = false;
  }
});

input.addEventListener("input", () => {
  const q = input.value.trim();

  if (suggestTimer) clearTimeout(suggestTimer);
  if (q.length < 2) {
    hideSuggestions();
    return;
  }

  suggestTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/club-suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        hideSuggestions();
        return;
      }
      renderSuggestions(data.suggestions || []);
    } catch {
      hideSuggestions();
    }
  }, 180);
});

input.addEventListener("keydown", (event) => {
  if (!suggestions.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestions.length - 1);
    highlightSuggestion();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    highlightSuggestion();
    return;
  }

  if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    selectSuggestion(suggestions[activeSuggestionIndex].name);
  }
});

suggestBox.addEventListener("click", (event) => {
  const row = event.target.closest(".suggest-item");
  if (!row) return;
  const idx = Number(row.getAttribute("data-index"));
  if (Number.isNaN(idx) || !suggestions[idx]) return;
  selectSuggestion(suggestions[idx].name);
});

input.addEventListener("blur", () => {
  setTimeout(() => {
    hideSuggestions();
  }, 140);
});

playerSeasonSelect.addEventListener("change", () => {
  fetchPlayerPerformanceForSelectedSeason();
});

healthFab.addEventListener("click", () => {
  if (!activeSquadHealth) return;
  healthPop.classList.toggle("hidden");
});

healthPopClose.addEventListener("click", () => {
  healthPop.classList.add("hidden");
});

resetPlayerPanel();

toggleMetricTileButton.addEventListener("click", () => {
  const isExpanded = toggleMetricTileButton.getAttribute("aria-expanded") === "true";
  if (isExpanded) {
    metricTileBody.classList.add("hidden");
    toggleMetricTileButton.setAttribute("aria-expanded", "false");
    toggleMetricTileButton.textContent = "EXPAND";
    return;
  }

  metricTileBody.classList.remove("hidden");
  toggleMetricTileButton.setAttribute("aria-expanded", "true");
  toggleMetricTileButton.textContent = "COLLAPSE";
});

batchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const raw = batchInput.value.trim();

  if (!raw) {
    setBatchStatus("paste at least one club name first.");
    batchResultsEl.classList.add("hidden");
    return;
  }

  batchButton.disabled = true;
  batchResultsEl.classList.add("hidden");
  setBatchStatus("analyzing clubs...");

  try {
    const res = await fetch(`/api/club-insights-batch?teams=${encodeURIComponent(raw)}`);
    const data = await res.json();

    if (!res.ok) {
      setBatchStatus(data.error || "could not analyze those clubs right now.");
      return;
    }

    renderBatchTable(data);
    setBatchStatus(`done. analyzed ${data.teams.length} clubs.`);
  } catch {
    setBatchStatus("could not reach the analyzer. try again in a few seconds.");
  } finally {
    batchButton.disabled = false;
  }
});
