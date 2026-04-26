const STORAGE_KEY = 'badminton-tournament';
export function getDefaultState() {
    return {
        phase: 'players',
        players: Array(12).fill(''),
        teams: [],
        rounds: [],
        currentRound: 0,
    };
}
export function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
export function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
        return getDefaultState();
    try {
        const parsed = JSON.parse(raw);
        const validPhases = ['players', 'teams', 'rounds', 'standings'];
        if (!parsed.phase ||
            !validPhases.includes(parsed.phase) ||
            !Array.isArray(parsed.players) ||
            !Array.isArray(parsed.teams) ||
            !Array.isArray(parsed.rounds) ||
            typeof parsed.currentRound !== 'number' ||
            parsed.currentRound < 0) {
            return getDefaultState();
        }
        return parsed;
    }
    catch {
        return getDefaultState();
    }
}
export function clearState() {
    localStorage.removeItem(STORAGE_KEY);
}
//# sourceMappingURL=state.js.map