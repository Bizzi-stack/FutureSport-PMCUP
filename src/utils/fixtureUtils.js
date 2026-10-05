/**
 * Fixture Matching Utilities for Strict Team Isolation
 * Guarantees that a coach/team only sees matches they are playing in (Home or Away).
 * Prevents false positives from partial IDs or generic division strings.
 */

export const normalizeId = (id) => {
    if (!id && id !== 0) return '';
    let s = String(id).trim().toLowerCase();
    // Strip common team suffix patterns like '-team-pmc', '-team-u19', '-team-ucl', etc.
    s = s.replace(/-team-(pmc|u\d+|girls|boys|ucl)/gi, '');
    return s;
};

export const normalizeTeamName = (name) => {
    if (!name) return '';
    let s = String(name).toLowerCase().trim();
    // Remove parenthetical notes like (Group E), (U16), (PMC), etc.
    s = s.replace(/\s*\([^)]*\)/g, '');
    // Remove non-alphanumeric characters
    s = s.replace(/[^a-z0-9]/g, '');
    return s;
};

/**
 * Strict check if a match involves a specific club/school.
 * @param {Object} match - The fixture object
 * @param {string|number} targetSchoolId - The coach's school / club ID (e.g. 'pmc-club-10' or 's1')
 * @param {string|number} targetTeamId - The coach's specific team ID (e.g. 'pmc-club-10-team-PMC')
 * @param {string} targetSchoolName - The coach's club name (e.g. 'WOTTON')
 * @returns {boolean}
 */
export const isMatchForTeam = (match, targetSchoolId, targetTeamId, targetSchoolName) => {
    if (!match) return false;

    const cleanTargetSchoolId = normalizeId(targetSchoolId);
    const cleanTargetTeamId = normalizeId(targetTeamId);
    const cleanTargetName = normalizeTeamName(targetSchoolName);

    const checkSide = (sideTeamId, sideSchoolId, sideTeamName) => {
        const normSideTeamId = normalizeId(sideTeamId);
        const normSideSchoolId = normalizeId(sideSchoolId);
        const normSideName = normalizeTeamName(sideTeamName);

        // 1. Exact ID match on School or Team ID
        if (cleanTargetSchoolId && (normSideTeamId === cleanTargetSchoolId || normSideSchoolId === cleanTargetSchoolId)) {
            return true;
        }
        if (cleanTargetTeamId && (normSideTeamId === cleanTargetTeamId || normSideSchoolId === cleanTargetTeamId)) {
            return true;
        }

        // 2. Exact or Prefix/Substring Name Match (avoid short substrings)
        if (cleanTargetName && normSideName) {
            if (normSideName === cleanTargetName) return true;
            if (cleanTargetName.length >= 4 && normSideName.length >= 4) {
                if (normSideName.includes(cleanTargetName) || cleanTargetName.includes(normSideName)) {
                    return true;
                }
            }
        }

        return false;
    };

    return checkSide(match.homeTeamId, match.homeSchoolId, match.homeTeam) ||
           checkSide(match.awayTeamId, match.awaySchoolId, match.awayTeam);
};

/**
 * Checks if a match is finished / concluded.
 * Considers statuses: 'completed', 'approved', 'refereed', 'finished', 'ft', or liveState.period === 'FT'.
 */
export const isMatchFinished = (match) => {
    if (!match) return false;
    if (match.isFinished === true) return true;
    const s = String(match.status || '').toLowerCase().trim();
    if (s === 'completed' || s === 'approved' || s === 'refereed' || s === 'finished' || s === 'ft') {
        return true;
    }
    const period = String(match.liveState?.period || '').toUpperCase().trim();
    if (period === 'FT' || period === 'ENDED') {
        return true;
    }
    return false;
};

/**
 * Extracts squad selection info and relevance metrics for a specific coach/team in a match.
 */
export const getCoachSquadInfo = (match, targetSchoolId, targetTeamId, targetSchoolName) => {
    if (!match) return null;

    const cleanTargetSchoolId = normalizeId(targetSchoolId);
    const cleanTargetTeamId = normalizeId(targetTeamId);
    const cleanTargetName = normalizeTeamName(targetSchoolName);

    const checkSideIsMe = (sideTeamId, sideSchoolId, sideTeamName) => {
        const normSideTeamId = normalizeId(sideTeamId);
        const normSideSchoolId = normalizeId(sideSchoolId);
        const normSideName = normalizeTeamName(sideTeamName);

        if (cleanTargetSchoolId && (normSideTeamId === cleanTargetSchoolId || normSideSchoolId === cleanTargetSchoolId)) return true;
        if (cleanTargetTeamId && (normSideTeamId === cleanTargetTeamId || normSideSchoolId === cleanTargetTeamId)) return true;
        if (cleanTargetName && normSideName) {
            if (normSideName === cleanTargetName) return true;
            if (cleanTargetName.length >= 4 && normSideName.length >= 4) {
                if (normSideName.includes(cleanTargetName) || cleanTargetName.includes(normSideName)) return true;
            }
        }
        return false;
    };

    const isHome = checkSideIsMe(match.homeTeamId, match.homeSchoolId, match.homeTeam);
    const isAway = checkSideIsMe(match.awayTeamId, match.awaySchoolId, match.awayTeam);

    if (!isHome && !isAway) return null;

    const squad = isHome ? match.homeSquadSelection : match.awaySquadSelection;
    const opponentSquad = isHome ? match.awaySquadSelection : match.homeSquadSelection;
    const opponentName = isHome ? (match.awayTeam || match.awayTeamId) : (match.homeTeam || match.homeTeamId);
    const myTeamName = isHome ? (match.homeTeam || match.homeTeamId) : (match.awayTeam || match.awayTeamId);

    const hasSubmittedXI = !!(
        squad &&
        (squad.submittedAt || (Array.isArray(squad.startingXI) && squad.startingXI.filter(Boolean).length >= 11))
    );

    let submittedTimestamp = 0;
    if (squad?.submittedAt) {
        const parsed = new Date(squad.submittedAt).getTime();
        if (!isNaN(parsed)) submittedTimestamp = parsed;
    }

    return {
        isHome,
        isAway,
        squad,
        opponentSquad,
        opponentName,
        myTeamName,
        hasSubmittedXI,
        submittedTimestamp,
        formation: squad?.formation || '4-3-3',
        startingXI: squad?.startingXI || [],
        benchPlayers: squad?.benchPlayers || []
    };
};

/**
 * Resolves the single most relevant match for a coach's team using a deterministic priority hierarchy:
 * 1. Live active match (status === 'live' and !isMatchFinished)
 * 2. Non-finished match with the latest submitted Starting XI (sorted by submittedTimestamp desc)
 * 3. Non-finished upcoming/scheduled match
 * 4. Concluded match with the latest submitted Starting XI
 * 5. Any match for the team
 */
export const getRelevantCoachMatch = (matchesList, targetSchoolId, targetTeamId, targetSchoolName) => {
    if (!matchesList || matchesList.length === 0) return null;

    const myMatches = matchesList.filter(m => isMatchForTeam(m, targetSchoolId, targetTeamId, targetSchoolName));
    if (myMatches.length === 0) return null;

    // 1. Live active match
    const liveMatches = myMatches.filter(m => m.status === 'live' && !isMatchFinished(m));
    if (liveMatches.length > 0) {
        // Sort live matches by latest event or event count
        return [...liveMatches].sort((a, b) => {
            const aLastEv = (a.timeline || []).length > 0 ? (a.timeline[a.timeline.length - 1]?.timestamp || a.timeline[a.timeline.length - 1]?.elapsed || 1) : 0;
            const bLastEv = (b.timeline || []).length > 0 ? (b.timeline[b.timeline.length - 1]?.timestamp || b.timeline[b.timeline.length - 1]?.elapsed || 1) : 0;
            if (bLastEv !== aLastEv) return bLastEv - aLastEv;

            const aEv = (a.timeline?.length || 0) + (a.liveState?.timeline?.length || 0);
            const bEv = (b.timeline?.length || 0) + (b.liveState?.timeline?.length || 0);
            return bEv - aEv;
        })[0];
    }

    // Annotate matches with squad info, finished state, and parsed dates
    const annotated = myMatches.map(m => {
        let parsedDate = 0;
        if (m.date) {
            parsedDate = new Date(m.date).getTime();
        } else if (m.kickoff) {
            parsedDate = new Date(m.kickoff).getTime();
        }
        return {
            match: m,
            finished: isMatchFinished(m),
            dateMs: parsedDate,
            squadInfo: getCoachSquadInfo(m, targetSchoolId, targetTeamId, targetSchoolName)
        };
    });

    // 2. Non-finished upcoming or scheduled match, sorted by date (closest first)
    const nonFinishedUpcoming = annotated.filter(a => !a.finished && (a.match.status === 'upcoming' || a.match.status === 'scheduled'));
    if (nonFinishedUpcoming.length > 0) {
        nonFinishedUpcoming.sort((a, b) => a.dateMs - b.dateMs);
        return nonFinishedUpcoming[0].match;
    }

    // 3. Non-finished match with submitted Starting XI (fallback if no strictly 'upcoming' status but not finished)
    const nonFinishedWithXI = annotated.filter(a => !a.finished && a.squadInfo?.hasSubmittedXI);
    if (nonFinishedWithXI.length > 0) {
        nonFinishedWithXI.sort((a, b) => (b.squadInfo?.submittedTimestamp || 0) - (a.squadInfo?.submittedTimestamp || 0));
        return nonFinishedWithXI[0].match;
    }

    // 4. Any non-finished match
    const nonFinishedAny = annotated.filter(a => !a.finished);
    if (nonFinishedAny.length > 0) {
        return nonFinishedAny[0].match;
    }

    // 5. Concluded match with submitted Starting XI (latest submission first)
    const finishedWithXI = annotated.filter(a => a.squadInfo?.hasSubmittedXI);
    if (finishedWithXI.length > 0) {
        finishedWithXI.sort((a, b) => (b.squadInfo?.submittedTimestamp || 0) - (a.squadInfo?.submittedTimestamp || 0));
        return finishedWithXI[0].match;
    }

    // 6. Fallback: first match
    return myMatches[0];
};

/**
 * Sorts all fixtures for a coach according to priority:
 * 1. Live active matches
 * 2. Non-finished matches with submitted Starting XI (newest submitted first)
 * 3. Non-finished upcoming / scheduled
 * 4. Concluded matches
 */
export const sortCoachMatches = (matchesList, targetSchoolId, targetTeamId, targetSchoolName) => {
    if (!matchesList || matchesList.length === 0) return [];

    const annotated = matchesList.map(m => {
        const finished = isMatchFinished(m);
        const isLive = m.status === 'live' && !finished;
        const squadInfo = getCoachSquadInfo(m, targetSchoolId, targetTeamId, targetSchoolName);
        return {
            match: m,
            finished,
            isLive,
            squadInfo
        };
    });

    return [...annotated].sort((a, b) => {
        // 1. Live matches first
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;

        // 2. Non-finished before finished
        if (a.finished !== b.finished) return a.finished ? 1 : -1;

        // 3. Among non-finished: submitted Starting XI first, ordered by newest submission
        if (!a.finished && !b.finished) {
            const aHasXI = a.squadInfo?.hasSubmittedXI ? 1 : 0;
            const bHasXI = b.squadInfo?.hasSubmittedXI ? 1 : 0;
            if (aHasXI !== bHasXI) return bHasXI - aHasXI;
            if (aHasXI && bHasXI) {
                return (b.squadInfo?.submittedTimestamp || 0) - (a.squadInfo?.submittedTimestamp || 0);
            }
        }

        // 4. Activity / event count
        const aEv = (a.match.timeline?.length || 0) + (a.match.liveState?.timeline?.length || 0);
        const bEv = (b.match.timeline?.length || 0) + (b.match.liveState?.timeline?.length || 0);
        return bEv - aEv;
    }).map(a => a.match);
};

