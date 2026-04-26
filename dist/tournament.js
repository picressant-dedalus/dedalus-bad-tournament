// Shuffle array in-place (Fisher-Yates)
export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
// Generate 6 pairs from 12 players
export function generatePairs(players) {
    const shuffled = shuffle(players);
    const teams = [];
    for (let i = 0; i < 12; i += 2) {
        teams.push({
            id: teams.length,
            player1: shuffled[i],
            player2: shuffled[i + 1],
        });
    }
    return teams;
}
// Generate round-robin schedule using circle method
// 6 teams → 5 rounds × 3 matches each
export function generateSchedule() {
    const n = 6;
    const rounds = [];
    const teamIndices = [0, 1, 2, 3, 4, 5];
    for (let r = 0; r < n - 1; r++) {
        const matches = [];
        // Pair first with last, second with second-to-last, etc.
        for (let i = 0; i < n / 2; i++) {
            matches.push({
                team1Index: teamIndices[i],
                team2Index: teamIndices[n - 1 - i],
                score1: null,
                score2: null,
            });
        }
        rounds.push({ matches });
        // Rotate: fix position 0, rotate the rest
        const last = teamIndices.pop();
        teamIndices.splice(1, 0, last);
    }
    return rounds;
}
// Validate a match score: winner ≥21 and at least 2-point lead
export function validateScore(score1, score2) {
    if (!Number.isInteger(score1) || !Number.isInteger(score2)) {
        return "Scores must be whole numbers";
    }
    if (score1 < 0 || score2 < 0) {
        return "Scores cannot be negative";
    }
    if (score1 === score2) {
        return "Scores cannot be equal — there must be a winner";
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
export function computeStandings(teams, rounds) {
    const standings = teams.map((_, i) => ({
        teamIndex: i,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
    }));
    // Head-to-head map: h2h[a][b] = true means a beat b
    const h2h = new Map();
    for (let i = 0; i < teams.length; i++) {
        h2h.set(i, new Set());
    }
    for (const round of rounds) {
        for (const match of round.matches) {
            if (match.score1 === null || match.score2 === null)
                continue;
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
            }
            else {
                s2.wins++;
                s1.losses++;
                h2h.get(match.team2Index).add(match.team1Index);
            }
        }
    }
    for (const s of standings) {
        s.pointDiff = s.pointsFor - s.pointsAgainst;
    }
    // Sort: wins desc, then resolve ties in groups
    standings.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
    // Resolve tied groups with head-to-head when exactly 2 teams are tied
    const resolved = [];
    let i = 0;
    while (i < standings.length) {
        let j = i;
        while (j < standings.length && standings[j].wins === standings[i].wins)
            j++;
        const group = standings.slice(i, j);
        if (group.length === 2) {
            const [a, b] = group;
            if (h2h.get(b.teamIndex).has(a.teamIndex)) {
                group.reverse();
            }
        }
        // For 3+ way ties, keep point-diff order (already sorted above)
        resolved.push(...group);
        i = j;
    }
    return resolved;
}
//# sourceMappingURL=tournament.js.map