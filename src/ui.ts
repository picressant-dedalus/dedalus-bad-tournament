import { Team, Round, generatePairs, generateSchedule, validateScore, computeStandings, TeamStanding } from './tournament.js';
import { TournamentState, Phase, saveState } from './state.js';

let state: TournamentState;
let selectedSwapPlayer: { teamIdx: number; playerSlot: 1 | 2 } | null = null;
let listenersAttached = false;

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

function setupPlayerEntry(onStateChange: () => void): void {
  document.getElementById('btn-generate-pairs')!.addEventListener('click', () => {
    // Read player names
    const players: string[] = [];
    for (let i = 0; i < 12; i++) {
      const input = document.getElementById(`player-${i}`) as HTMLInputElement;
      const name = input.value.trim();
      if (!name) {
        input.focus();
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 1500);
        return;
      }
      players.push(name);
    }

    // Check for duplicates
    const uniqueNames = new Set(players.map(n => n.toLowerCase()));
    if (uniqueNames.size < 12) {
      showToast('All player names must be unique!');
      return;
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
    state.teams = generatePairs(state.players);
    onStateChange();
    renderTeams();
  });

  document.getElementById('btn-confirm-teams')!.addEventListener('click', () => {
    state.rounds = generateSchedule();
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

  prevBtn.disabled = state.currentRound === 0;
  prevBtn.classList.toggle('hidden', state.currentRound === 0);

  if (isRoundComplete) {
    submitBtn.classList.add('hidden');
    if (isLastRound) {
      nextBtn.textContent = '🏆 See Results';
      nextBtn.classList.remove('hidden');
    } else {
      nextBtn.textContent = 'Next →';
      nextBtn.classList.remove('hidden');
      nextBtn.classList.remove('btn-secondary');
      nextBtn.classList.add('btn-primary');
    }
  } else {
    submitBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
  }

  // Description
  const descEl = document.getElementById('round-description')!;
  if (isRoundComplete) {
    descEl.textContent = 'Round complete! Review scores below.';
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

    const card = document.createElement('div');
    card.className = 'match-card' + (isCompleted ? ' completed' : '');

    const team1Label = `${team1.player1} & ${team1.player2}`;
    const team2Label = `${team2.player1} & ${team2.player2}`;

    const winner1 = isCompleted && match.score1! > match.score2! ? ' winner' : '';
    const winner2 = isCompleted && match.score2! > match.score1! ? ' winner' : '';

    card.innerHTML = `
      <div class="match-header">Match ${mIdx + 1}</div>
      <div class="match-body">
        <div class="match-team${winner1}">
          <span class="team-name">${team1Label}</span>
          <input type="number" class="score-input" data-match="${mIdx}" data-side="1"
                 value="${match.score1 !== null ? match.score1 : ''}"
                 min="0" step="1" placeholder="—" ${isCompleted ? 'disabled' : ''}>
        </div>
        <div class="match-vs">vs</div>
        <div class="match-team${winner2}">
          <span class="team-name">${team2Label}</span>
          <input type="number" class="score-input" data-match="${mIdx}" data-side="2"
                 value="${match.score2 !== null ? match.score2 : ''}"
                 min="0" step="1" placeholder="—" ${isCompleted ? 'disabled' : ''}>
        </div>
      </div>
      <div class="match-error" data-error="${mIdx}"></div>
    `;
    container.appendChild(card);
  });

  // Attach live validation to score inputs
  if (!isRoundComplete) {
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
      state.currentRound--;
      onStateChange();
      renderRound();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

    onStateChange();
    renderRound();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('btn-next-round')!.addEventListener('click', () => {
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

  document.getElementById('btn-reset')!.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the entire tournament? This cannot be undone.')) {
      (window as any).__resetTournament();
    }
  });
}
