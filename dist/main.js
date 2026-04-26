import { loadState, saveState, clearState, getDefaultState } from './state.js';
import { initUI } from './ui.js';
function main() {
    let state = loadState();
    function onStateChange() {
        saveState(state);
    }
    // Expose reset for the UI
    window.__resetTournament = () => {
        clearState();
        state = getDefaultState();
        initUI(state, onStateChange);
    };
    initUI(state, onStateChange);
}
document.addEventListener('DOMContentLoaded', main);
//# sourceMappingURL=main.js.map