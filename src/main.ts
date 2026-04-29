import { loadState, saveState, clearState, getDefaultState } from './state.js';
import { generatePairs } from './tournament.js';
import { initUI, renderCurrentPhase } from './ui.js';

function main(): void {
  let state = loadState();

  function onStateChange(): void {
    saveState(state);
  }

  // Expose reset for the UI
  (window as any).__resetTournament = () => {
    clearState();
    state = getDefaultState();
    initUI(state, onStateChange);
  };

  // Reset but keep player names — go straight to team generation
  (window as any).__resetKeepPlayers = () => {
    const players = [...state.players];
    clearState();
    state = getDefaultState();
    state.players = players;
    state.teams = generatePairs(players);
    state.phase = 'teams';
    saveState(state);
    initUI(state, onStateChange);
  };

  initUI(state, onStateChange);
}

document.addEventListener('DOMContentLoaded', main);
