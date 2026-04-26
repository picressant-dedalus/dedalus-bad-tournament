"use strict";
(() => {
  // src/state.ts
  var STORAGE_KEY = "badminton-tournament";
  function getDefaultState() {
    return {
      phase: "players",
      players: Array(12).fill(""),
      teams: [],
      rounds: [],
      currentRound: 0
    };
  }
  function saveState(state2) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state2));
  }
  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    try {
      const parsed = JSON.parse(raw);
      const validPhases = ["players", "teams", "rounds", "standings"];
      if (!parsed.phase || !validPhases.includes(parsed.phase) || !Array.isArray(parsed.players) || !Array.isArray(parsed.teams) || !Array.isArray(parsed.rounds) || typeof parsed.currentRound !== "number" || parsed.currentRound < 0) {
        return getDefaultState();
      }
      return parsed;
    } catch {
      return getDefaultState();
    }
  }
  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // src/tournament.ts
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function generatePairs(players) {
    const shuffled = shuffle(players);
    const teams = [];
    for (let i = 0; i < 12; i += 2) {
      teams.push({
        id: teams.length,
        player1: shuffled[i],
        player2: shuffled[i + 1]
      });
    }
    return teams;
  }
  function generateSchedule() {
    const n = 6;
    const rounds = [];
    const teamIndices = [0, 1, 2, 3, 4, 5];
    for (let r = 0; r < n - 1; r++) {
      const matches = [];
      for (let i = 0; i < n / 2; i++) {
        matches.push({
          team1Index: teamIndices[i],
          team2Index: teamIndices[n - 1 - i],
          score1: null,
          score2: null
        });
      }
      rounds.push({ matches });
      const last = teamIndices.pop();
      teamIndices.splice(1, 0, last);
    }
    return rounds;
  }
  function validateScore(score1, score2) {
    if (!Number.isInteger(score1) || !Number.isInteger(score2)) {
      return "Scores must be whole numbers";
    }
    if (score1 < 0 || score2 < 0) {
      return "Scores cannot be negative";
    }
    if (score1 === score2) {
      return "Scores cannot be equal \u2014 there must be a winner";
    }
    const high = Math.max(score1, score2);
    const low = Math.min(score1, score2);
    if (high < 21) {
      return "Winning score must be at least 21";
    }
    if (high - low < 2) {
      return "Winner must lead by at least 2 points";
    }
    return null;
  }
  function computeStandings(teams, rounds) {
    const standings = teams.map((_, i2) => ({
      teamIndex: i2,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0
    }));
    const h2h = /* @__PURE__ */ new Map();
    for (let i2 = 0; i2 < teams.length; i2++) {
      h2h.set(i2, /* @__PURE__ */ new Set());
    }
    for (const round of rounds) {
      for (const match of round.matches) {
        if (match.score1 === null || match.score2 === null) continue;
        const s1 = standings[match.team1Index];
        const s2 = standings[match.team2Index];
        s1.pointsFor += match.score1;
        s1.pointsAgainst += match.score2;
        s2.pointsFor += match.score2;
        s2.pointsAgainst += match.score1;
        if (match.score1 > match.score2) {
          s1.wins++;
          s2.losses++;
          h2h.get(match.team1Index).add(match.team2Index);
        } else {
          s2.wins++;
          s1.losses++;
          h2h.get(match.team2Index).add(match.team1Index);
        }
      }
    }
    for (const s of standings) {
      s.pointDiff = s.pointsFor - s.pointsAgainst;
    }
    standings.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
    const resolved = [];
    let i = 0;
    while (i < standings.length) {
      let j = i;
      while (j < standings.length && standings[j].wins === standings[i].wins) j++;
      const group = standings.slice(i, j);
      if (group.length === 2) {
        const [a, b] = group;
        if (h2h.get(b.teamIndex).has(a.teamIndex)) {
          group.reverse();
        }
      }
      resolved.push(...group);
      i = j;
    }
    return resolved;
  }

  // src/ui.ts
  var state;
  var selectedSwapPlayer = null;
  var listenersAttached = false;
  function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    toast.offsetHeight;
    toast.classList.add("visible");
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 4e3);
  }
  var stateChangeCallback;
  function initUI(s, onStateChange) {
    state = s;
    stateChangeCallback = onStateChange;
    if (!listenersAttached) {
      setupPlayerEntry(onStateChange);
      setupTeamReview(onStateChange);
      setupRounds(onStateChange);
      setupStandings(onStateChange);
      listenersAttached = true;
    }
    renderCurrentPhase();
  }
  function renderCurrentPhase() {
    const steps = ["step-players", "step-teams", "step-rounds", "step-standings"];
    const phaseMap = {
      players: "step-players",
      teams: "step-teams",
      rounds: "step-rounds",
      standings: "step-standings"
    };
    for (const id of steps) {
      document.getElementById(id).classList.add("hidden");
    }
    document.getElementById(phaseMap[state.phase]).classList.remove("hidden");
    renderStepIndicator();
    switch (state.phase) {
      case "players":
        renderPlayerInputs();
        break;
      case "teams":
        renderTeams();
        break;
      case "rounds":
        renderRound();
        break;
      case "standings":
        renderStandings();
        break;
    }
  }
  function renderStepIndicator() {
    const el = document.getElementById("step-indicator");
    const labels = ["Players", "Teams", "Rounds", "Standings"];
    const phases = ["players", "teams", "rounds", "standings"];
    const currentIdx = phases.indexOf(state.phase);
    el.innerHTML = labels.map((label, i) => {
      let cls = "step-dot";
      if (i < currentIdx) cls += " completed clickable";
      if (i === currentIdx) cls += " active";
      return `<span class="${cls}" data-step="${i}">${label}</span>`;
    }).join('<span class="step-line"></span>');
    el.querySelectorAll(".step-dot.completed").forEach((dot) => {
      dot.addEventListener("click", () => {
        const stepIdx = parseInt(dot.getAttribute("data-step"));
        const targetPhase = phases[stepIdx];
        navigateToPhase(targetPhase);
      });
    });
  }
  function navigateToPhase(targetPhase) {
    const phases = ["players", "teams", "rounds", "standings"];
    const targetIdx = phases.indexOf(targetPhase);
    const currentIdx = phases.indexOf(state.phase);
    if (targetIdx >= currentIdx) return;
    if (targetIdx <= 0) {
      state.teams = [];
      state.rounds = [];
      state.currentRound = 0;
    } else if (targetIdx <= 1) {
      state.rounds = [];
      state.currentRound = 0;
    } else if (targetIdx <= 2) {
      state.currentRound = 0;
    }
    state.phase = targetPhase;
    stateChangeCallback();
    renderCurrentPhase();
  }
  function renderPlayerInputs() {
    const container = document.getElementById("player-inputs");
    container.innerHTML = "";
    for (let i = 0; i < 12; i++) {
      const div = document.createElement("div");
      div.className = "player-input-group";
      div.innerHTML = `
      <label for="player-${i}">Player ${i + 1}</label>
      <input type="text" id="player-${i}" value="${state.players[i] || ""}" placeholder="Enter name..." maxlength="30">
    `;
      container.appendChild(div);
    }
  }
  function setupPlayerEntry(onStateChange) {
    document.getElementById("btn-generate-pairs").addEventListener("click", () => {
      const players = [];
      for (let i = 0; i < 12; i++) {
        const input = document.getElementById(`player-${i}`);
        const name = input.value.trim();
        if (!name) {
          input.focus();
          input.classList.add("error");
          setTimeout(() => input.classList.remove("error"), 1500);
          return;
        }
        players.push(name);
      }
      const uniqueNames = new Set(players.map((n) => n.toLowerCase()));
      if (uniqueNames.size < 12) {
        showToast("All player names must be unique!");
        return;
      }
      state.players = players;
      state.teams = generatePairs(players);
      state.phase = "teams";
      onStateChange();
      renderCurrentPhase();
    });
  }
  function renderTeams() {
    const container = document.getElementById("team-list");
    container.innerHTML = "";
    selectedSwapPlayer = null;
    state.teams.forEach((team, idx) => {
      const card = document.createElement("div");
      card.className = "team-card";
      card.innerHTML = `
      <div class="team-header">Team ${idx + 1}</div>
      <div class="team-players">
        <button class="player-chip" data-team="${idx}" data-slot="1">${team.player1}</button>
        <span class="pair-divider">&</span>
        <button class="player-chip" data-team="${idx}" data-slot="2">${team.player2}</button>
      </div>
    `;
      container.appendChild(card);
    });
    container.querySelectorAll(".player-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamIdx = parseInt(btn.getAttribute("data-team"));
        const slot = parseInt(btn.getAttribute("data-slot"));
        if (!selectedSwapPlayer) {
          selectedSwapPlayer = { teamIdx, playerSlot: slot };
          btn.classList.add("selected");
        } else {
          const from = selectedSwapPlayer;
          const to = { teamIdx, playerSlot: slot };
          const fromKey = from.playerSlot === 1 ? "player1" : "player2";
          const toKey = to.playerSlot === 1 ? "player1" : "player2";
          const temp = state.teams[from.teamIdx][fromKey];
          state.teams[from.teamIdx][fromKey] = state.teams[to.teamIdx][toKey];
          state.teams[to.teamIdx][toKey] = temp;
          selectedSwapPlayer = null;
          saveState(state);
          renderTeams();
        }
      });
    });
  }
  function setupTeamReview(onStateChange) {
    document.getElementById("btn-reshuffle").addEventListener("click", () => {
      state.teams = generatePairs(state.players);
      onStateChange();
      renderTeams();
    });
    document.getElementById("btn-confirm-teams").addEventListener("click", () => {
      state.rounds = generateSchedule();
      state.currentRound = 0;
      state.phase = "rounds";
      onStateChange();
      renderCurrentPhase();
    });
  }
  function renderRound() {
    const round = state.rounds[state.currentRound];
    const roundNum = state.currentRound + 1;
    const totalRounds = state.rounds.length;
    document.getElementById("round-title").textContent = `Round ${roundNum}`;
    document.getElementById("round-indicator").textContent = `${roundNum} / ${totalRounds}`;
    const isRoundComplete = round.matches.every((m) => m.score1 !== null && m.score2 !== null);
    const isLastRound = state.currentRound === totalRounds - 1;
    const prevBtn = document.getElementById("btn-prev-round");
    const submitBtn = document.getElementById("btn-submit-round");
    const nextBtn = document.getElementById("btn-next-round");
    prevBtn.disabled = state.currentRound === 0;
    prevBtn.classList.toggle("hidden", state.currentRound === 0);
    if (isRoundComplete) {
      submitBtn.classList.add("hidden");
      if (isLastRound) {
        nextBtn.textContent = "\u{1F3C6} See Results";
        nextBtn.classList.remove("hidden");
      } else {
        nextBtn.textContent = "Next \u2192";
        nextBtn.classList.remove("hidden");
      }
    } else {
      submitBtn.classList.remove("hidden");
      nextBtn.classList.add("hidden");
    }
    const descEl = document.getElementById("round-description");
    if (isRoundComplete) {
      descEl.textContent = "Round complete! Review scores below.";
    } else {
      descEl.textContent = "Enter the scores for each match. Winner needs \u226521 pts and a 2-point lead.";
    }
    const container = document.getElementById("round-matches");
    container.innerHTML = "";
    round.matches.forEach((match, mIdx) => {
      const team1 = state.teams[match.team1Index];
      const team2 = state.teams[match.team2Index];
      const isCompleted = match.score1 !== null && match.score2 !== null;
      const card = document.createElement("div");
      card.className = "match-card" + (isCompleted ? " completed" : "");
      const team1Label = `${team1.player1} & ${team1.player2}`;
      const team2Label = `${team2.player1} & ${team2.player2}`;
      const winner1 = isCompleted && match.score1 > match.score2 ? " winner" : "";
      const winner2 = isCompleted && match.score2 > match.score1 ? " winner" : "";
      card.innerHTML = `
      <div class="match-header">Match ${mIdx + 1}</div>
      <div class="match-body">
        <div class="match-team${winner1}">
          <span class="team-name">${team1Label}</span>
          <input type="number" class="score-input" data-match="${mIdx}" data-side="1"
                 value="${match.score1 !== null ? match.score1 : ""}"
                 min="0" step="1" placeholder="\u2014" ${isCompleted ? "disabled" : ""}>
        </div>
        <div class="match-vs">vs</div>
        <div class="match-team${winner2}">
          <span class="team-name">${team2Label}</span>
          <input type="number" class="score-input" data-match="${mIdx}" data-side="2"
                 value="${match.score2 !== null ? match.score2 : ""}"
                 min="0" step="1" placeholder="\u2014" ${isCompleted ? "disabled" : ""}>
        </div>
      </div>
      <div class="match-error" data-error="${mIdx}"></div>
    `;
      container.appendChild(card);
    });
    if (!isRoundComplete) {
      attachScoreValidation(container);
    }
  }
  function attachScoreValidation(container) {
    const inputs = container.querySelectorAll(".score-input");
    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        const mIdx = input.getAttribute("data-match");
        const input1 = container.querySelector(`[data-match="${mIdx}"][data-side="1"]`);
        const input2 = container.querySelector(`[data-match="${mIdx}"][data-side="2"]`);
        const errorEl = container.querySelector(`[data-error="${mIdx}"]`);
        input1.classList.remove("score-error");
        input2.classList.remove("score-error");
        if (errorEl) errorEl.textContent = "";
        if (input1.value.trim() === "" || input2.value.trim() === "") return;
        const s1 = Number(input1.value);
        const s2 = Number(input2.value);
        if (isNaN(s1) || isNaN(s2)) return;
        const err = validateScore(s1, s2);
        if (err) {
          input1.classList.add("score-error");
          input2.classList.add("score-error");
          if (errorEl) errorEl.textContent = err;
        }
      });
    });
  }
  function setupRounds(onStateChange) {
    document.getElementById("btn-prev-round").addEventListener("click", () => {
      if (state.currentRound > 0) {
        state.currentRound--;
        onStateChange();
        renderRound();
      }
    });
    document.getElementById("btn-submit-round").addEventListener("click", () => {
      const round = state.rounds[state.currentRound];
      const errors = [];
      round.matches.forEach((match, mIdx) => {
        const input1 = document.querySelector(`[data-match="${mIdx}"][data-side="1"]`);
        const input2 = document.querySelector(`[data-match="${mIdx}"][data-side="2"]`);
        const s1 = Number(input1.value);
        const s2 = Number(input2.value);
        if (isNaN(s1) || isNaN(s2) || input1.value.trim() === "" || input2.value.trim() === "") {
          errors.push(`Match ${mIdx + 1}: Please enter both scores`);
          return;
        }
        const err = validateScore(s1, s2);
        if (err) {
          errors.push(`Match ${mIdx + 1}: ${err}`);
          return;
        }
        match.score1 = s1;
        match.score2 = s2;
      });
      if (errors.length > 0) {
        errors.forEach((e) => showToast(e));
        return;
      }
      onStateChange();
      renderRound();
    });
    document.getElementById("btn-next-round").addEventListener("click", () => {
      const isLastRound = state.currentRound === state.rounds.length - 1;
      if (isLastRound) {
        state.phase = "standings";
        onStateChange();
        renderCurrentPhase();
      } else {
        state.currentRound++;
        onStateChange();
        renderRound();
      }
    });
  }
  function renderStandings() {
    const standings = computeStandings(state.teams, state.rounds);
    const winner = standings[0];
    const winnerTeam = state.teams[winner.teamIndex];
    const banner = document.getElementById("winner-banner");
    banner.innerHTML = `
    <div class="trophy">\u{1F3C6}</div>
    <div class="winner-text">
      <strong>${winnerTeam.player1} & ${winnerTeam.player2}</strong>
      <span>Champions \u2014 ${winner.wins}W / ${winner.losses}L (${winner.pointDiff > 0 ? "+" : ""}${winner.pointDiff})</span>
    </div>
  `;
    const tbody = document.getElementById("standings-body");
    tbody.innerHTML = "";
    standings.forEach((s, rank) => {
      const team = state.teams[s.teamIndex];
      const row = document.createElement("tr");
      if (rank === 0) row.className = "winner-row";
      row.innerHTML = `
      <td>${rank + 1}</td>
      <td>${team.player1} & ${team.player2}</td>
      <td>${s.wins}</td>
      <td>${s.losses}</td>
      <td>${s.pointsFor}</td>
      <td>${s.pointsAgainst}</td>
      <td>${s.pointDiff > 0 ? "+" : ""}${s.pointDiff}</td>
    `;
      tbody.appendChild(row);
    });
  }
  function setupStandings(onStateChange) {
    document.getElementById("btn-view-rounds").addEventListener("click", () => {
      state.phase = "rounds";
      state.currentRound = 0;
      onStateChange();
      renderCurrentPhase();
    });
    document.getElementById("btn-reset").addEventListener("click", () => {
      if (confirm("Are you sure you want to reset the entire tournament? This cannot be undone.")) {
        window.__resetTournament();
      }
    });
  }

  // src/main.ts
  function main() {
    let state2 = loadState();
    function onStateChange() {
      saveState(state2);
    }
    window.__resetTournament = () => {
      clearState();
      state2 = getDefaultState();
      initUI(state2, onStateChange);
    };
    initUI(state2, onStateChange);
  }
  document.addEventListener("DOMContentLoaded", main);
})();
//# sourceMappingURL=main.js.map
