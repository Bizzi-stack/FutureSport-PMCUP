/**
 * Production Match Engine & Stat Synchronization Utilities
 * Used by LiveMatch.jsx, App.jsx, and test suites.
 */

/**
 * Standard initialization template for a player's in-match live stats.
 * Preserves 0 for minutesPlayed (never defaults to 90).
 */
export const initPlayerStats = (playerId) => ({
    minutesPlayed: 0,
    Goals: 0,
    Assists: 0,
    Shots: 0,
    'Shots on Target': 0,
    'Blocked Shots': 0,
    'Pass Completed': 0,
    'Key Passes': 0,
    'Successful Tackles': 0,
    'Interceptions': 0,
    'Fouls Committed': 0,
    'Corners Taken': 0,
    yellowCards: 0,
    redCards: 0,
    Saves: 0,
    'Penalties Saved': 0,
    'Free Kick Saves': 0,
    ownGoals: 0,
    _updatedAt: 0,
    _statUpdatedAt: {},
    _statSeq: {},
    _statOp: {}
});

/**
 * Merges player statistics across concurrent clients using field-level logical timestamps and sequence ordering.
 * 
 * Guarantees:
 * 1. Untouched fields never inherit general player timestamps (later assist/foul never overwrites earlier goal with zero).
 * 2. Newer field timestamps are preserved even when value is unchanged, preventing stale overwrites.
 * 3. Equal timestamps resolve deterministically with ordering that supports undos and decrements.
 * 4. Stale updates and reversed message arrivals are safely rejected.
 */
export function syncPlayerStats(localStats = {}, incomingStats = {}, localMatchTime = 0, incMatchTime = 0) {
    if (!incomingStats || typeof incomingStats !== 'object') {
        return { next: localStats, hasChanges: false };
    }

    const next = { ...localStats };
    let hasChanges = false;

    Object.keys(incomingStats).forEach(pId => {
        const inc = incomingStats[pId];
        const cur = localStats[pId];

        if (!cur) {
            next[pId] = inc;
            hasChanges = true;
            return;
        }

        const curPlayerTime = cur._updatedAt || localMatchTime || 0;
        const incPlayerTime = inc._updatedAt || incMatchTime || 0;

        const mergedPlayer = { ...cur };
        let playerChanged = false;

        const curStatTimes = cur._statUpdatedAt || {};
        const incStatTimes = inc._statUpdatedAt || {};
        const mergedStatTimes = { ...curStatTimes };

        const curStatSeq = cur._statSeq || {};
        const incStatSeq = inc._statSeq || {};
        const mergedStatSeq = { ...curStatSeq };

        const curStatOp = cur._statOp || {};
        const incStatOp = inc._statOp || {};
        const mergedStatOp = { ...curStatOp };

        // Union of all stat keys across cur and inc
        const allKeys = new Set([...Object.keys(cur), ...Object.keys(inc)]);

        allKeys.forEach(k => {
            if (k === '_updatedAt' || k === '_statUpdatedAt' || k === '_statSeq' || k === '_statOp' || k === '_clientId' || k === '_updatedBy') return;

            const curVal = cur[k];
            const incVal = inc[k];

            // CRITICAL FIX 1: Untouched fields never inherit player latest timestamp!
            // If a field is not explicitly tracked in _statUpdatedAt, its timestamp is 0 (untouched baseline).
            // Only if both objects completely lack _statUpdatedAt (pure legacy) do we fall back to player-level time.
            const hasExplicitLocalMap = cur._statUpdatedAt && typeof cur._statUpdatedAt === 'object';
            const hasExplicitIncMap = inc._statUpdatedAt && typeof inc._statUpdatedAt === 'object';

            let curTime = 0;
            if (hasExplicitLocalMap) {
                curTime = curStatTimes[k] != null ? curStatTimes[k] : 0;
            } else {
                curTime = curVal !== undefined ? curPlayerTime : 0;
            }

            let incTime = 0;
            if (hasExplicitIncMap) {
                incTime = incStatTimes[k] != null ? incStatTimes[k] : 0;
            } else {
                incTime = incVal !== undefined ? incPlayerTime : 0;
            }

            const curSeq = curStatSeq[k] != null ? curStatSeq[k] : 0;
            const incSeq = incStatSeq[k] != null ? incStatSeq[k] : 0;

            const curOp = curStatOp[k] || 'set';
            const incOp = incStatOp[k] || 'set';

            if (incVal !== undefined && curVal === undefined) {
                mergedPlayer[k] = incVal;
                mergedStatTimes[k] = incTime;
                mergedStatSeq[k] = incSeq;
                mergedStatOp[k] = incOp;
                playerChanged = true;
            } else if (curVal !== undefined && incVal === undefined) {
                // Keep local untouched
            } else if (incTime > curTime) {
                // Incoming is strictly newer for this specific stat
                if (mergedPlayer[k] !== incVal) {
                    mergedPlayer[k] = incVal;
                    playerChanged = true;
                }
                // CRITICAL FIX 2: Always persist newer field timestamps even when value stays unchanged
                if (mergedStatTimes[k] !== incTime) {
                    mergedStatTimes[k] = incTime;
                    playerChanged = true;
                }
                mergedStatSeq[k] = incSeq;
                mergedStatOp[k] = incOp;
            } else if (incTime === curTime) {
                // Equal timestamps: resolve deterministically supporting undos
                if (incSeq > curSeq) {
                    // Higher operation sequence wins
                    if (mergedPlayer[k] !== incVal) {
                        mergedPlayer[k] = incVal;
                        playerChanged = true;
                    }
                    mergedStatSeq[k] = incSeq;
                    mergedStatOp[k] = incOp;
                } else if (curSeq > incSeq) {
                    // Local sequence is ahead, keep local
                } else {
                    // Same timestamp and sequence:
                    // If one is an undo operation, the undo takes precedence over an un-undone stat
                    if (incOp === 'undo' && curOp !== 'undo') {
                        mergedPlayer[k] = incVal;
                        mergedStatOp[k] = 'undo';
                        playerChanged = true;
                    } else if (curOp === 'undo' && incOp !== 'undo') {
                        // Local undo wins
                    } else if (curVal !== incVal) {
                        // CRITICAL FIX 3: Replace Math.max with deterministic ordering supporting undo.
                        const incClient = inc._clientId || inc._updatedBy || '';
                        const curClient = cur._clientId || cur._updatedBy || '';
                        if (incClient && curClient && incClient !== curClient) {
                            if (incClient > curClient) {
                                mergedPlayer[k] = incVal;
                                playerChanged = true;
                            }
                        } else if (typeof curVal === 'number' && typeof incVal === 'number') {
                            // If values differ at identical time without sequence, choose lower value to support undos
                            const lowerVal = Math.min(curVal, incVal);
                            if (mergedPlayer[k] !== lowerVal) {
                                mergedPlayer[k] = lowerVal;
                                playerChanged = true;
                            }
                        }
                    }
                }
            } else {
                // curTime > incTime: local is strictly newer, preserve local
            }
        });

        if (playerChanged) {
            mergedPlayer._updatedAt = Math.max(curPlayerTime, incPlayerTime);
            mergedPlayer._statUpdatedAt = mergedStatTimes;
            mergedPlayer._statSeq = mergedStatSeq;
            mergedPlayer._statOp = mergedStatOp;
            next[pId] = mergedPlayer;
            hasChanges = true;
        }
    });

    return { next, hasChanges };
}

/**
 * Merges timeline events across clients while respecting tombstones (undone events).
 */
function eventRevision(event) {
    return Math.max(...['timestamp', 'editedAt', 'overturnedAt'].map(key => Number(event[key]) || 0));
}

function stableEventValue(value) {
    if (Array.isArray(value)) return value.map(stableEventValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableEventValue(value[key])]));
    }
    return value;
}

function chooseEvent(a, b) {
    if (!a) return b;
    const timeDelta = eventRevision(b) - eventRevision(a);
    if (timeDelta) return timeDelta > 0 ? b : a;
    const seqDelta = (Number(b._eventSeq) || 0) - (Number(a._eventSeq) || 0);
    if (seqDelta) return seqDelta > 0 ? b : a;
    // At indistinguishable revisions, preserve an overturn; otherwise use a
    // stable tie-break so both clients converge regardless of delivery order.
    if (!!a.overturned !== !!b.overturned) return b.overturned ? b : a;
    return JSON.stringify(stableEventValue(b)) > JSON.stringify(stableEventValue(a)) ? b : a;
}

export function syncTimeline(localTimeline = [], incomingTimeline = [], tombstoneEventIds = []) {
    const tombstoneSet = new Set((tombstoneEventIds || []).map(String));
    const map = new Map();

    (localTimeline || []).forEach(ev => {
        if (!ev) return;
        const key = String(ev.id || `${ev.minute}-${ev.type}-${ev.playerId || ev.team || ''}`);
        if (!tombstoneSet.has(key) && (!ev.id || !tombstoneSet.has(String(ev.id)))) {
            map.set(key, chooseEvent(map.get(key), ev));
        }
    });

    (incomingTimeline || []).forEach(ev => {
        if (!ev) return;
        const key = String(ev.id || `${ev.minute}-${ev.type}-${ev.playerId || ev.team || ''}`);
        if (!tombstoneSet.has(key) && (!ev.id || !tombstoneSet.has(String(ev.id)))) {
            map.set(key, chooseEvent(map.get(key), ev));
        }
    });

    const merged = Array.from(map.values());
    merged.sort((a, b) => (a.elapsed ?? (a.minute * 60) ?? 0) - (b.elapsed ?? (b.minute * 60) ?? 0));
    return merged;
}

/**
 * Merges tombstone lists across clients as a set union.
 */
export function mergeTombstones(localTombstones = [], incomingTombstones = []) {
    const set = new Set([
        ...(Array.isArray(localTombstones) ? localTombstones : []),
        ...(Array.isArray(incomingTombstones) ? incomingTombstones : [])
    ].map(String));
    return Array.from(set);
}

/**
 * Derives home and away scores dynamically from player goals and opposing own goals.
 */
export function calculateScores(homePlayers = [], awayPlayers = [], playerStats = {}) {
    const homePids = (homePlayers || []).map(String);
    const awayPids = (awayPlayers || []).map(String);

    const homeGoals = homePids.reduce((t, id) => t + (playerStats[id]?.Goals ?? 0), 0);
    const homeOwnGoals = awayPids.reduce((t, id) => t + (playerStats[id]?.ownGoals ?? 0), 0);

    const awayGoals = awayPids.reduce((t, id) => t + (playerStats[id]?.Goals ?? 0), 0);
    const awayOwnGoals = homePids.reduce((t, id) => t + (playerStats[id]?.ownGoals ?? 0), 0);

    return {
        homeScore: homeGoals + homeOwnGoals,
        awayScore: awayGoals + awayOwnGoals
    };
}

/**
 * Merges two versions of a match object (e.g. from concurrent clients or cloud sync).
 * Merges playerStats using field-level logical clocks, timeline events using tombstones,
 * and updates scores accordingly.
 */
export function mergeMatchStates(localMatch, incomingMatch) {
    if (!localMatch) return incomingMatch;
    if (!incomingMatch) return localMatch;

    const localTime = Number(localMatch.updatedAt || localMatch.liveState?.updatedAt || 0);
    const incTime = Number(incomingMatch.updatedAt || incomingMatch.liveState?.updatedAt || 0);

    const localTombstones = localMatch.tombstoneEventIds || localMatch.liveState?.tombstoneEventIds || [];
    const incTombstones = incomingMatch.tombstoneEventIds || incomingMatch.liveState?.tombstoneEventIds || [];
    const mergedTombstones = mergeTombstones(localTombstones, incTombstones);

    const localTimeline = localMatch.timeline || localMatch.liveState?.timeline || [];
    const incTimeline = incomingMatch.timeline || incomingMatch.liveState?.timeline || [];
    const mergedTimeline = syncTimeline(localTimeline, incTimeline, mergedTombstones);

    const localPStats = localMatch.playerStats || localMatch.liveState?.playerStats || {};
    const incPStats = incomingMatch.playerStats || incomingMatch.liveState?.playerStats || {};
    const { next: mergedPlayerStats } = syncPlayerStats(localPStats, incPStats, localTime, incTime);

    // Pick latest root fields
    const base = incTime > localTime ? { ...localMatch, ...incomingMatch } : { ...incomingMatch, ...localMatch };

    // Squad selection preservation: Select by newest lastModified / submittedAt timestamp,
    // and protect against accidental null/undefined clobbering of configured squads.
    const getSquadTimestamp = (sq, fallbackMatchTime = 0) => {
        if (!sq) return 0;
        const candidates = [sq.lastModified, sq.submittedAt, sq.confirmedAt, sq.validatedAt, sq.updatedAt, fallbackMatchTime];
        for (const val of candidates) {
            if (val == null) continue;
            if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
            if (typeof val === 'string') {
                const parsed = Date.parse(val);
                if (!isNaN(parsed) && parsed > 0) return parsed;
                const num = Number(val);
                if (!isNaN(num) && num > 0) return num;
            }
        }
        return 0;
    };

    const countSelectedPlayers = (sq) => {
        if (!sq) return 0;
        const xiCount = (sq.startingXI || []).filter(Boolean).length;
        const benchCount = (sq.benchPlayers || sq.substitutes || []).filter(Boolean).length;
        return xiCount + benchCount;
    };

    const resolveSquad = (localSq, incSq) => {
        if (localSq && !incSq) return localSq;
        if (!localSq && incSq) return incSq;
        if (!localSq && !incSq) return null;

        const localCount = countSelectedPlayers(localSq);
        const incCount = countSelectedPlayers(incSq);

        if (localCount > 0 && incCount === 0) return localSq;
        if (incCount > 0 && localCount === 0) return incSq;

        const localHasExplicit = !!(localSq.lastModified || localSq.submittedAt || localSq.confirmedAt);
        const incHasExplicit = !!(incSq.lastModified || incSq.submittedAt || incSq.confirmedAt);

        // A squad with explicit modification/submission always beats an unmodified prepopulated squad
        if (localHasExplicit && !incHasExplicit) return localSq;
        if (!localHasExplicit && incHasExplicit) return incSq;

        const localMod = getSquadTimestamp(localSq, localTime);
        const incMod = getSquadTimestamp(incSq, incTime);

        if (incMod > 0 && localMod > 0) {
            return incMod >= localMod ? incSq : localSq;
        }
        if (incMod > 0 && localMod === 0) return incSq;
        if (localMod > 0 && incMod === 0) return localSq;

        if (incCount !== localCount) {
            return incCount > localCount ? incSq : localSq;
        }

        return incTime >= localTime ? incSq : localSq;
    };

    const resolvedHomeSquad = resolveSquad(localMatch.homeSquadSelection, incomingMatch.homeSquadSelection);
    const resolvedAwaySquad = resolveSquad(localMatch.awaySquadSelection, incomingMatch.awaySquadSelection);

    const squadHomeIds = [
        ...(resolvedHomeSquad?.startingXI || []),
        ...(resolvedHomeSquad?.benchPlayers || resolvedHomeSquad?.substitutes || [])
    ].filter(Boolean);
    const baseHomePlayers = (incomingMatch.homePlayers && incomingMatch.homePlayers.length > 0) 
        ? incomingMatch.homePlayers 
        : ((localMatch.homePlayers && localMatch.homePlayers.length > 0) ? localMatch.homePlayers : (base.homePlayers || []));
    const finalHomePlayers = Array.from(new Set([...squadHomeIds, ...baseHomePlayers]));

    const squadAwayIds = [
        ...(resolvedAwaySquad?.startingXI || []),
        ...(resolvedAwaySquad?.benchPlayers || resolvedAwaySquad?.substitutes || [])
    ].filter(Boolean);
    const baseAwayPlayers = (incomingMatch.awayPlayers && incomingMatch.awayPlayers.length > 0) 
        ? incomingMatch.awayPlayers 
        : ((localMatch.awayPlayers && localMatch.awayPlayers.length > 0) ? localMatch.awayPlayers : (base.awayPlayers || []));
    const finalAwayPlayers = Array.from(new Set([...squadAwayIds, ...baseAwayPlayers]));

    const homePlayersList = (finalHomePlayers && finalHomePlayers.length > 0)
        ? finalHomePlayers
        : (resolvedHomeSquad?.startingXI || []);
    const awayPlayersList = (finalAwayPlayers && finalAwayPlayers.length > 0)
        ? finalAwayPlayers
        : (resolvedAwaySquad?.startingXI || []);

    let homeScore = base.homeScore;
    let awayScore = base.awayScore;

    if (homePlayersList.length > 0 || awayPlayersList.length > 0) {
        const calculated = calculateScores(homePlayersList, awayPlayersList, mergedPlayerStats);
        homeScore = calculated.homeScore;
        awayScore = calculated.awayScore;
    } else if (mergedTimeline && mergedTimeline.length > 0) {
        const rec = recalculateMatchScores(base, mergedPlayerStats, mergedTimeline);
        homeScore = rec.homeScore;
        awayScore = rec.awayScore;
    }

    const merged = {
        ...base,
        ...(resolvedHomeSquad !== undefined ? { homeSquadSelection: resolvedHomeSquad } : {}),
        ...(resolvedAwaySquad !== undefined ? { awaySquadSelection: resolvedAwaySquad } : {}),
        homePlayers: finalHomePlayers,
        awayPlayers: finalAwayPlayers,
        updatedAt: Math.max(localTime, incTime),
        version: Math.max(Number(localMatch.version || 0), Number(incomingMatch.version || 0)) + 1,
        homeScore: homeScore ?? base.homeScore,
        awayScore: awayScore ?? base.awayScore,
        playerStats: mergedPlayerStats,
        timeline: mergedTimeline,
        tombstoneEventIds: mergedTombstones
    };

    if (merged.liveState) {
        merged.liveState = {
            ...merged.liveState,
            updatedAt: merged.updatedAt,
            version: merged.version,
            playerStats: mergedPlayerStats,
            timeline: mergedTimeline,
            tombstoneEventIds: mergedTombstones
        };
    }

    // Terminal Status Immunity: A finished match must never revert to 'live'
    const terminalStatuses = ['completed', 'approved', 'refereed'];
    const localTerminal = terminalStatuses.includes(localMatch.status);
    const incTerminal = terminalStatuses.includes(incomingMatch.status);
    
    if (localTerminal || incTerminal) {
        // If both are terminal, prefer the incoming one if it has a newer timestamp, else local.
        // Actually, 'approved' > 'refereed' > 'completed'. Let's just take the most advanced or if equal, the newer one.
        // For simplicity, just use base.status if base is terminal, otherwise use the one that is terminal.
        const winningStatus = terminalStatuses.includes(base.status) ? base.status : (incTerminal ? incomingMatch.status : localMatch.status);
        
        merged.status = winningStatus;
        merged.isFinished = true;
        if (merged.liveState) {
            merged.liveState.status = winningStatus;
            merged.liveState.isRunning = false;
            if (merged.liveState.period !== 'FT' && merged.liveState.period !== 'Penalty' && merged.liveState.period !== 'AET') {
                 merged.liveState.period = 'FT';
            }
        }
    }

    return merged;
}


/**
 * Resolves the active goalkeeper for a given team side.
 * 
 * Rules:
 * 1. Checks lineup starting XI and student database for known Goalkeeper.
 * 2. NEVER infers goalkeeper status from an ID ending in '-1' or '_1'.
 * 3. NEVER overrides an explicit outfield position (Defender, Midfielder, Forward, Striker, etc.).
 * 4. Follows substitution history.
 * 5. If ambiguous, returns { isAmbiguous: true, goalkeeperId: null }.
 */
export function resolveActiveGoalkeeper({ side, matchData, allStudents = [] }) {
    if (!matchData) return { goalkeeperId: null, isAmbiguous: true, message: 'No match data provided.' };

    const studentsList = Array.isArray(allStudents) ? allStudents : [];
    const getStudent = (pid) => studentsList.find(s => String(s?.id) === String(pid) || s?.aliasIds?.map(String).includes(String(pid)));

    const isOutfieldPosition = (posStr) => {
        const p = String(posStr || '').toLowerCase();
        return p.includes('def') || p.includes('back') || p.includes('mid') || 
               p.includes('fwd') || p.includes('striker') || p.includes('wing') ||
               p.includes('cb') || p.includes('lb') || p.includes('rb') || p.includes('cm') || p.includes('st');
    };

    const isGoalkeeperStudent = (st, pid) => {
        if (st) {
            const pos = String(st.position || st.role || '').toLowerCase();
            // If explicitly outfield, NEVER infer goalkeeper!
            if (isOutfieldPosition(pos)) return false;
            if (pos.includes('goalkeeper') || pos === 'gk' || Number(st.jerseyNumber) === 1) return true;
        }
        if (pid) {
            const pStr = String(pid).toLowerCase();
            // Only accept if explicitly named gk/goalkeeper (NO -1 or _1 suffix heuristics!)
            if (pStr.includes('gk') || pStr.includes('goalkeeper')) return true;
        }
        return false;
    };

    const selection = side === 'home' ? matchData.homeSquadSelection : matchData.awaySquadSelection;
    const roster = side === 'home' ? (matchData.homePlayers || []) : (matchData.awayPlayers || []);
    const startersList = (selection?.startingXI && selection.startingXI.length > 0)
        ? selection.startingXI
        : ((matchData[side + 'Starters'] && matchData[side + 'Starters'].length > 0)
            ? matchData[side + 'Starters']
            : roster.slice(0, 11));

    // Determine initial starting goalkeeper
    let startingGkId = null;
    if (startersList && startersList.length > 0) {
        for (const pId of startersList) {
            const st = getStudent(pId);
            if (isGoalkeeperStudent(st, pId)) {
                startingGkId = String(pId);
                break;
            }
        }
    }

    // Combine timeline substitutions and approved substitutionRequests
    const rawTimelineSubs = (matchData.timeline || [])
        .filter(e => e.type === 'substitution' && (e.team === side || e.teamId === matchData[side + 'TeamId']))
        .map(e => ({
            id: e.id,
            outId: String(e.outPlayerId || e.playerOff || ''),
            inId: String(e.inPlayerId || e.playerIn || ''),
            inPosition: e.inPosition || e.inPlayerPosition || e.position || null,
            time: e.elapsed ?? (e.minute * 60) ?? 0
        }));

    const rawReqSubs = (matchData.substitutionRequests || [])
        .filter(r => r.status === 'approved' && (r.team === side || r.side === side || r.teamId === matchData[side + 'TeamId']))
        .map(r => ({
            id: r.id,
            outId: String(r.playerOff || r.outPlayerId || ''),
            inId: String(r.playerIn || r.inPlayerId || ''),
            inPosition: r.inPosition || r.inPlayerPosition || r.position || null,
            time: r.minute ? r.minute * 60 : 0
        }));

    // Deduplicate substitutions by id or (outId, inId) pair
    const seenSubs = new Set();
    const allSubs = [];
    [...rawTimelineSubs, ...rawReqSubs].forEach(sub => {
        const key = sub.id || `${sub.outId}->${sub.inId}`;
        if (!seenSubs.has(key)) {
            seenSubs.add(key);
            allSubs.push(sub);
        }
    });
    allSubs.sort((a, b) => a.time - b.time);

    let currentGkId = startingGkId;
    let isAmbiguous = !currentGkId;

    for (const sub of allSubs) {
        const { outId, inId, inPosition } = sub;
        const inPosLower = String(inPosition || '').toLowerCase();
        const isExplicitGk = inPosLower.includes('goalkeeper') || inPosLower === 'gk';

        if (isExplicitGk) {
            currentGkId = inId;
            isAmbiguous = false;
        } else if (currentGkId && outId === currentGkId) {
            // Active goalkeeper was subbed out without explicit inPosition field
            const incomingStudent = getStudent(inId);
            if (isGoalkeeperStudent(incomingStudent, inId)) {
                currentGkId = inId;
                isAmbiguous = false;
            } else {
                currentGkId = null;
                isAmbiguous = true;
            }
        }
    }

    if (isAmbiguous || !currentGkId) {
        return {
            goalkeeperId: null,
            isAmbiguous: true,
            message: 'Goalkeeper substitution position not specified. Please select the active goalkeeper.'
        };
    }

    return {
        goalkeeperId: currentGkId,
        isAmbiguous: false
    };
}

/**
 * Validates whether a player ID or alias matches a student record.
 */
export function matchesStudentId(studentId, student) {
    if (!student || studentId == null) return false;
    const targetStr = String(studentId).trim();
    if (String(student.id).trim() === targetStr) return true;
    if (student.aliasIds && Array.isArray(student.aliasIds)) {
        if (student.aliasIds.some(alias => String(alias).trim() === targetStr)) return true;
    }
    return false;
}

/**
 * Detects whether a match belongs to the Prime Minister's Cup (PMC) competition
 * versus the National Schools League (NSSL) testing sandbox.
 */
export function isPmcMatch(match) {
    if (!match) return false;
    if (match.isSandboxMatch === true || match.isUclMatch === true) return false;
    if (String(match.tournament || '').toLowerCase().includes('champions league') ||
        String(match.tournament || '').toLowerCase().includes('ucl') ||
        String(match.tournamentId || '').toLowerCase() === 'ucl' ||
        String(match.id || '').toLowerCase().includes('ucl') ||
        String(match.homeTeamId || '').toLowerCase().includes('ucl-club') ||
        String(match.awayTeamId || '').toLowerCase().includes('ucl-club')) {
        return false;
    }
    return match.isPmc === true ||
        match.ageGroup === 'PMC' ||
        String(match.id || '').toLowerCase().includes('pmc') ||
        String(match.tournament || '').toLowerCase().includes('prime minister') ||
        String(match.tournament || '').toLowerCase().includes('pmc') ||
        String(match.tournamentId || '').toLowerCase().includes('pmc') ||
        String(match.homeTeamId || '').toLowerCase().includes('pmc-club') ||
        String(match.awayTeamId || '').toLowerCase().includes('pmc-club') ||
        String(match.homeTeam || '').toLowerCase().includes('pmc') ||
        String(match.awayTeam || '').toLowerCase().includes('pmc');
}

export function isPmcTournament(tourn) {
    if (!tourn) return false;
    const t = String(tourn).toLowerCase();
    if (t === 'ucl' || t.includes('champions league')) return false;
    return t === 'pmc' || t.includes('prime minister');
}

/**
 * Applies match approval idempotently using replaceable contributions and explicit provenance.
 * 
 * Rules:
 * 1. Does NOT infer a match was pre-counted from status === 'approved' or teamSheetApproved.
 * 2. Only matches explicitly in options.legacyCountedMatchIds or student._legacyProvenance.preCountedMatchIds
 *    are subtracted on initial baseline freeze.
 * 3. Preserves 0 minutesPlayed and increments gamesPlayed only for players who actually participated.
 * 4. Re-approving or correcting a match stat is 100% idempotent.
 */
export function applyMatchContributions(students = [], updatedMatch, options = {}) {
    if (!Array.isArray(students) || !updatedMatch) return students;

    const isPmc = isPmcMatch(updatedMatch);
    const defaultYear = isPmc ? '2026-2027' : '2026';
    const rawMatchYear = updatedMatch.year ? String(updatedMatch.year) : defaultYear;
    const matchTerm = String(updatedMatch.matchday || updatedMatch.term || 'Matchday 1');
    const legacyCountedMatchIds = new Set([
        ...(Array.isArray(options.legacyCountedMatchIds) ? options.legacyCountedMatchIds : []),
        ...(Array.isArray(options.preCountedMatchIds) ? options.preCountedMatchIds : [])
    ]);

    // Reconcile goalkeeper saves from timeline if playerStats is missing them
    const effectivePlayerStats = updatedMatch.playerStats ? { ...updatedMatch.playerStats } : {};
    if (Array.isArray(updatedMatch.timeline) && updatedMatch.timeline.length > 0) {
        const homeGk = students.find(s =>
            (s.schoolId === updatedMatch.homeTeamId || s.schoolId === updatedMatch.homeSchoolId) &&
            (s.position === 'Goalkeeper' || s.position === 'GK')
        );
        const awayGk = students.find(s =>
            (s.schoolId === updatedMatch.awayTeamId || s.schoolId === updatedMatch.awaySchoolId) &&
            (s.position === 'Goalkeeper' || s.position === 'GK')
        );

        let homeSavedShots = 0; // Opposition away GK made save
        let awaySavedShots = 0; // Opposition home GK made save

        updatedMatch.timeline.forEach(e => {
            const isSaved = e.result === 'saved' || (e.type === 'shotOnTarget' && e.result !== 'goal');
            if (!isSaved) return;

            const isHomeShot = e.team === 'home' || e.teamId === updatedMatch.homeTeamId;
            const isAwayShot = e.team === 'away' || e.teamId === updatedMatch.awayTeamId;

            if (e.oppGkId) {
                if (!effectivePlayerStats[e.oppGkId]) {
                    effectivePlayerStats[e.oppGkId] = initPlayerStats(e.oppGkId);
                }
                effectivePlayerStats[e.oppGkId].Saves = (effectivePlayerStats[e.oppGkId].Saves || 0) + 1;
            } else if (isHomeShot && awayGk) {
                homeSavedShots++;
            } else if (isAwayShot && homeGk) {
                awaySavedShots++;
            }
        });

        if (awayGk && homeSavedShots > 0) {
            const gkId = awayGk.id;
            const currentSaves = effectivePlayerStats[gkId]?.Saves || 0;
            if (currentSaves < homeSavedShots) {
                if (!effectivePlayerStats[gkId]) effectivePlayerStats[gkId] = initPlayerStats(gkId);
                effectivePlayerStats[gkId].Saves = Math.max(currentSaves, homeSavedShots);
            }
        }

        if (homeGk && awaySavedShots > 0) {
            const gkId = homeGk.id;
            const currentSaves = effectivePlayerStats[gkId]?.Saves || 0;
            if (currentSaves < awaySavedShots) {
                if (!effectivePlayerStats[gkId]) effectivePlayerStats[gkId] = initPlayerStats(gkId);
                effectivePlayerStats[gkId].Saves = Math.max(currentSaves, awaySavedShots);
            }
        }
    }

    return students.map(student => {
        let matchYear = rawMatchYear;
        if (student.performance && !student.performance[matchYear] && student.performance['2026-2027']) {
            matchYear = '2026-2027';
        } else if (student.performance && !student.performance[matchYear] && student.performance['2026']) {
            matchYear = '2026';
        }

        let stats = null;
        if (effectivePlayerStats) {
            const matchedKey = Object.keys(effectivePlayerStats).find(k => matchesStudentId(k, student));
            if (matchedKey) stats = effectivePlayerStats[matchedKey];
        }

        const newStudent = { ...student };
        const studentLegacySet = new Set([
            ...legacyCountedMatchIds,
            ...(Array.isArray(student._legacyProvenance?.preCountedMatchIds) ? student._legacyProvenance.preCountedMatchIds : []),
            ...(Array.isArray(student._preCountedMatchIds) ? student._preCountedMatchIds : [])
        ]);

        const isMatchPreCountedInLegacy = studentLegacySet.has(updatedMatch.id);

        if (!newStudent._matchContributions) {
            newStudent._matchContributions = {};
        }

        // Initialize baselines if not present
        if (!newStudent._baselinePerformance) {
            const rawPerf = newStudent.performance ? JSON.parse(JSON.stringify(newStudent.performance)) : {};
            // CRITICAL FIX: Only subtract if this match was EXPLICITLY registered as pre-counted in legacy history!
            if (isMatchPreCountedInLegacy && stats) {
                if (rawPerf[matchYear] && rawPerf[matchYear][matchTerm]) {
                    const termPerf = rawPerf[matchYear][matchTerm];
                    Object.keys(stats).forEach(statKey => {
                        if (statKey !== 'minutesPlayed' && statKey !== 'yellowCards' && statKey !== 'redCards' && !statKey.startsWith('_')) {
                            termPerf[statKey] = Math.max(0, (termPerf[statKey] || 0) - (stats[statKey] || 0));
                        }
                    });
                }
            }
            newStudent._baselinePerformance = rawPerf;
        }

        if (!newStudent._baselineMatchStats) {
            const rawMatchStats = newStudent.matchStats ? JSON.parse(JSON.stringify(newStudent.matchStats)) : {};
            if (isMatchPreCountedInLegacy && stats) {
                if (rawMatchStats[matchYear] && rawMatchStats[matchYear][matchTerm]) {
                    const termMatch = rawMatchStats[matchYear][matchTerm];
                    const mins = typeof stats.minutesPlayed === 'number' ? stats.minutesPlayed : 0;
                    termMatch.gamesPlayed = Math.max(0, (termMatch.gamesPlayed || 0) - 1);
                    termMatch.minutesPlayed = Math.max(0, (termMatch.minutesPlayed || 0) - mins);
                    termMatch.yellowCards = Math.max(0, (termMatch.yellowCards || 0) - (stats.yellowCards || 0));
                    termMatch.redCards = Math.max(0, (termMatch.redCards || 0) - (stats.redCards || 0));
                }
            }
            newStudent._baselineMatchStats = rawMatchStats;
        }

        // Explicit provenance record
        newStudent._legacyProvenance = {
            migrated: true,
            preCountedMatchIds: Array.from(studentLegacySet)
        };

        // Update match contribution
        if (stats) {
            newStudent._matchContributions[updatedMatch.id] = {
                year: matchYear,
                term: matchTerm,
                stats: { ...stats }
            };
        } else if (newStudent._matchContributions[updatedMatch.id]) {
            delete newStudent._matchContributions[updatedMatch.id];
        }

        // Rebuild performance and matchStats from baseline + contributions
        const rebuiltPerf = newStudent._baselinePerformance ? JSON.parse(JSON.stringify(newStudent._baselinePerformance)) : {};
        const rebuiltMatchStats = newStudent._baselineMatchStats ? JSON.parse(JSON.stringify(newStudent._baselineMatchStats)) : {};

        Object.values(newStudent._matchContributions).forEach(contrib => {
            const cYear = contrib.year;
            const cTerm = contrib.term;
            const cStats = contrib.stats;

            if (!rebuiltPerf[cYear]) rebuiltPerf[cYear] = {};
            if (!rebuiltPerf[cYear][cTerm]) rebuiltPerf[cYear][cTerm] = {};
            const termPerf = rebuiltPerf[cYear][cTerm];

            Object.keys(cStats).forEach(statKey => {
                if (statKey !== 'minutesPlayed' && statKey !== 'yellowCards' && statKey !== 'redCards' && !statKey.startsWith('_')) {
                    termPerf[statKey] = (termPerf[statKey] || 0) + (cStats[statKey] || 0);
                }
            });

            if (!rebuiltMatchStats[cYear]) rebuiltMatchStats[cYear] = {};
            if (!rebuiltMatchStats[cYear][cTerm]) {
                rebuiltMatchStats[cYear][cTerm] = { gamesPlayed: 0, minutesPlayed: 0, yellowCards: 0, redCards: 0 };
            }
            const termMatch = rebuiltMatchStats[cYear][cTerm];

            // CRITICAL FIX: Minutes & appearances - preserve zero and count appearances only for players who actually participated
            const minutes = typeof cStats.minutesPlayed === 'number' ? cStats.minutesPlayed : 0;
            const hasActiveStats = Object.entries(cStats).some(([k, v]) => 
                !k.startsWith('_') && k !== 'minutesPlayed' && typeof v === 'number' && v > 0
            );
            const participated = minutes > 0 || hasActiveStats;

            if (participated) {
                termMatch.gamesPlayed = (termMatch.gamesPlayed || 0) + 1;
            }
            termMatch.minutesPlayed = (termMatch.minutesPlayed || 0) + minutes;
            termMatch.yellowCards = (termMatch.yellowCards || 0) + (cStats.yellowCards || 0);
            termMatch.redCards = (termMatch.redCards || 0) + (cStats.redCards || 0);
        });

        newStudent.performance = rebuiltPerf;
        newStudent.matchStats = rebuiltMatchStats;

        // Recompute per-game averages
        if (newStudent.performance[matchYear]) {
            const yPerf = newStudent.performance[matchYear];
            const yMatch = newStudent.matchStats?.[matchYear] || {};
            let totalGames = 0;
            Object.values(yMatch).forEach(m => { totalGames += (m.gamesPlayed || 0); });

            if (totalGames > 0) {
                let totalTackles = 0;
                let totalInterceptions = 0;
                let totalShots = 0;
                Object.values(yPerf).forEach(p => {
                    totalTackles += (p['Successful Tackles'] || 0);
                    totalInterceptions += (p['Interceptions'] || 0);
                    totalShots += (p['Shots'] || 0);
                });
                if (!yPerf[matchTerm]) yPerf[matchTerm] = {};
                yPerf[matchTerm]['Tackles Per Game'] = parseFloat((totalTackles / totalGames).toFixed(2));
                yPerf[matchTerm]['Interceptions Per Game'] = parseFloat((totalInterceptions / totalGames).toFixed(2));
                yPerf[matchTerm]['Shots Per Game'] = parseFloat((totalShots / totalGames).toFixed(2));
            }
        }

        // Shot logs persistence with stable IDs
        const playerShotEvents = (updatedMatch.timeline || []).filter(event =>
            matchesStudentId(event.playerId, student) &&
            (event.type === 'goal' || event.type === 'shotOnTarget' || event.type === 'shotBlocked' || event.type === 'shotMissed')
        );
        const matchShots = playerShotEvents.map((event, index) => {
            const rawResult = event.goalType === 'own-goal' ? 'own-goal' : (event.result || (
                event.type === 'goal' ? 'goal' :
                event.type === 'shotOnTarget' ? 'saved' :
                event.type === 'shotBlocked' ? 'blocked' : 'miss'
            ));
            return {
                id: `${updatedMatch.id}-${event.id || index}`,
                matchId: updatedMatch.id,
                year: matchYear,
                term: matchTerm,
                result: rawResult,
                goalType: event.goalType || (event.type === 'goal' ? 'foot' : undefined),
                x: event.x != null ? event.x : null,
                y: event.y != null ? event.y : null,
                timestamp: event.timestamp || Date.now()
            };
        });
        const existingShotsWithoutThisMatch = (newStudent.shotLogs || []).filter(l => l.matchId !== updatedMatch.id);
        newStudent.shotLogs = [...existingShotsWithoutThisMatch, ...matchShots];

        // Save logs persistence with stable IDs
        const playerSaveEvents = (updatedMatch.timeline || []).filter(event =>
            matchesStudentId(event.playerId, student) && event.type === 'gkSave'
        );
        const matchSaves = playerSaveEvents.map((event, index) => ({
            id: `${updatedMatch.id}-${event.id || index}`,
            matchId: updatedMatch.id,
            year: matchYear,
            term: matchTerm,
            result: 'save',
            saveType: event.saveType || (event.goalType === 'penalty' ? 'penalty' : event.goalType === 'freekick' ? 'freekick' : 'normal'),
            corner: event.corner || null,
            x: event.x != null ? event.x : null,
            y: event.y != null ? event.y : null,
            timestamp: event.timestamp || Date.now()
        }));
        const existingSavesWithoutThisMatch = (newStudent.saveLogs || []).filter(l => l.matchId !== updatedMatch.id);
        newStudent.saveLogs = [...existingSavesWithoutThisMatch, ...matchSaves];

        return newStudent;
    });
}

/**
 * Migrates legacy 'Term X' strings to standard 'Matchday X'.
 */
export function migrateTermsToMatchdays(students) {
    if (!Array.isArray(students)) return [];
    return students.map(student => {
        if (!student) return student;
        const newStudent = { ...student };
        if (newStudent.performance && typeof newStudent.performance === 'object') {
            const newPerf = {};
            Object.keys(newStudent.performance).forEach(year => {
                newPerf[year] = {};
                if (newStudent.performance[year] && typeof newStudent.performance[year] === 'object') {
                    Object.keys(newStudent.performance[year]).forEach(term => {
                        if (term && typeof term === 'string') {
                            const newTerm = term.replace('Term ', 'Matchday ');
                            newPerf[year][newTerm] = newStudent.performance[year][term];
                        }
                    });
                }
            });
            newStudent.performance = newPerf;
        }
        if (newStudent.matchStats && typeof newStudent.matchStats === 'object') {
            const newStats = {};
            Object.keys(newStudent.matchStats).forEach(year => {
                newStats[year] = {};
                if (newStudent.matchStats[year] && typeof newStudent.matchStats[year] === 'object') {
                    Object.keys(newStudent.matchStats[year]).forEach(term => {
                        if (term && typeof term === 'string') {
                            const newTerm = term.replace('Term ', 'Matchday ');
                            newStats[year][newTerm] = newStudent.matchStats[year][term];
                        }
                    });
                }
            });
            newStudent.matchStats = newStats;
        }
        if (Array.isArray(newStudent.shotLogs)) {
            newStudent.shotLogs = newStudent.shotLogs.map(shot => {
                if (shot && shot.term && typeof shot.term === 'string') {
                    return {
                        ...shot,
                        term: shot.term.replace('Term ', 'Matchday ')
                    };
                }
                return shot;
            });
        }
        return newStudent;
    });
}

/**
 * Sanitizes student records for localStorage and Supabase persistence,
 * ensuring contributions, baselines, shotLogs, and saveLogs are preserved.
 * Does NOT overwrite _matchContributions with {} if undefined to avoid altering migration provenance.
 */
export function cleanStudentsForSave(students) {
    if (!Array.isArray(students)) return [];
    return students.map(s => {
        if (!s) return s;
        return {
            id: s.id,
            name: s.name,
            schoolId: s.schoolId,
            teamAssignments: s.teamAssignments,
            performance: s.performance,
            matchStats: s.matchStats,
            extracurriculars: s.extracurriculars,
            jerseyNumber: s.jerseyNumber,
            shotLogs: s.shotLogs || [],
            saveLogs: s.saveLogs || [],
            _matchContributions: s._matchContributions !== undefined ? s._matchContributions : null,
            _baselinePerformance: s._baselinePerformance !== undefined ? s._baselinePerformance : null,
            _baselineMatchStats: s._baselineMatchStats !== undefined ? s._baselineMatchStats : null,
            _legacyProvenance: s._legacyProvenance !== undefined ? s._legacyProvenance : null,
            // Save registration details
            dob: s.dob,
            gender: s.gender,
            position: s.position,
            preferredFoot: s.preferredFoot,
            medicalInfo: s.medicalInfo,
            emergencyContact: s.emergencyContact,
            status: s.status,
            rejectionReason: s.rejectionReason,
            documents: s.documents,
        };
    });
}

/**
 * Merges loaded/saved student records into baseline students.
 */
export function loadAndMergeStudents(savedList, baseStudents = []) {
    if (!savedList || !Array.isArray(savedList) || savedList.length === 0) return baseStudents;
    const migratedList = migrateTermsToMatchdays(savedList);

    const baseIds = new Set((baseStudents || []).map(b => b && String(b.id)));
    
    // Update base students with any saved edits
    const mergedBase = (baseStudents || []).map(baseStudent => {
        if (!baseStudent) return baseStudent;
        const savedStudent = migratedList.find(s => s && String(s.id) === String(baseStudent.id));
        if (!savedStudent) return baseStudent;

        return {
            ...baseStudent,
            name: savedStudent.name || baseStudent.name,
            schoolId: savedStudent.schoolId || baseStudent.schoolId,
            teamAssignments: savedStudent.teamAssignments || baseStudent.teamAssignments,
            performance: savedStudent.performance || baseStudent.performance,
            matchStats: savedStudent.matchStats || baseStudent.matchStats,
            extracurriculars: savedStudent.extracurriculars || baseStudent.extracurriculars,
            jerseyNumber: savedStudent.jerseyNumber != null ? savedStudent.jerseyNumber : baseStudent.jerseyNumber,
            shotLogs: savedStudent.shotLogs || baseStudent.shotLogs || [],
            saveLogs: savedStudent.saveLogs || baseStudent.saveLogs || [],
            _matchContributions: savedStudent._matchContributions !== undefined ? savedStudent._matchContributions : (baseStudent._matchContributions || null),
            _baselinePerformance: savedStudent._baselinePerformance !== undefined ? savedStudent._baselinePerformance : (baseStudent._baselinePerformance || null),
            _baselineMatchStats: savedStudent._baselineMatchStats !== undefined ? savedStudent._baselineMatchStats : (baseStudent._baselineMatchStats || null),
            _legacyProvenance: savedStudent._legacyProvenance !== undefined ? savedStudent._legacyProvenance : (baseStudent._legacyProvenance || null),
            dob: savedStudent.dob !== undefined ? savedStudent.dob : baseStudent.dob,
            gender: savedStudent.gender !== undefined ? savedStudent.gender : baseStudent.gender,
            position: savedStudent.position !== undefined ? savedStudent.position : baseStudent.position,
            preferredFoot: savedStudent.preferredFoot !== undefined ? savedStudent.preferredFoot : baseStudent.preferredFoot,
            medicalInfo: savedStudent.medicalInfo !== undefined ? savedStudent.medicalInfo : baseStudent.medicalInfo,
            emergencyContact: savedStudent.emergencyContact !== undefined ? savedStudent.emergencyContact : baseStudent.emergencyContact,
            status: savedStudent.status !== undefined ? savedStudent.status : baseStudent.status,
            rejectionReason: savedStudent.rejectionReason !== undefined ? savedStudent.rejectionReason : baseStudent.rejectionReason,
            documents: savedStudent.documents !== undefined ? savedStudent.documents : baseStudent.documents,
        };
    });

    // Preserve any newly registered custom players added by user
    const customSaved = migratedList.filter(s => s && s.id && !baseIds.has(String(s.id)));
    const result = [...mergedBase, ...customSaved];
    return result.length > 0 ? result : baseStudents;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION HANDLER STATE REDUCERS (Testable without React DOM / Hooks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State transition for recording a quick match action (card, foul, corner, assist).
 * Supports deduplication tokens and field-level sequence ordering.
 */
export function recordMatchActionState({
    playerStats = {},
    timeline = [],
    actionKey,
    playerId,
    playerName,
    team,
    teamId,
    teamName,
    elapsed = 0,
    period = '1H',
    now = Date.now(),
    seq = 1,
    actionToken = null
}) {
    // Deduplication check: reject if actionToken already processed
    if (actionToken && timeline.some(e => e.actionToken === actionToken)) {
        return { playerStats, timeline, rejected: true, reason: 'Duplicate actionToken' };
    }

    const eventId = `event-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const newEvent = {
        id: eventId,
        actionToken: actionToken || eventId,
        elapsed,
        minute: Math.floor(elapsed / 60) + 1,
        period,
        type: actionKey,
        playerId,
        playerName,
        team,
        teamId,
        teamName,
        timestamp: now
    };

    const nextPlayerStats = { ...playerStats };
    const p = nextPlayerStats[playerId] ? { ...nextPlayerStats[playerId] } : { ...initPlayerStats(playerId), team };
    const statTimes = { ...(p._statUpdatedAt || {}) };
    const statSeq = { ...(p._statSeq || {}) };
    const statOp = { ...(p._statOp || {}) };

    const updateField = (field, delta) => {
        p[field] = (p[field] || 0) + delta;
        statTimes[field] = now;
        statSeq[field] = seq;
        statOp[field] = 'action';
    };

    if (actionKey === 'assist') updateField('Assists', 1);
    else if (actionKey === 'yellowCard') updateField('yellowCards', 1);
    else if (actionKey === 'redCard') updateField('redCards', 1);
    else if (actionKey === 'corner') updateField('Corners Taken', 1);
    else if (actionKey === 'foul') updateField('Fouls Committed', 1);
    else if (actionKey === 'shotMissed') updateField('Shots', 1);

    p._updatedAt = now;
    p._statUpdatedAt = statTimes;
    p._statSeq = statSeq;
    p._statOp = statOp;
    nextPlayerStats[playerId] = p;

    return {
        playerStats: nextPlayerStats,
        timeline: [...timeline, newEvent],
        newEvent,
        rejected: false
    };
}

/**
 * State transition for recording a shot/goal modal outcome.
 * Enforces goalkeeper validation on saves and creates companion save events.
 */
export function recordMatchShotState({
    playerStats = {},
    timeline = [],
    shotDetails = {},
    shooterId,
    shooterName,
    isHome,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    oppGkId = null,
    oppGkName = 'Goalkeeper',
    oppPlayersList = [],
    elapsed = 0,
    period = '1H',
    now = Date.now(),
    seq = 1,
    actionToken = null
}) {
    const { result, x, y, goalType, assistPlayerId, assistPlayerName } = shotDetails;

    // Deduplication check: reject if actionToken already processed
    if (actionToken && timeline.some(e => e.actionToken === actionToken)) {
        return { playerStats, timeline, rejected: true, reason: 'Duplicate actionToken' };
    }

    // Goalkeeper validation on saved shots
    if (result === 'saved') {
        if (!oppGkId) {
            return { playerStats, timeline, rejected: true, reason: 'Goalkeeper selection required for saved shot' };
        }
        if (oppPlayersList.length > 0 && !oppPlayersList.map(String).includes(String(oppGkId))) {
            return { playerStats, timeline, rejected: true, reason: 'Selected goalkeeper is not in active opposing lineup' };
        }
    }

    const eventId = `event-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const eventType = result === 'goal' ? 'goal' : result === 'saved' ? 'shotOnTarget' : result === 'blocked' ? 'shotBlocked' : 'shotMissed';
    const oppSide = isHome ? 'away' : 'home';
    const saveType = goalType === 'penalty' ? 'penalty' : goalType === 'freekick' ? 'freekick' : 'normal';
    const saveEventId = `save-${eventId}`;

    const newEvent = {
        id: eventId,
        actionToken: actionToken || eventId,
        elapsed,
        minute: Math.floor(elapsed / 60) + 1,
        period,
        type: eventType,
        result,
        outcome: result === 'goal' ? 'Goal' : result === 'saved' ? 'Saved' : result === 'blocked' ? 'Blocked' : 'Off Target',
        playerId: shooterId,
        playerName: shooterName,
        team: isHome ? 'home' : 'away',
        teamId: isHome ? homeTeamId : awayTeamId,
        teamName: isHome ? homeTeamName : awayTeamName,
        x: x != null ? Math.round(x) : null,
        y: y != null ? Math.round(y) : null,
        goalType: goalType || 'foot',
        shotType: goalType || 'foot',
        shotDetail: {
            x: x != null ? Math.round(x) : null,
            y: y != null ? Math.round(y) : null,
            result,
            goalType: goalType || 'foot',
            technique: goalType || 'foot'
        },
        assistingPlayerId: (result === 'goal' && goalType !== 'own-goal') ? (assistPlayerId || null) : null,
        assistingPlayerName: (result === 'goal' && goalType !== 'own-goal') ? (assistPlayerName || null) : null,
        timestamp: now
    };

    let saveEvent = null;
    if (result === 'saved') {
        newEvent.linkedSaveEventId = saveEventId;
        newEvent.oppGkId = oppGkId;
        newEvent.saveType = saveType;

        saveEvent = {
            id: saveEventId,
            actionToken: actionToken ? `save-${actionToken}` : saveEventId,
            linkedShotEventId: eventId,
            elapsed,
            minute: Math.floor(elapsed / 60) + 1,
            period,
            type: 'gkSave',
            playerId: oppGkId,
            playerName: oppGkName,
            team: oppSide,
            teamId: isHome ? awayTeamId : homeTeamId,
            teamName: isHome ? awayTeamName : homeTeamName,
            saveType,
            shooterId,
            shooterName,
            x: x != null ? Math.round(x) : null,
            y: y != null ? Math.round(y) : null,
            timestamp: now
        };
    }

    const nextPlayerStats = { ...playerStats };

    // Update shooter stats
    const s = nextPlayerStats[shooterId] ? { ...nextPlayerStats[shooterId] } : { ...initPlayerStats(shooterId), team: isHome ? 'home' : 'away' };
    const sTimes = { ...(s._statUpdatedAt || {}) };
    const sSeq = { ...(s._statSeq || {}) };
    const sOp = { ...(s._statOp || {}) };

    const updateShooter = (field, delta) => {
        s[field] = (s[field] || 0) + delta;
        sTimes[field] = now;
        sSeq[field] = seq;
        sOp[field] = 'action';
    };

    if (result === 'goal') {
        if (goalType === 'own-goal') {
            updateShooter('ownGoals', 1);
        } else {
            updateShooter('Goals', 1);
            updateShooter('Shots on Target', 1);
            updateShooter('Shots', 1);
        }
    } else if (result === 'saved') {
        updateShooter('Shots on Target', 1);
        updateShooter('Shots', 1);
    } else if (result === 'blocked') {
        updateShooter('Blocked Shots', 1);
        updateShooter('Shots', 1);
    } else {
        updateShooter('Shots', 1);
    }

    s._updatedAt = now;
    s._statUpdatedAt = sTimes;
    s._statSeq = sSeq;
    s._statOp = sOp;
    nextPlayerStats[shooterId] = s;

    // Update assister stats if applicable
    if (result === 'goal' && goalType !== 'own-goal' && assistPlayerId) {
        const a = nextPlayerStats[assistPlayerId] ? { ...nextPlayerStats[assistPlayerId] } : { ...initPlayerStats(assistPlayerId), team: isHome ? 'home' : 'away' };
        const aTimes = { ...(a._statUpdatedAt || {}) };
        const aSeq = { ...(a._statSeq || {}) };
        const aOp = { ...(a._statOp || {}) };

        a.Assists = (a.Assists || 0) + 1;
        aTimes.Assists = now;
        aSeq.Assists = seq;
        aOp.Assists = 'action';
        a._updatedAt = now;
        a._statUpdatedAt = aTimes;
        a._statSeq = aSeq;
        a._statOp = aOp;
        nextPlayerStats[assistPlayerId] = a;
    }

    // Update goalkeeper stats on saved shots
    if (result === 'saved' && oppGkId) {
        const gk = nextPlayerStats[oppGkId] ? { ...nextPlayerStats[oppGkId] } : { ...initPlayerStats(oppGkId), team: oppSide };
        const gkTimes = { ...(gk._statUpdatedAt || {}) };
        const gkSeq = { ...(gk._statSeq || {}) };
        const gkOp = { ...(gk._statOp || {}) };

        const updateGk = (field, delta) => {
            gk[field] = (gk[field] || 0) + delta;
            gkTimes[field] = now;
            gkSeq[field] = seq;
            gkOp[field] = 'action';
        };

        updateGk('Saves', 1);
        if (saveType === 'penalty') updateGk('Penalties Saved', 1);
        else if (saveType === 'freekick') updateGk('Free Kick Saves', 1);

        gk._updatedAt = now;
        gk._statUpdatedAt = gkTimes;
        gk._statSeq = gkSeq;
        gk._statOp = gkOp;
        nextPlayerStats[oppGkId] = gk;
    }

    const nextTimeline = saveEvent ? [...timeline, newEvent, saveEvent] : [...timeline, newEvent];

    return {
        playerStats: nextPlayerStats,
        timeline: nextTimeline,
        newEvent,
        saveEvent,
        rejected: false
    };
}

/**
 * State transition for recording a goalkeeper save modal event.
 * Rejects repeat submissions via actionToken and deduplicates linked shot saves.
 */
export function recordMatchGkSaveState({
    playerStats = {},
    timeline = [],
    gkSaveDetails = {},
    gkId,
    gkName,
    isHome,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    elapsed = 0,
    period = '1H',
    now = Date.now(),
    seq = 1,
    actionToken = null
}) {
    const { saveType = 'normal', corner, linkedShotId } = gkSaveDetails;

    // Deduplication check 1: actionToken
    if (actionToken && timeline.some(e => e.actionToken === actionToken)) {
        return { playerStats, timeline, rejected: true, reason: 'Duplicate actionToken' };
    }

    // Deduplication check 2: already logged companion save for this shot
    if (linkedShotId) {
        const existing = timeline.find(t => t.linkedShotEventId === linkedShotId || t.id === `save-${linkedShotId}`);
        if (existing) {
            return { playerStats, timeline, rejected: true, reason: 'Save already logged for this shot' };
        }
    }

    const cornerCoords = {
        'top-left': { x: 25, y: 35 },
        'top-right': { x: 75, y: 35 },
        'center': { x: 50, y: 57 },
        'bottom-left': { x: 25, y: 80 },
        'bottom-right': { x: 75, y: 80 }
    };
    const coords = cornerCoords[corner] || { x: 50, y: 50 };

    const eventId = `event-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const newEvent = {
        id: eventId,
        actionToken: actionToken || eventId,
        elapsed,
        minute: Math.floor(elapsed / 60) + 1,
        period,
        type: 'gkSave',
        playerId: gkId,
        playerName: gkName,
        team: isHome ? 'home' : 'away',
        teamId: isHome ? homeTeamId : awayTeamId,
        teamName: isHome ? homeTeamName : awayTeamName,
        saveType,
        corner,
        x: coords.x,
        y: coords.y,
        linkedShotEventId: linkedShotId || null,
        timestamp: now
    };

    const nextPlayerStats = { ...playerStats };
    const gk = nextPlayerStats[gkId] ? { ...nextPlayerStats[gkId] } : { ...initPlayerStats(gkId), team: isHome ? 'home' : 'away' };
    const gkTimes = { ...(gk._statUpdatedAt || {}) };
    const gkSeq = { ...(gk._statSeq || {}) };
    const gkOp = { ...(gk._statOp || {}) };

    const updateGk = (field, delta) => {
        gk[field] = (gk[field] || 0) + delta;
        gkTimes[field] = now;
        gkSeq[field] = seq;
        gkOp[field] = 'action';
    };

    updateGk('Saves', 1);
    if (saveType === 'penalty') updateGk('Penalties Saved', 1);
    else if (saveType === 'freekick') updateGk('Free Kick Saves', 1);

    gk._updatedAt = now;
    gk._statUpdatedAt = gkTimes;
    gk._statSeq = gkSeq;
    gk._statOp = gkOp;
    nextPlayerStats[gkId] = gk;

    return {
        playerStats: nextPlayerStats,
        timeline: [...timeline, newEvent],
        newEvent,
        rejected: false
    };
}

/**
 * State transition for undoing a timeline event and its linked companion event.
 * Reverses contributions, sets tombstones, updates per-stat sequence and undo op tag.
 */
export function undoMatchEventState({
    playerStats = {},
    timeline = [],
    tombstoneEventIds = [],
    eventId,
    now = Date.now(),
    seq = 1
}) {
    const ev = timeline.find(t => t.id === eventId);
    if (!ev) return { playerStats, timeline, tombstoneEventIds, undone: false };

    // Find linked save or shot event if applicable
    const linkedEv = ev.linkedSaveEventId 
        ? timeline.find(t => t.id === ev.linkedSaveEventId)
        : (ev.linkedShotEventId ? timeline.find(t => t.id === ev.linkedShotEventId) : null);

    const eventIdsToRemove = new Set([eventId]);
    if (linkedEv) eventIdsToRemove.add(linkedEv.id);

    const nextTombstones = Array.from(new Set([...tombstoneEventIds, ...eventIdsToRemove].map(String)));
    const nextPlayerStats = { ...playerStats };

    const pId = ev.playerId;
    if (nextPlayerStats[pId] && !ev.overturned) {
        const s = { ...nextPlayerStats[pId] };
        const statTimes = { ...(s._statUpdatedAt || {}) };
        const statSeq = { ...(s._statSeq || {}) };
        const statOp = { ...(s._statOp || {}) };

        const decrementField = (field) => {
            s[field] = Math.max(0, (s[field] || 0) - 1);
            statTimes[field] = now;
            statSeq[field] = seq;
            statOp[field] = 'undo';
            syncStatAlias(s, field, now, seq, 'undo', statTimes, statSeq, statOp);
        };

        if (ev.type === 'goal') {
            if (ev.goalType === 'own-goal') {
                decrementField('ownGoals');
            } else {
                decrementField('Goals');
                decrementField('Shots on Target');
                decrementField('Shots');

                // Revert assist if any
                if (ev.assistingPlayerId && nextPlayerStats[ev.assistingPlayerId]) {
                    const a = { ...nextPlayerStats[ev.assistingPlayerId] };
                    const aTimes = { ...(a._statUpdatedAt || {}) };
                    const aSeq = { ...(a._statSeq || {}) };
                    const aOp = { ...(a._statOp || {}) };

                    a.Assists = Math.max(0, (a.Assists || 0) - 1);
                    aTimes.Assists = now;
                    aSeq.Assists = seq;
                    aOp.Assists = 'undo';
                    syncStatAlias(a, 'Assists', now, seq, 'undo', aTimes, aSeq, aOp);
                    a._updatedAt = now;
                    a._statUpdatedAt = aTimes;
                    a._statSeq = aSeq;
                    a._statOp = aOp;
                    nextPlayerStats[ev.assistingPlayerId] = a;
                }
            }
        } else if (ev.type === 'shotOnTarget') {
            decrementField('Shots on Target');
            decrementField('Shots');
        } else if (ev.type === 'shotBlocked') {
            decrementField('Blocked Shots');
            decrementField('Shots');
        } else if (ev.type === 'shotMissed') {
            decrementField('Shots');
        } else if (ev.type === 'assist') {
            decrementField('Assists');
        } else if (ev.type === 'yellowCard') {
            decrementField('yellowCards');
        } else if (ev.type === 'redCard') {
            decrementField('redCards');
        } else if (ev.type === 'foul') {
            decrementField('Fouls Committed');
        } else if (ev.type === 'corner') {
            decrementField('Corners Taken');
        } else if (ev.type === 'gkSave') {
            decrementField('Saves');
            if (ev.saveType === 'penalty') decrementField('Penalties Saved');
            else if (ev.saveType === 'freekick') decrementField('Free Kick Saves');
        }

        s._updatedAt = now;
        s._statUpdatedAt = statTimes;
        s._statSeq = statSeq;
        s._statOp = statOp;
        nextPlayerStats[pId] = s;
    }

    // Reverse linked companion event in single pass
    if (linkedEv && !linkedEv.overturned && nextPlayerStats[linkedEv.playerId]) {
        const ls = { ...nextPlayerStats[linkedEv.playerId] };
        const lTimes = { ...(ls._statUpdatedAt || {}) };
        const lSeq = { ...(ls._statSeq || {}) };
        const lOp = { ...(ls._statOp || {}) };

        const decrementLinkedField = (field) => {
            ls[field] = Math.max(0, (ls[field] || 0) - 1);
            lTimes[field] = now;
            lSeq[field] = seq;
            lOp[field] = 'undo';
            syncStatAlias(ls, field, now, seq, 'undo', lTimes, lSeq, lOp);
        };

        if (linkedEv.type === 'gkSave') {
            decrementLinkedField('Saves');
            if (linkedEv.saveType === 'penalty') decrementLinkedField('Penalties Saved');
            else if (linkedEv.saveType === 'freekick') decrementLinkedField('Free Kick Saves');
        } else if (linkedEv.type === 'shotOnTarget') {
            decrementLinkedField('Shots on Target');
            decrementLinkedField('Shots');
        }

        ls._updatedAt = now;
        ls._statUpdatedAt = lTimes;
        ls._statSeq = lSeq;
        ls._statOp = lOp;
        nextPlayerStats[linkedEv.playerId] = ls;
    }

    const nextTimeline = timeline.filter(t => !eventIdsToRemove.has(t.id));

    return {
        playerStats: nextPlayerStats,
        timeline: nextTimeline,
        tombstoneEventIds: nextTombstones,
        undone: true
    };
}

/**
 * State transition for manual detail stat change (e.g. minutes, passes, tackles).
 */
function syncStatAlias(stats, field, now, seq, op, times, sequences, operations) {
    const alias = {
        Goals: 'goals', Assists: 'assists', Shots: 'shots',
        'Shots on Target': 'shotsOnTarget', Saves: 'saves',
        'Fouls Committed': 'fouls', yellowCards: 'Yellow Cards', redCards: 'Red Cards'
    }[field];
    if (!alias || !(alias in stats)) return;
    stats[alias] = stats[field];
    times[alias] = now;
    sequences[alias] = seq;
    operations[alias] = op;
}

export function updateMatchPlayerDetailState({
    playerStats = {},
    playerId,
    stat,
    field,
    value,
    now = Date.now(),
    seq = 1
}) {
    const num = Math.max(0, Number(value) || 0);
    const next = { ...playerStats };
    const p = next[playerId] ? { ...next[playerId] } : { ...initPlayerStats(playerId) };
    const rawStat = stat || field;
    const statKey = rawStat === 'Minutes Played' ? 'minutesPlayed' : rawStat;
    const statTimes = { ...(p._statUpdatedAt || {}) };
    const statSeq = { ...(p._statSeq || {}) };
    const statOp = { ...(p._statOp || {}) };

    p[statKey] = num;
    statTimes[statKey] = now;
    statSeq[statKey] = seq;
    statOp[statKey] = 'set';

    p._updatedAt = now;
    p._statUpdatedAt = statTimes;
    p._statSeq = statSeq;
    p._statOp = statOp;
    next[playerId] = p;

    return { playerStats: next };
}

/**
 * Internal helper to apply or revert a single event's statistical contribution on playerStats.
 * delta = +1 to add, delta = -1 to reverse/decrement.
 */
export function applyEventStatsDelta(playerStats = {}, ev = null, delta = 1, now = Date.now(), seq = 1, op = 'edit') {
    if (!ev || !ev.playerId) return playerStats;
    const pId = ev.playerId;
    const nextPlayerStats = { ...playerStats };
    if (!nextPlayerStats[pId]) {
        nextPlayerStats[pId] = initPlayerStats(pId);
    }
    const s = { ...nextPlayerStats[pId] };
    const statTimes = { ...(s._statUpdatedAt || {}) };
    const statSeq = { ...(s._statSeq || {}) };
    const statOp = { ...(s._statOp || {}) };

    const adjustField = (field, d) => {
        s[field] = Math.max(0, (s[field] || 0) + d);
        if (field === 'Goals') s.goals = s[field];
        if (field === 'Assists') s.assists = s[field];
        if (field === 'Shots') s.shots = s[field];
        if (field === 'Shots on Target') s.shotsOnTarget = s[field];
        if (field === 'Saves') s.saves = s[field];
        if (field === 'Fouls Committed') s.fouls = s[field];
        if (field === 'yellowCards') s['Yellow Cards'] = s[field];
        if (field === 'redCards') s['Red Cards'] = s[field];

        statTimes[field] = now;
        statSeq[field] = seq;
        statOp[field] = op;
    };

    if (ev.type === 'goal') {
        if (ev.goalType === 'own-goal') {
            adjustField('ownGoals', delta);
        } else {
            adjustField('Goals', delta);
            adjustField('Shots on Target', delta);
            adjustField('Shots', delta);

            // Handle assist if present
            if (ev.assistingPlayerId) {
                const aId = ev.assistingPlayerId;
                if (!nextPlayerStats[aId]) nextPlayerStats[aId] = initPlayerStats(aId);
                const a = { ...nextPlayerStats[aId] };
                const aTimes = { ...(a._statUpdatedAt || {}) };
                const aSeq = { ...(a._statSeq || {}) };
                const aOp = { ...(a._statOp || {}) };

                a.Assists = Math.max(0, (a.Assists || 0) + delta);
                a.assists = a.Assists;
                aTimes.Assists = now;
                aSeq.Assists = seq;
                aOp.Assists = op;
                a._updatedAt = now;
                a._statUpdatedAt = aTimes;
                a._statSeq = aSeq;
                a._statOp = aOp;
                nextPlayerStats[aId] = a;
            }
        }
    } else if (ev.type === 'shotOnTarget') {
        adjustField('Shots on Target', delta);
        adjustField('Shots', delta);
    } else if (ev.type === 'shot') {
        if (ev.onTarget || ev.result === 'saved') {
            adjustField('Shots on Target', delta);
        }
        adjustField('Shots', delta);
    } else if (ev.type === 'shotBlocked') {
        adjustField('Blocked Shots', delta);
        adjustField('Shots', delta);
    } else if (ev.type === 'shotMissed') {
        adjustField('Shots', delta);
    } else if (ev.type === 'assist') {
        adjustField('Assists', delta);
    } else if (ev.type === 'yellowCard' || ev.type === 'yellow_card') {
        adjustField('yellowCards', delta);
        adjustField('Fouls Committed', delta);
    } else if (ev.type === 'redCard' || ev.type === 'red_card') {
        adjustField('redCards', delta);
        adjustField('Fouls Committed', delta);
    } else if (ev.type === 'foul') {
        adjustField('Fouls Committed', delta);
    } else if (ev.type === 'corner') {
        adjustField('Corners Taken', delta);
    } else if (ev.type === 'gkSave' || ev.type === 'save') {
        adjustField('Saves', delta);
        if (ev.saveType === 'penalty' || ev.subtype === 'penalty') adjustField('Penalties Saved', delta);
        else if (ev.saveType === 'freekick' || ev.subtype === 'freekick') adjustField('Free Kick Saves', delta);
    }

    s._updatedAt = now;
    s._statUpdatedAt = statTimes;
    s._statSeq = statSeq;
    s._statOp = statOp;
    nextPlayerStats[pId] = s;

    return nextPlayerStats;
}

/**
 * State transition for editing an existing match event.
 * Reverses the old event contributions and applies the updated event contributions.
 */
export function editMatchEventState({
    playerStats = {},
    timeline = [],
    tombstoneEventIds = [],
    eventId,
    updatedFields = {},
    now = Date.now(),
    seq = 1,
    editedBy = 'operator'
}) {
    const evIndex = timeline.findIndex(t => t.id === eventId);
    if (evIndex === -1) {
        return { playerStats, timeline, tombstoneEventIds, edited: false };
    }

    const oldEv = timeline[evIndex];

    // If event was previously overturned, it did not contribute stats
    let nextPlayerStats = { ...playerStats };
    if (!oldEv.overturned) {
        // 1. Revert old event contributions
        nextPlayerStats = applyEventStatsDelta(nextPlayerStats, oldEv, -1, now, seq, 'undo');
    }

    // 2. Build updated event
    const newEv = {
        ...oldEv,
        ...updatedFields,
        edited: true,
        editedAt: now,
        _eventSeq: Math.max(seq, (Number(oldEv._eventSeq) || 0) + 1),
        editedBy,
        overturned: false // un-overturn if actively edited with new call
    };

    // If minute or elapsed changed, ensure both are in sync
    if (typeof updatedFields.minute === 'number' && typeof updatedFields.elapsed !== 'number') {
        newEv.elapsed = Math.max(0, (updatedFields.minute - 1) * 60);
    } else if (typeof updatedFields.elapsed === 'number' && typeof updatedFields.minute !== 'number') {
        newEv.minute = Math.floor(updatedFields.elapsed / 60) + 1;
    }

    // 3. Apply new event contributions
    nextPlayerStats = applyEventStatsDelta(nextPlayerStats, newEv, 1, now, seq, 'edit');

    // 4. Update timeline and sort chronologically
    const nextTimeline = [...timeline];
    nextTimeline[evIndex] = newEv;
    nextTimeline.sort((a, b) => (a.elapsed ?? (a.minute * 60) ?? 0) - (b.elapsed ?? (b.minute * 60) ?? 0));

    return {
        playerStats: nextPlayerStats,
        timeline: nextTimeline,
        tombstoneEventIds,
        edited: true,
        updatedEvent: newEv
    };
}

/**
 * State transition for overturning / nullifying a match event (e.g. referee disallowed goal, overturned card).
 * Fully reverses stats and marks event with audit overturn metadata (or removes if removeCompletely=true).
 */
export function overturnMatchEventState({
    playerStats = {},
    timeline = [],
    tombstoneEventIds = [],
    eventId,
    overturnReason = 'Referee changed call',
    overturnedBy = 'referee',
    now = Date.now(),
    seq = 1,
    removeCompletely = false
}) {
    const evIndex = timeline.findIndex(t => t.id === eventId);
    if (evIndex === -1) {
        return { playerStats, timeline, tombstoneEventIds, overturned: false };
    }

    const oldEv = timeline[evIndex];
    if (oldEv.overturned) {
        return { playerStats, timeline, tombstoneEventIds, overturned: false };
    }

    // 1. Revert stats from the event
    let nextPlayerStats = applyEventStatsDelta(playerStats, oldEv, -1, now, seq, 'undo');

    // Also handle linked companion events if any (e.g. companion gkSave for shotOnTarget, or vice versa)
    const linkedEvents = timeline.filter(t =>
        (oldEv.linkedSaveEventId && t.id === oldEv.linkedSaveEventId) ||
        (oldEv.linkedShotEventId && t.id === oldEv.linkedShotEventId) ||
        t.linkedShotEventId === eventId ||
        t.linkedSaveEventId === eventId
    );

    linkedEvents.forEach(lEv => {
        if (!lEv.overturned) {
            nextPlayerStats = applyEventStatsDelta(nextPlayerStats, lEv, -1, now, seq, 'undo');
        }
    });

    let nextTimeline;
    let nextTombstones = [...(tombstoneEventIds || [])];
    const linkedIds = new Set(linkedEvents.map(l => l.id));

    if (removeCompletely) {
        const toRemove = new Set([eventId, ...linkedIds]);
        nextTombstones = Array.from(new Set([...nextTombstones, ...toRemove].map(String)));
        nextTimeline = timeline.filter(t => !toRemove.has(t.id));
    } else {
        // Mark as overturned with audit metadata
        nextTimeline = timeline.map(t => {
            if (t.id === eventId || linkedIds.has(t.id)) {
                return {
                    ...t,
                    overturned: true,
                    overturnReason,
                    overturnedBy,
                    overturnedAt: now,
                    _eventSeq: Math.max(seq, (Number(t._eventSeq) || 0) + 1)
                };
            }
            return t;
        });
    }

    return {
        playerStats: nextPlayerStats,
        timeline: nextTimeline,
        tombstoneEventIds: nextTombstones,
        overturned: true
    };
}

/**
 * Reliably derives and cross-verifies home and away match scores
 * from both playerStats and valid (non-overturned) goal events in the timeline.
 */
export function recalculateMatchScores(match = {}, playerStats = null, timeline = null) {
    const pStats = playerStats || match.playerStats || match.liveState?.playerStats || {};
    const tLine = timeline || match.timeline || match.liveState?.timeline || [];

    const homePids = new Set([
        ...(match.homePlayers || []),
        ...(match.homeSquadSelection?.startingXI || []),
        ...(match.homeSquadSelection?.substitutes || [])
    ].map(String));

    const awayPids = new Set([
        ...(match.awayPlayers || []),
        ...(match.awaySquadSelection?.startingXI || []),
        ...(match.awaySquadSelection?.substitutes || [])
    ].map(String));

    // If player lists are empty, infer from pStats[id].team
    Object.entries(pStats).forEach(([pid, s]) => {
        if (s?.team === 'home' || s?.teamSide === 'home') homePids.add(String(pid));
        else if (s?.team === 'away' || s?.teamSide === 'away') awayPids.add(String(pid));
    });

    let homeGoals = 0;
    let homeOwnGoals = 0;
    let awayGoals = 0;
    let awayOwnGoals = 0;

    homePids.forEach(id => {
        homeGoals += (pStats[id]?.Goals ?? 0);
        awayOwnGoals += (pStats[id]?.ownGoals ?? 0);
    });

    awayPids.forEach(id => {
        awayGoals += (pStats[id]?.Goals ?? 0);
        homeOwnGoals += (pStats[id]?.ownGoals ?? 0);
    });

    let calcHomeScore = homeGoals + homeOwnGoals;
    let calcAwayScore = awayGoals + awayOwnGoals;

    // Cross-verify with active non-overturned goal events in timeline
    const activeGoals = tLine.filter(t => t.type === 'goal' && !t.overturned);
    if (activeGoals.length > 0 || (calcHomeScore === 0 && calcAwayScore === 0)) {
        let tHome = 0;
        let tAway = 0;
        activeGoals.forEach(g => {
            const side = g.team || g.teamSide || (homePids.has(String(g.playerId)) ? 'home' : 'away');
            const isOwnGoal = g.goalType === 'own-goal' || g.isOwnGoal;
            if (side === 'home') {
                if (isOwnGoal) tAway++; else tHome++;
            } else {
                if (isOwnGoal) tHome++; else tAway++;
            }
        });

        // If pStats had 0 or missing players, timeline is authoritative
        if (Object.keys(pStats).length === 0 || (homeGoals === 0 && awayGoals === 0 && activeGoals.length > 0)) {
            calcHomeScore = tHome;
            calcAwayScore = tAway;
        }
    }

    return {
        homeScore: Math.max(0, calcHomeScore),
        awayScore: Math.max(0, calcAwayScore)
    };
}
