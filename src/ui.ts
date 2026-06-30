import { Team, Round, generatePairs, generateSchedule, validateScore, computeStandings, TeamStanding } from './tournament.js';
import { TournamentState, Phase, saveState } from './state.js';

let state: TournamentState;
let selectedSwapPlayer: { teamIdx: number; playerSlot: 1 | 2 } | null = null;
let listenersAttached = false;
// Temporarily holds scores while editing a completed round
let editingScores: { score1: number; score2: number }[] | null = null;

function showToast(message: string, type: 'error' | 'success' = 'error'): void {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  // Trigger reflow for animation
  toast.offsetHeight;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

let stateChangeCallback: () => void;

export function initUI(s: TournamentState, onStateChange: () => void): void {
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

export function renderCurrentPhase(): void {
  const steps = ['step-players', 'step-teams', 'step-rounds', 'step-standings'];
  const phaseMap: Record<Phase, string> = {
    players: 'step-players',
    teams: 'step-teams',
    rounds: 'step-rounds',
    standings: 'step-standings',
  };

  for (const id of steps) {
    document.getElementById(id)!.classList.add('hidden');
  }
  document.getElementById(phaseMap[state.phase])!.classList.remove('hidden');
  renderStepIndicator();

  switch (state.phase) {
    case 'players': renderPlayerInputs(); break;
    case 'teams': renderTeams(); break;
    case 'rounds': renderRound(); break;
    case 'standings': renderStandings(); break;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Step indicator — completed steps are clickable to navigate back
function renderStepIndicator(): void {
  const el = document.getElementById('step-indicator')!;
  const labels = ['Players', 'Teams', 'Rounds', 'Standings'];
  const phases: Phase[] = ['players', 'teams', 'rounds', 'standings'];
  const currentIdx = phases.indexOf(state.phase);

  el.innerHTML = labels.map((label, i) => {
    let cls = 'step-dot';
    if (i < currentIdx) cls += ' completed clickable';
    if (i === currentIdx) cls += ' active';
    return `<span class="${cls}" data-step="${i}">${label}</span>`;
  }).join('<span class="step-line"></span>');

  // Attach click handlers to completed steps
  el.querySelectorAll('.step-dot.completed').forEach(dot => {
    dot.addEventListener('click', () => {
      const stepIdx = parseInt(dot.getAttribute('data-step')!);
      const targetPhase = phases[stepIdx];
      navigateToPhase(targetPhase);
    });
  });
}

function navigateToPhase(targetPhase: Phase): void {
  const phases: Phase[] = ['players', 'teams', 'rounds', 'standings'];
  const targetIdx = phases.indexOf(targetPhase);
  const currentIdx = phases.indexOf(state.phase);

  if (targetIdx >= currentIdx) return;

  // Warn the user about data loss
  const warnings: Record<string, string> = {
    players: 'This will reset teams, rounds, and all scores.',
    teams: 'This will reset all rounds and scores.',
    rounds: 'This will take you back to round 1.',
  };
  const msg = warnings[targetPhase] || '';
  if (!confirm(`Go back to ${targetPhase}? ${msg}`)) return;

  // Reset forward state depending on where we're going back to
  if (targetIdx <= 0) {
    // Going back to players: keep player names, reset everything else
    state.teams = [];
    state.rounds = [];
    state.currentRound = 0;
  } else if (targetIdx <= 1) {
    // Going back to teams: keep players & teams, reset rounds
    state.rounds = [];
    state.currentRound = 0;
  } else if (targetIdx <= 2) {
    // Going back to rounds: keep everything, go to round 1
    state.currentRound = 0;
  }

  state.phase = targetPhase;
  stateChangeCallback();
  renderCurrentPhase();
}

// Step 1: Player Entry
function renderPlayerInputs(): void {
  const container = document.getElementById('player-inputs')!;
  container.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const div = document.createElement('div');
    div.className = 'player-input-group';
    div.innerHTML = `
      <label for="player-${i}">Player ${i + 1}</label>
      <input type="text" id="player-${i}" value="${state.players[i] || ''}" placeholder="Enter name..." maxlength="30">
    `;
    container.appendChild(div);
  }
}

const SPREADSHEET_ID = '1JaK-mi1zznMOo_-2Vdf-982QhP0lVBcpxWpCLl0KNjI';
const HEADER_ROWS_TO_SKIP = 2;
const IGNORED_TABS = ['Comptes', 'ARCHIVE', 'Contributions'];

function parseTabNames(html: string): string[] {
  const regex = /items\.push\(\{name:\s*"([^"]+)"/g;
  const tabs: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1].replace(/\\\//g, '/');
    if (!IGNORED_TABS.includes(name)) {
      tabs.push(name);
    }
  }
  return tabs;
}

async function loadSheetTabs(): Promise<void> {
  const select = document.getElementById('import-tab-select') as HTMLSelectElement;
  const textInput = document.getElementById('import-tab-name') as HTMLInputElement;
  const htmlEmbedUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/htmlembed`;

  try {
    // Try direct fetch first (works same-origin), then CORS proxy
    let html: string;
    try {
      const resp = await fetch(htmlEmbedUrl);
      if (!resp.ok) throw new Error('direct failed');
      html = await resp.text();
    } catch {
      const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(htmlEmbedUrl)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error('proxy failed');
      html = await resp.text();
    }

    const tabs = parseTabNames(html);
    if (tabs.length === 0) throw new Error('no tabs');

    select.innerHTML = '<option value="" disabled selected>Select a tab…</option>';
    for (const tab of tabs) {
      const option = document.createElement('option');
      option.value = tab;
      option.textContent = tab;
      select.appendChild(option);
    }
  } catch {
    // Fallback: hide dropdown, show text input
    select.classList.add('hidden');
    textInput.classList.remove('hidden');
  }
}

async function importPlayersFromSheet(tabName: string, onStateChange: () => void): Promise<void> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&range=D:D`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();

    const names = csv
      .split('\n')
      .slice(HEADER_ROWS_TO_SKIP)
      .map(line => line.replace(/^"(.*)"$/, '$1').trim())
      .filter(name => name.length > 0)
      .slice(0, 12);

    if (names.length === 0) {
      showToast('No player names found in that tab.');
      return;
    }

    state.players = [...names, ...Array(12 - names.length).fill('')];
    onStateChange();
    renderPlayerInputs();

    if (names.length < 12) {
      showToast(`Imported ${names.length} players — fill the remaining ${12 - names.length} manually.`, 'success');
    } else {
      showToast(`Imported 12 players!`, 'success');
    }
  } catch (err) {
    showToast(`Import failed: could not fetch tab "${tabName}".`);
  }
}

function setupPlayerEntry(onStateChange: () => void): void {
  loadSheetTabs();

  document.getElementById('btn-import-players')!.addEventListener('click', () => {
    const select = document.getElementById('import-tab-select') as HTMLSelectElement;
    const textInput = document.getElementById('import-tab-name') as HTMLInputElement;
    // Use dropdown if visible, otherwise text input
    const tabName = select.classList.contains('hidden')
      ? textInput.value.trim()
      : select.value;
    if (!tabName) {
      showToast('Please select or enter a tab name.');
      return;
    }
    importPlayersFromSheet(tabName, onStateChange);
  });

  document.getElementById('btn-clear-players')!.addEventListener('click', () => {
    if (!confirm('Clear all player names?')) return;
    state.players = Array(12).fill('');
    onStateChange();
    renderPlayerInputs();
  });

  document.getElementById('btn-generate-pairs')!.addEventListener('click', () => {
    // Read filled player names
    const players: string[] = [];
    for (let i = 0; i < 12; i++) {
      const input = document.getElementById(`player-${i}`) as HTMLInputElement;
      const name = input.value.trim();
      if (name) {
        players.push(name);
      }
    }

    // Validate player count: must be 4, 6, 8, 10, or 12
    const validCounts = [4, 6, 8, 10, 12];
    if (!validCounts.includes(players.length)) {
      showToast(`Please fill exactly 4, 6, 8, 10, or 12 player names (currently ${players.length}).`);
      return;
    }

    // Check for duplicates
    const uniqueNames = new Set(players.map(n => n.toLowerCase()));
    if (uniqueNames.size < players.length) {
      showToast('All player names must be unique!');
      return;
    }

    // Confirm dialog for fewer than 12 players
    const numTeams = players.length / 2;
    // Odd team counts use a bye each round → one round per team; even → n-1 rounds.
    const numRounds = numTeams % 2 === 1 ? numTeams : numTeams - 1;
    if (players.length < 12) {
      const byeNote = numTeams % 2 === 1
        ? ' One pair will wait (bye) each round.'
        : '';
      if (!confirm(`You have ${players.length} players. This will create a tournament with ${numTeams} teams and ${numRounds} rounds.${byeNote} Continue?`)) {
        return;
      }
    }

    state.players = players;
    state.teams = generatePairs(players);
    state.phase = 'teams';
    onStateChange();
    renderCurrentPhase();
  });
}

// Step 2: Team Review
function renderTeams(): void {
  const container = document.getElementById('team-list')!;
  container.innerHTML = '';
  selectedSwapPlayer = null;

  state.teams.forEach((team, idx) => {
    const card = document.createElement('div');
    card.className = 'team-card';
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

  // Add click handlers for swapping
  container.querySelectorAll('.player-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamIdx = parseInt(btn.getAttribute('data-team')!);
      const slot = parseInt(btn.getAttribute('data-slot')!) as 1 | 2;

      if (!selectedSwapPlayer) {
        selectedSwapPlayer = { teamIdx, playerSlot: slot };
        btn.classList.add('selected');
      } else {
        // Swap players
        const from = selectedSwapPlayer;
        const to = { teamIdx, playerSlot: slot };

        const fromKey = from.playerSlot === 1 ? 'player1' : 'player2';
        const toKey = to.playerSlot === 1 ? 'player1' : 'player2';

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

function setupTeamReview(onStateChange: () => void): void {
  document.getElementById('btn-reshuffle')!.addEventListener('click', () => {
    const activePlayers = state.players.filter(p => p.trim() !== '');
    state.teams = generatePairs(activePlayers);
    onStateChange();
    renderTeams();
  });

  document.getElementById('btn-confirm-teams')!.addEventListener('click', () => {
    state.rounds = generateSchedule(state.teams.length);
    state.currentRound = 0;
    state.phase = 'rounds';
    onStateChange();
    renderCurrentPhase();
  });
}

// Step 3: Rounds
function renderRound(): void {
  const round = state.rounds[state.currentRound];
  const roundNum = state.currentRound + 1;
  const totalRounds = state.rounds.length;

  document.getElementById('round-title')!.textContent = `Round ${roundNum}`;
  document.getElementById('round-indicator')!.textContent = `${roundNum} / ${totalRounds}`;

  const isRoundComplete = round.matches.every(m => m.score1 !== null && m.score2 !== null);
  const isLastRound = state.currentRound === totalRounds - 1;

  // Navigation buttons
  const prevBtn = document.getElementById('btn-prev-round') as HTMLButtonElement;
  const submitBtn = document.getElementById('btn-submit-round') as HTMLButtonElement;
  const nextBtn = document.getElementById('btn-next-round') as HTMLButtonElement;
  const editBtn = document.getElementById('btn-edit-round') as HTMLButtonElement;

  prevBtn.disabled = state.currentRound === 0;
  prevBtn.classList.toggle('hidden', state.currentRound === 0);

  if (isRoundComplete) {
    submitBtn.classList.add('hidden');
    editBtn.classList.remove('hidden');
    if (isLastRound) {
      nextBtn.textContent = '🏆 See Results';
      nextBtn.classList.remove('hidden');
    } else {
      nextBtn.textContent = 'Next →';
      nextBtn.classList.remove('hidden');
      nextBtn.classList.remove('btn-secondary');
      nextBtn.classList.add('btn-primary');
    }
  } else if (editingScores) {
    // Editing mode: show submit, hide edit and next
    submitBtn.classList.remove('hidden');
    editBtn.classList.add('hidden');
    nextBtn.classList.add('hidden');
  } else {
    submitBtn.classList.remove('hidden');
    editBtn.classList.add('hidden');
    nextBtn.classList.add('hidden');
  }

  // Description
  const descEl = document.getElementById('round-description')!;
  if (isRoundComplete) {
    descEl.textContent = 'Round complete! Review scores below.';
  } else if (editingScores) {
    descEl.textContent = 'Editing scores — modify and re-submit.';
  } else {
    descEl.textContent = 'Enter the scores for each match. Winner needs ≥21 pts and a 2-point lead.';
  }

  // Render matches
  const container = document.getElementById('round-matches')!;
  container.innerHTML = '';

  round.matches.forEach((match, mIdx) => {
    const team1 = state.teams[match.team1Index];
    const team2 = state.teams[match.team2Index];
    const isCompleted = match.score1 !== null && match.score2 !== null;

    // When editing, use saved scores for display but inputs are enabled
    const displayScore1 = editingScores ? editingScores[mIdx].score1 : match.score1;
    const displayScore2 = editingScores ? editingScores[mIdx].score2 : match.score2;
    const inputsDisabled = isCompleted && !editingScores;

    const card = document.createElement('div');
    card.className = 'match-card' + (isCompleted && !editingScores ? ' completed' : '');

    const team1Label = `${team1.player1} & ${team1.player2}`;
    const team2Label = `${team2.player1} & ${team2.player2}`;

    const winner1 = isCompleted && !editingScores && match.score1! > match.score2! ? ' winner' : '';
    const winner2 = isCompleted && !editingScores && match.score2! > match.score1! ? ' winner' : '';

    card.innerHTML = `
      <div class="match-header">Match ${mIdx + 1}</div>
      <div class="match-body">
        <div class="match-team${winner1}">
          <span class="team-name">${team1Label}</span>
          <input type="number" class="score-input" data-match="${mIdx}" data-side="1"
                 value="${displayScore1 !== null ? displayScore1 : ''}"
                 min="0" step="1" placeholder="—" ${inputsDisabled ? 'disabled' : ''}>
        </div>
        <div class="match-vs">vs</div>
        <div class="match-team${winner2}">
          <span class="team-name">${team2Label}</span>
          <input type="number" class="score-input" data-match="${mIdx}" data-side="2"
                 value="${displayScore2 !== null ? displayScore2 : ''}"
                 min="0" step="1" placeholder="—" ${inputsDisabled ? 'disabled' : ''}>
        </div>
      </div>
      <div class="match-error" data-error="${mIdx}"></div>
    `;
    container.appendChild(card);
  });

  // Highlight the pair that sits out (bye) this round, if any.
  const byeTeamIndex = round.byeTeamIndex ?? null;
  if (byeTeamIndex !== null && state.teams[byeTeamIndex]) {
    const byeTeam = state.teams[byeTeamIndex];
    const byeCard = document.createElement('div');
    byeCard.className = 'bye-card';
    byeCard.innerHTML = `
      <div class="bye-badge">⏳ Waiting this round</div>
      <div class="bye-team">${byeTeam.player1} & ${byeTeam.player2}</div>
      <div class="bye-note">This pair has a bye and plays again next round.</div>
    `;
    container.appendChild(byeCard);
  }

  // Attach live validation to score inputs when editing or entering new scores
  if (!isRoundComplete || editingScores) {
    attachScoreValidation(container);
  }
}

function attachScoreValidation(container: HTMLElement): void {
  const inputs = Array.from(container.querySelectorAll('.score-input')) as HTMLInputElement[];
  const submitBtn = document.getElementById('btn-submit-round') as HTMLButtonElement;

  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      // Auto-advance: when 2+ digits entered, move to next input (or submit button)
      if (input.value.length >= 2) {
        if (idx < inputs.length - 1) {
          inputs[idx + 1].focus();
          inputs[idx + 1].select();
        } else {
          submitBtn.focus();
        }
      }

      // Live validation
      const mIdx = input.getAttribute('data-match')!;
      const input1 = container.querySelector(`[data-match="${mIdx}"][data-side="1"]`) as HTMLInputElement;
      const input2 = container.querySelector(`[data-match="${mIdx}"][data-side="2"]`) as HTMLInputElement;
      const errorEl = container.querySelector(`[data-error="${mIdx}"]`) as HTMLElement;

      // Clear previous state
      input1.classList.remove('score-error');
      input2.classList.remove('score-error');
      if (errorEl) errorEl.textContent = '';

      // Only validate when both fields have values
      if (input1.value.trim() === '' || input2.value.trim() === '') return;

      const s1 = Number(input1.value);
      const s2 = Number(input2.value);
      if (isNaN(s1) || isNaN(s2)) return;

      const err = validateScore(s1, s2);
      if (err) {
        input1.classList.add('score-error');
        input2.classList.add('score-error');
        if (errorEl) errorEl.textContent = err;
      }
    });
  });
}

function setupRounds(onStateChange: () => void): void {
  document.getElementById('btn-prev-round')!.addEventListener('click', () => {
    if (state.currentRound > 0) {
      editingScores = null;
      state.currentRound--;
      onStateChange();
      renderRound();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-edit-round')!.addEventListener('click', () => {
    const round = state.rounds[state.currentRound];
    // Save current scores for pre-filling inputs
    editingScores = round.matches.map(m => ({
      score1: m.score1 as number,
      score2: m.score2 as number,
    }));
    // Clear scores in state so the round is considered incomplete
    round.matches.forEach(m => {
      m.score1 = null;
      m.score2 = null;
    });
    onStateChange();
    renderRound();
  });

  document.getElementById('btn-submit-round')!.addEventListener('click', () => {
    const round = state.rounds[state.currentRound];
    const errors: string[] = [];

    round.matches.forEach((match, mIdx) => {
      const input1 = document.querySelector(`[data-match="${mIdx}"][data-side="1"]`) as HTMLInputElement;
      const input2 = document.querySelector(`[data-match="${mIdx}"][data-side="2"]`) as HTMLInputElement;

      const s1 = Number(input1.value);
      const s2 = Number(input2.value);

      if (isNaN(s1) || isNaN(s2) || input1.value.trim() === '' || input2.value.trim() === '') {
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
      errors.forEach(e => showToast(e));
      return;
    }

    editingScores = null;
    onStateChange();
    renderRound();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('btn-next-round')!.addEventListener('click', () => {
    editingScores = null;
    const isLastRound = state.currentRound === state.rounds.length - 1;
    if (isLastRound) {
      state.phase = 'standings';
      onStateChange();
      renderCurrentPhase();
    } else {
      state.currentRound++;
      onStateChange();
      renderRound();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// Step 4: Standings
function renderStandings(): void {
  const standings = computeStandings(state.teams, state.rounds);
  const winner = standings[0];
  const winnerTeam = state.teams[winner.teamIndex];

  const banner = document.getElementById('winner-banner')!;
  banner.innerHTML = `
    <div class="trophy">🏆</div>
    <div class="winner-text">
      <strong>${winnerTeam.player1} & ${winnerTeam.player2}</strong>
      <span>Champions — ${winner.wins}W / ${winner.losses}L (${winner.pointDiff > 0 ? '+' : ''}${winner.pointDiff})</span>
    </div>
  `;

  const tbody = document.getElementById('standings-body')!;
  tbody.innerHTML = '';

  standings.forEach((s, rank) => {
    const team = state.teams[s.teamIndex];
    const row = document.createElement('tr');
    if (rank === 0) row.className = 'winner-row';

    row.innerHTML = `
      <td>${rank + 1}</td>
      <td>${team.player1} & ${team.player2}</td>
      <td>${s.wins}</td>
      <td>${s.losses}</td>
      <td>${s.pointsFor}</td>
      <td>${s.pointsAgainst}</td>
      <td>${s.pointDiff > 0 ? '+' : ''}${s.pointDiff}</td>
    `;
    tbody.appendChild(row);
  });
}

function setupStandings(onStateChange: () => void): void {
  document.getElementById('btn-view-rounds')!.addEventListener('click', () => {
    state.phase = 'rounds';
    state.currentRound = 0;
    onStateChange();
    renderCurrentPhase();
  });

  document.getElementById('btn-new-with-players')!.addEventListener('click', () => {
    if (confirm('Start a new tournament with the same players? Current results will be lost.')) {
      (window as any).__resetKeepPlayers();
    }
  });

  document.getElementById('btn-reset')!.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the entire tournament? This cannot be undone.')) {
      (window as any).__resetTournament();
    }
  });
}
