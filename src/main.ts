import { loadState, saveState, clearState, getDefaultState } from './state.js';
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

  initUI(state, onStateChange);
}

document.addEventListener('DOMContentLoaded', main);
