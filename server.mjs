import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4321);
const PUBLIC_DIR = join(process.cwd(), "public");

const LEAGUES = [
  { slug: "eng.1", name: "Premier League (England, Tier 1)", country: "ENG", tier: 1 },
  { slug: "eng.2", name: "EFL Championship (England, Tier 2)", country: "ENG", tier: 2 },
  { slug: "eng.3", name: "EFL League One (England, Tier 3)", country: "ENG", tier: 3 },
  { slug: "eng.4", name: "EFL League Two (England, Tier 4)", country: "ENG", tier: 4 },
  { slug: "esp.1", name: "LaLiga (Spain, Tier 1)", country: "ESP", tier: 1 },
  { slug: "esp.2", name: "LaLiga 2 (Spain, Tier 2)", country: "ESP", tier: 2 },
  { slug: "ger.1", name: "Bundesliga (Germany, Tier 1)", country: "GER", tier: 1 },
  { slug: "ger.2", name: "2. Bundesliga (Germany, Tier 2)", country: "GER", tier: 2 },
  { slug: "ita.1", name: "Serie A (Italy, Tier 1)", country: "ITA", tier: 1 },
  { slug: "ita.2", name: "Serie B (Italy, Tier 2)", country: "ITA", tier: 2 },
  { slug: "fra.1", name: "Ligue 1 (France, Tier 1)", country: "FRA", tier: 1 },
  { slug: "fra.2", name: "Ligue 2 (France, Tier 2)", country: "FRA", tier: 2 },
  { slug: "ned.1", name: "Eredivisie (Netherlands, Tier 1)", country: "NED", tier: 1 },
  { slug: "por.1", name: "Primeira Liga (Portugal, Tier 1)", country: "POR", tier: 1 },
  { slug: "sco.1", name: "Scottish Premiership (Scotland, Tier 1)", country: "SCO", tier: 1 },
  { slug: "tur.1", name: "Super Lig (Turkey, Tier 1)", country: "TUR", tier: 1 },
  { slug: "bel.1", name: "Belgian Pro League (Belgium, Tier 1)", country: "BEL", tier: 1 }
];

const UCL_SLUG = "uefa.champions";

const now = new Date();
const currentSeasonYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const MIN_SEASON_YEAR = 2001;
const SEASON_YEARS = [];
for (let y = currentSeasonYear; y >= MIN_SEASON_YEAR; y -= 1) {
  SEASON_YEARS.push(y);
}

const standingsCache = new Map();
const teamCache = new Map();
const uclCache = new Map();
const performanceCache = new Map();
let uclSeasonIndexPromise = null;
let clubDirectoryPromise = null;

function normalizeTeamName(name) {
  const base = name
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(fc|afc|cf|cfc|sfc|ac|sc|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const aliases = new Map([
    ["man city", "manchester city"],
    ["man utd", "manchester united"],
    ["spurs", "tottenham hotspur"],
    ["newcastle", "newcastle united"],
    ["wolverhampton wanderers", "wolves"],
    ["leicester city", "leicester"],
    ["bolton wanderers", "bolton"],
    ["preston fc", "preston north end"],
    ["millwall fc", "millwall"],
    ["southampton fc", "southampton"],
    ["brentford fc", "brentford"]
  ]);

  return aliases.get(base) || base;
}

function formatSeasonYear(year) {
  const next = (year + 1) % 100;
  return `${year}-${String(next).padStart(2, "0")}`;
}

function statValue(entry, type, fallback = 0) {
  const stats = entry?.stats || [];
  const hit = stats.find((s) => s?.type === type || s?.name === type);
  if (!hit) return fallback;
  const value = Number(hit.value);
  return Number.isNaN(value) ? fallback : value;
}

function parseLeagueName(apiLeagueName, fallback) {
  if (!apiLeagueName) return fallback;
  const name = apiLeagueName.trim();
  const map = new Map([
    ["English Premier League", "Premier League (England, Tier 1)"],
    ["English League Championship", "EFL Championship (England, Tier 2)"],
    ["English League One", "EFL League One (England, Tier 3)"],
    ["English League Two", "EFL League Two (England, Tier 4)"],
    ["Spanish LALIGA", "LaLiga (Spain, Tier 1)"],
    ["Spanish LALIGA 2", "LaLiga 2 (Spain, Tier 2)"],
    ["German Bundesliga", "Bundesliga (Germany, Tier 1)"],
    ["German 2. Bundesliga", "2. Bundesliga (Germany, Tier 2)"],
    ["Italian Serie A", "Serie A (Italy, Tier 1)"],
    ["Italian Serie B", "Serie B (Italy, Tier 2)"],
    ["French Ligue 1", "Ligue 1 (France, Tier 1)"],
    ["French Ligue 2", "Ligue 2 (France, Tier 2)"],
    ["Dutch Eredivisie", "Eredivisie (Netherlands, Tier 1)"],
    ["Portuguese Primeira Liga", "Primeira Liga (Portugal, Tier 1)"],
    ["Scottish Premiership", "Scottish Premiership (Scotland, Tier 1)"],
    ["Turkish Super Lig", "Super Lig (Turkey, Tier 1)"],
    ["Belgian Pro League", "Belgian Pro League (Belgium, Tier 1)"]
  ]);
  return map.get(name) || fallback;
}

function teamCandidates(teamObj = {}) {
  return [teamObj.displayName, teamObj.name, teamObj.shortDisplayName, teamObj.location]
    .filter(Boolean)
    .map(normalizeTeamName);
}

function isTeamMatch(entryTeam, normalizedTarget) {
  const candidates = teamCandidates(entryTeam);
  for (const candidate of candidates) {
    if (candidate === normalizedTarget) return true;
    if (candidate.replace(/\s+/g, "") === normalizedTarget.replace(/\s+/g, "")) return true;
  }
  return false;
}

async function fetchLeagueTeams(league) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/teams`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const json = await res.json();
  const list = json?.sports?.[0]?.leagues?.[0]?.teams || [];
  return list
    .map((item) => item?.team)
    .filter(Boolean)
    .map((team) => ({
      id: team.id || null,
      name: team.displayName || team.name || team.shortDisplayName || null,
      shortName: team.shortDisplayName || null,
      altName: team.name || null,
      league: league.name
    }))
    .filter((team) => team.name);
}

async function getClubDirectory() {
  if (clubDirectoryPromise) return clubDirectoryPromise;

  clubDirectoryPromise = (async () => {
    const perLeague = await Promise.all(
      LEAGUES.map(async (league) => ({
        league,
        teams: await fetchLeagueTeams(league).catch(() => [])
      }))
    );

    const dedupe = new Map();
    for (const group of perLeague) {
      for (const team of group.teams) {
        const keys = [team.name, team.shortName, team.altName]
          .filter(Boolean)
          .map(normalizeTeamName);
        const canonicalKey = keys[0];
        if (!canonicalKey || dedupe.has(canonicalKey)) continue;
        dedupe.set(canonicalKey, {
          ...team,
          searchKeys: [...new Set(keys)]
        });
      }
    }

    return [...dedupe.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  return clubDirectoryPromise;
}

async function searchClubSuggestions(query, limit = 20) {
  const normalizedQuery = normalizeTeamName(query);
  if (normalizedQuery.length < 2) return [];

  const directory = await getClubDirectory();
  const starts = [];
  const contains = [];

  for (const team of directory) {
    const matchesStart = team.searchKeys.some((k) => k.startsWith(normalizedQuery));
    const matchesContains = team.searchKeys.some((k) => k.includes(normalizedQuery));
    if (matchesStart) {
      starts.push(team);
      continue;
    }
    if (matchesContains) contains.push(team);
  }

  return [...starts, ...contains].slice(0, limit).map((team) => ({
    name: team.name,
    league: team.league,
    label: `${team.name} — ${team.league}`
  }));
}

function extractEspnFittPayload(html) {
  const marker = "window['__espnfitt__']=";
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) return null;

  const start = html.indexOf("{", markerIdx + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }

  return null;
}

async function fetchTeamPlayerPerformance(teamId, leagueSlug, seasonYear) {
  const key = `${teamId}:${leagueSlug}:${seasonYear}`;
  if (performanceCache.has(key)) return performanceCache.get(key);

  const promise = (async () => {
    const slug = String(leagueSlug || "").toUpperCase();
    const url = `https://www.espn.com/soccer/team/stats/_/id/${teamId}/league/${slug}/season/${seasonYear}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { available: false, message: "No player stats page available for this club/season." };
    }

    const html = await res.text();
    const raw = extractEspnFittPayload(html);
    if (!raw) {
      return { available: false, message: "Could not parse player stats payload." };
    }

    const payload = JSON.parse(raw);
    const stats = payload?.page?.content?.stats;
    if (!stats || !Array.isArray(stats.tables) || !Array.isArray(stats.tableRows)) {
      return { available: false, message: "Player stats are unavailable for this league/season on ESPN." };
    }

    const tables = stats.tables.map((table, index) => {
      const headers = (table.headers || []).map((h) => ({
        type: h.type,
        title: h.title,
        desc: h.desc || ""
      }));

      const rows = (stats.tableRows[index] || []).slice(0, 20).map((row) => {
        const player = row[1] || {};
        const metrics = [];
        for (let i = 2; i < row.length; i += 1) {
          const header = headers[i];
          const val = row[i]?.value;
          metrics.push({
            key: header?.type || `metric_${i}`,
            title: header?.title || `M${i}`,
            value: typeof val === "number" ? val : Number(val) || 0
          });
        }

        return {
          rank: Number(row[0]) || 0,
          playerName: player.name || player.shortName || "Unknown",
          playerShortName: player.shortName || player.name || "Unknown",
          playerHref: player.href || null,
          metrics
        };
      });

      return {
        title: table.title || `Table ${index + 1}`,
        headers,
        rows
      };
    });

    return {
      available: true,
      seasonDisplayName: payload?.page?.content?.stats?.season?.displayName || null,
      league: payload?.page?.content?.stats?.soccerLeague || null,
      tables
    };
  })().catch(() => ({ available: false, message: "Failed to fetch player performance." }));

  performanceCache.set(key, promise);
  return promise;
}

async function fetchStandings(league, seasonYear) {
  const key = `${league.slug}-${seasonYear}`;
  if (standingsCache.has(key)) return standingsCache.get(key);

  const promise = (async () => {
    const url = `https://site.api.espn.com/apis/v2/sports/soccer/${league.slug}/standings?season=${seasonYear}`;
    const res = await fetch(url);
    if (!res.ok) return { entries: [], leagueName: league.name, season: formatSeasonYear(seasonYear) };

    const json = await res.json();
    const top = json.children?.[0]?.standings;
    const entries = top?.entries || json.standings?.entries || [];
    const season = top?.seasonDisplayName ? formatSeasonYear(seasonYear) : formatSeasonYear(seasonYear);
    const leagueName = parseLeagueName(json.name, league.name);

    return { entries, leagueName, season };
  })().catch(() => ({ entries: [], leagueName: league.name, season: formatSeasonYear(seasonYear) }));

  standingsCache.set(key, promise);
  return promise;
}

function scoreMatrix(records) {
  if (records.length === 0) {
    return {
      total: 0,
      breakdown: {
        consistency: 0,
        longevity: 0,
        peak: 0,
        recent: 0
      }
    };
  }

  const percentiles = records.map((r) => (r.teamsInLeague <= 1 ? 0 : (r.teamsInLeague - r.position) / (r.teamsInLeague - 1)));
  const avgPercentile = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
  const consistency = avgPercentile * 4;

  const seasonsCount = records.length;
  const longevity = Math.min(seasonsCount / 20, 1) * 2;

  const titles = records.filter((r) => r.position === 1).length;
  const titleRate = titles / seasonsCount;
  const peak = Math.min(2, titleRate * 8 + (titles > 0 ? 0.5 : 0));

  const recent = records.slice(0, 5).map((r) => (r.teamsInLeague <= 1 ? 0 : (r.teamsInLeague - r.position) / (r.teamsInLeague - 1)));
  const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const recentScore = recentAvg * 2;

  const total = consistency + longevity + peak + recentScore;

  return {
    total: Number(total.toFixed(2)),
    breakdown: {
      consistency: Number(consistency.toFixed(2)),
      longevity: Number(longevity.toFixed(2)),
      peak: Number(peak.toFixed(2)),
      recent: Number(recentScore.toFixed(2))
    }
  };
}

function seasonStartYear(seasonLabel) {
  const year = Number(seasonLabel.slice(0, 4));
  return Number.isNaN(year) ? null : year;
}

function getSecondTierStreaks(records) {
  if (!records.length) return { current: 0, max: 0 };

  let max = 0;
  let running = 0;
  let previousYear = null;

  for (const record of records) {
    const year = seasonStartYear(record.season);
    if (year === null) continue;

    if (previousYear !== null && year !== previousYear - 1) running = 0;

    if (record.leagueTier === 2) {
      running += 1;
      if (running > max) max = running;
    } else {
      running = 0;
    }

    previousYear = year;
  }

  let current = 0;
  let latestYear = seasonStartYear(records[0].season);
  for (const record of records) {
    const year = seasonStartYear(record.season);
    if (year === null || latestYear === null || year !== latestYear) break;
    if (record.leagueTier !== 2) break;
    current += 1;
    latestYear -= 1;
  }

  return { current, max };
}

async function findLikelyLeague(normalizedTarget) {
  const recentWindow = SEASON_YEARS.slice(0, 4);

  for (const seasonYear of recentWindow) {
    const leagueData = await Promise.all(
      LEAGUES.map(async (league) => ({
        league,
        data: await fetchStandings(league, seasonYear)
      }))
    );

    for (const item of leagueData) {
      const found = item.data.entries.find((entry) => isTeamMatch(entry.team, normalizedTarget));
      if (found) return item.league;
    }
  }

  for (const seasonYear of SEASON_YEARS) {
    const leagueData = await Promise.all(
      LEAGUES.map(async (league) => ({
        league,
        data: await fetchStandings(league, seasonYear)
      }))
    );

    for (const item of leagueData) {
      const found = item.data.entries.find((entry) => isTeamMatch(entry.team, normalizedTarget));
      if (found) return item.league;
    }
  }

  return null;
}

async function buildTeamHistory(teamName) {
  const cacheKey = normalizeTeamName(teamName);
  if (teamCache.has(cacheKey)) return teamCache.get(cacheKey);

  const promise = (async () => {
    const normalizedTarget = normalizeTeamName(teamName);
    const likelyLeague = await findLikelyLeague(normalizedTarget);
    const scopedLeagues = likelyLeague ? LEAGUES.filter((l) => l.country === likelyLeague.country) : LEAGUES;

    const records = [];

    for (const seasonYear of SEASON_YEARS) {
      const seasonLeagueData = await Promise.all(
        scopedLeagues.map(async (league) => ({
          league,
          data: await fetchStandings(league, seasonYear)
        }))
      );

      for (const item of seasonLeagueData) {
        const { league, data } = item;
        if (!data.entries.length) continue;

        const teamsInLeague = data.entries.length;
        const found = data.entries.find((entry) => isTeamMatch(entry.team, normalizedTarget));
        if (!found) continue;

        const position = Number(statValue(found, "rank", 0)) || data.entries.findIndex((e) => e === found) + 1;

        records.push({
          season: formatSeasonYear(seasonYear),
          seasonYear,
          league: data.leagueName,
          leagueSlug: league.slug,
          leagueTier: league.tier,
          team: found.team?.displayName || found.team?.name || teamName,
          teamId: found.team?.id || null,
          position,
          teamsInLeague,
          points: Number(statValue(found, "points", 0)),
          played: Number(statValue(found, "gamesplayed", 0)),
          wins: Number(statValue(found, "wins", 0)),
          draws: Number(statValue(found, "ties", 0)),
          losses: Number(statValue(found, "losses", 0)),
          gf: Number(statValue(found, "pointsfor", 0)),
          ga: Number(statValue(found, "pointsagainst", 0)),
          gd: Number(statValue(found, "pointdifferential", 0))
        });
      }
    }

    records.sort((a, b) => b.seasonYear - a.seasonYear);

    return {
      source: "ESPN",
      team: teamName,
      seasonsFound: records.length,
      matrix: scoreMatrix(records),
      records
    };
  })();

  teamCache.set(cacheKey, promise);
  return promise;
}

async function buildUclParticipation(teamName, teamId) {
  const cacheKey = `${normalizeTeamName(teamName)}:${teamId || "none"}`;
  if (uclCache.has(cacheKey)) return uclCache.get(cacheKey);

  const promise = (async () => {
    const normalizedTarget = normalizeTeamName(teamName);
    const seasons = [];
    const index = await getUclSeasonIndex();

    for (const item of index) {
      if (teamId && item.teamIds.has(String(teamId))) {
        seasons.push(item.season);
        continue;
      }
      if (item.teamNames.has(normalizedTarget)) {
        seasons.push(item.season);
      }
    }

    return {
      available: true,
      seasonsCount: seasons.length,
      seasons,
      lastSeason: seasons[0] || null
    };
  })();

  uclCache.set(cacheKey, promise);
  return promise;
}

async function getUclSeasonIndex() {
  if (uclSeasonIndexPromise) return uclSeasonIndexPromise;

  uclSeasonIndexPromise = (async () => {
    const league = { slug: UCL_SLUG, name: "UEFA Champions League" };
    const index = [];

    for (const seasonYear of SEASON_YEARS) {
      const data = await fetchStandings(league, seasonYear);
      if (!data.entries.length) continue;

      const teamIds = new Set();
      const teamNames = new Set();
      for (const entry of data.entries) {
        if (entry.team?.id) teamIds.add(String(entry.team.id));
        const candidates = teamCandidates(entry.team);
        for (const c of candidates) teamNames.add(c);
      }

      index.push({
        season: formatSeasonYear(seasonYear),
        teamIds,
        teamNames
      });
    }

    return index;
  })();

  return uclSeasonIndexPromise;
}

async function buildClubInsight(teamName) {
  const history = await buildTeamHistory(teamName);
  if (!history.records.length) {
    return {
      inputTeam: teamName,
      found: false,
      reason: "No history found in the current ESPN dataset scope."
    };
  }

  const leagueCounts = new Map();
  for (const record of history.records) {
    leagueCounts.set(record.league, (leagueCounts.get(record.league) || 0) + 1);
  }

  const leagues = [...leagueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([league]) => league);

  const secondTier = getSecondTierStreaks(history.records);
  const teamId = history.records[0]?.teamId || null;
  const ucl = await buildUclParticipation(history.records[0].team, teamId);

  return {
    inputTeam: teamName,
    found: true,
    resolvedTeam: history.records[0].team,
    associatedLeagues: leagues,
    currentLeague: history.records[0].league,
    seasonsFound: history.seasonsFound,
    matrixScore: history.matrix.total,
    secondTierConsecutive: secondTier,
    championsLeagueParticipation: ucl
  };
}

function contentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

async function requestHandler(req, res) {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Bad request" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/team-history" && req.method === "GET") {
    const team = (url.searchParams.get("team") || "").trim();

    if (!team) {
      sendJson(res, 400, { error: "Please provide a team name." });
      return;
    }

    try {
      const result = await buildTeamHistory(team);
      if (!result.records.length) {
        sendJson(res, 404, {
          error: "No history found in the current ESPN league set.",
          hint: "Try a club that appears in major domestic ESPN league coverage."
        });
        return;
      }

      sendJson(res, 200, result);
      return;
    } catch {
      sendJson(res, 500, { error: "Could not build team history right now." });
      return;
    }
  }

  if (url.pathname === "/api/club-suggest" && req.method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    try {
      const suggestions = await searchClubSuggestions(q);
      sendJson(res, 200, { suggestions });
      return;
    } catch {
      sendJson(res, 500, { error: "Could not fetch club suggestions right now." });
      return;
    }
  }

  if (url.pathname === "/api/team-player-performance" && req.method === "GET") {
    const teamId = (url.searchParams.get("teamId") || "").trim();
    const leagueSlug = (url.searchParams.get("leagueSlug") || "").trim();
    const seasonYear = Number(url.searchParams.get("seasonYear") || "");

    if (!teamId || !leagueSlug || Number.isNaN(seasonYear)) {
      sendJson(res, 400, { error: "Please provide teamId, leagueSlug, and seasonYear." });
      return;
    }

    try {
      const data = await fetchTeamPlayerPerformance(teamId, leagueSlug, seasonYear);
      sendJson(res, 200, data);
      return;
    } catch {
      sendJson(res, 500, { error: "Could not fetch player performance right now." });
      return;
    }
  }

  if (url.pathname === "/api/club-insights-batch" && req.method === "GET") {
    const teamsRaw = (url.searchParams.get("teams") || "").trim();
    const teams = teamsRaw
      .split(/\r?\n|,/)
      .map((team) => team.trim())
      .filter(Boolean);

    if (!teams.length) {
      sendJson(res, 400, { error: "Please provide one or more team names." });
      return;
    }
    if (teams.length > 30) {
      sendJson(res, 400, { error: "Please keep batch size to 30 clubs or fewer per request." });
      return;
    }

    try {
      const insights = [];
      for (const team of teams) {
        insights.push(await buildClubInsight(team));
      }
      sendJson(res, 200, { source: "ESPN", teams: insights });
      return;
    } catch {
      sendJson(res, 500, { error: "Could not build batch club insights right now." });
      return;
    }
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(reqPath).replace(/^([.][.][/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(requestHandler);

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Team History MVP running at http://localhost:${PORT}`);
  });
}

export default requestHandler;
