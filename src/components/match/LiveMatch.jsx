import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SCHOOLS, TEAMS } from '../../data/mockData';
import { createPlayerLookupMap, resolvePlayer, resolvePlayerName } from '../../utils/playerResolver';
import LiveShotModal from './LiveShotModal';
import LiveGkSaveModal from './LiveGkSaveModal';
import EditMatchEventModal from './EditMatchEventModal';
import TileDataCaptureControlPanel from './TileDataCaptureControlPanel';
import { 
    syncPlayerStats, 
    syncTimeline, 
    mergeTombstones, 
    resolveActiveGoalkeeper,
    recordMatchActionState,
    recordMatchShotState,
    recordMatchGkSaveState,
    undoMatchEventState,
    editMatchEventState,
    overturnMatchEventState,
    updateMatchPlayerDetailState,
    recalculateMatchScores
} from '../../utils/matchEngine';

// Formation layouts define rows from back (GK) to front (FWD)
const FORMATION_LAYOUTS = {
    '4-3-3': { 
        label: '4-3-3', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 68, x: 15, role: 'DEF', label: 'LB' },
            { y: 68, x: 38, role: 'DEF', label: 'CB' },
            { y: 68, x: 62, role: 'DEF', label: 'CB' },
            { y: 68, x: 85, role: 'DEF', label: 'RB' },
            { y: 44, x: 25, role: 'MID', label: 'LM' },
            { y: 46, x: 50, role: 'MID', label: 'CM' },
            { y: 44, x: 75, role: 'MID', label: 'RM' },
            { y: 20, x: 20, role: 'FWD', label: 'LW' },
            { y: 18, x: 50, role: 'FWD', label: 'ST' },
            { y: 20, x: 80, role: 'FWD', label: 'RW' }
        ]
    },
    '4-4-2': { 
        label: '4-4-2', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 68, x: 15, role: 'DEF', label: 'LB' },
            { y: 68, x: 38, role: 'DEF', label: 'CB' },
            { y: 68, x: 62, role: 'DEF', label: 'CB' },
            { y: 68, x: 85, role: 'DEF', label: 'RB' },
            { y: 44, x: 15, role: 'MID', label: 'LM' },
            { y: 44, x: 38, role: 'MID', label: 'CM' },
            { y: 44, x: 62, role: 'MID', label: 'CM' },
            { y: 44, x: 85, role: 'MID', label: 'RM' },
            { y: 20, x: 35, role: 'FWD', label: 'ST' },
            { y: 20, x: 65, role: 'FWD', label: 'ST' }
        ]
    },
    '4-2-3-1': { 
        label: '4-2-3-1', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 72, x: 15, role: 'DEF', label: 'LB' },
            { y: 72, x: 38, role: 'DEF', label: 'CB' },
            { y: 72, x: 62, role: 'DEF', label: 'CB' },
            { y: 72, x: 85, role: 'DEF', label: 'RB' },
            { y: 56, x: 35, role: 'CDM', label: 'LDM' },
            { y: 56, x: 65, role: 'CDM', label: 'RDM' },
            { y: 38, x: 20, role: 'CAM', label: 'LAM' },
            { y: 36, x: 50, role: 'CAM', label: 'CAM' },
            { y: 38, x: 80, role: 'CAM', label: 'RAM' },
            { y: 16, x: 50, role: 'ST', label: 'ST' }
        ]
    },
    '3-5-2': { 
        label: '3-5-2', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 68, x: 25, role: 'DEF', label: 'CB' },
            { y: 68, x: 50, role: 'DEF', label: 'CB' },
            { y: 68, x: 75, role: 'DEF', label: 'CB' },
            { y: 44, x: 15, role: 'MID', label: 'LWB' },
            { y: 46, x: 35, role: 'MID', label: 'CM' },
            { y: 48, x: 50, role: 'MID', label: 'CDM' },
            { y: 46, x: 65, role: 'MID', label: 'CM' },
            { y: 44, x: 85, role: 'MID', label: 'RWB' },
            { y: 20, x: 35, role: 'FWD', label: 'ST' },
            { y: 20, x: 65, role: 'FWD', label: 'ST' }
        ]
    },
    '3-4-3': { 
        label: '3-4-3', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 68, x: 25, role: 'DEF', label: 'CB' },
            { y: 68, x: 50, role: 'DEF', label: 'CB' },
            { y: 68, x: 75, role: 'DEF', label: 'CB' },
            { y: 44, x: 15, role: 'MID', label: 'LM' },
            { y: 44, x: 38, role: 'MID', label: 'CM' },
            { y: 44, x: 62, role: 'MID', label: 'CM' },
            { y: 44, x: 85, role: 'MID', label: 'RM' },
            { y: 20, x: 20, role: 'FWD', label: 'LW' },
            { y: 18, x: 50, role: 'FWD', label: 'ST' },
            { y: 20, x: 80, role: 'FWD', label: 'RW' }
        ]
    },
    '4-5-1': { 
        label: '4-5-1', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 68, x: 15, role: 'DEF', label: 'LB' },
            { y: 68, x: 38, role: 'DEF', label: 'CB' },
            { y: 68, x: 62, role: 'DEF', label: 'CB' },
            { y: 68, x: 85, role: 'DEF', label: 'RB' },
            { y: 44, x: 15, role: 'MID', label: 'LM' },
            { y: 44, x: 32, role: 'MID', label: 'CM' },
            { y: 46, x: 50, role: 'MID', label: 'CM' },
            { y: 44, x: 68, role: 'MID', label: 'CM' },
            { y: 44, x: 85, role: 'MID', label: 'RM' },
            { y: 18, x: 50, role: 'FWD', label: 'ST' }
        ]
    },
    '5-3-2': { 
        label: '5-3-2', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 68, x: 12, role: 'DEF', label: 'LWB' },
            { y: 68, x: 31, role: 'DEF', label: 'CB' },
            { y: 68, x: 50, role: 'DEF', label: 'CB' },
            { y: 68, x: 69, role: 'DEF', label: 'CB' },
            { y: 68, x: 88, role: 'DEF', label: 'RWB' },
            { y: 44, x: 25, role: 'MID', label: 'CM' },
            { y: 44, x: 50, role: 'MID', label: 'CM' },
            { y: 44, x: 75, role: 'MID', label: 'CM' },
            { y: 20, x: 35, role: 'FWD', label: 'ST' },
            { y: 20, x: 65, role: 'FWD', label: 'ST' }
        ]
    },
    '4-1-4-1': { 
        label: '4-1-4-1', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 72, x: 15, role: 'DEF', label: 'LB' },
            { y: 72, x: 38, role: 'DEF', label: 'CB' },
            { y: 72, x: 62, role: 'DEF', label: 'CB' },
            { y: 72, x: 85, role: 'DEF', label: 'RB' },
            { y: 56, x: 50, role: 'CDM', label: 'CDM' },
            { y: 38, x: 15, role: 'MID', label: 'LM' },
            { y: 38, x: 38, role: 'MID', label: 'CM' },
            { y: 38, x: 62, role: 'MID', label: 'CM' },
            { y: 38, x: 85, role: 'MID', label: 'RM' },
            { y: 16, x: 50, role: 'ST', label: 'ST' }
        ]
    }
};

const ROLE_COLORS = {
    GK: '#f59e0b',
    DEF: '#3b82f6',
    CDM: '#8b5cf6',
    MID: '#10b981',
    CAM: '#06b6d4',
    FWD: '#ef4444',
    ST: '#ef4444',
};

/* ─── helpers ──────────────────────────────────────────────────────── */
function teamMeta(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return { name: '???', school: null };
    const school = SCHOOLS.find(s => s.id === team.schoolId);
    return { name: `${school?.name ?? ''} ${team.ageGroup}`.trim(), school };
}

function pad(n) { return String(n).padStart(2, '0'); }

const QUICK_ACTIONS = [
    { key: 'goal',         label: '⚽',  tooltip: 'Goal / Shot',    color: '#22c55e', hoverColor: '#16a34a' },
    { key: 'assist',       label: '🅰️', tooltip: 'Assist',         color: '#6366f1', hoverColor: '#4f46e5' },
    { key: 'yellowCard',   label: '🟨',  tooltip: 'Yellow Card',    color: '#f59e0b', hoverColor: '#d97706' },
    { key: 'redCard',      label: '🟥',  tooltip: 'Red Card',       color: '#ef4444', hoverColor: '#dc2626' },
];

const DETAIL_STATS = [
    'Pass Completed', 'Successful Dribbles', 'Tackles Per Game',
    'Interceptions Per Game', 'Successful Clearances', 'Successful Blocks',
    'Corners Taken', 'Freekicks Taken', 'Penalties Taken',
    'Successful Tackles', 'Minutes Played',
];

function initPlayerStats(playerIds, side) {
    const out = {};
    playerIds.forEach(id => {
        out[id] = {
            Goals: 0, Assists: 0, 'Shots on Target': 0, Shots: 0,
            'Blocked Shots': 0,
            'Pass Completed': 0, 'Successful Dribbles': 0,
            'Tackles Per Game': 0, 'Interceptions Per Game': 0,
            'Successful Clearances': 0, 'Successful Blocks': 0,
            'Corners Taken': 0, 'Freekicks Taken': 0,
            'Penalties Taken': 0, 'Successful Tackles': 0,
            'Fouls Committed': 0,
            Saves: 0, 'Penalties Saved': 0, 'Free Kick Saves': 0,
            'Goals Conceded': 0, Punches: 0, 'High Claims': 0,
            minutesPlayed: 0, yellowCards: 0, redCards: 0,
            ownGoals: 0,
            team: side,
            _updatedAt: 0,
            _statUpdatedAt: {}
        };
    });
    return out;
}

/* ─── component ────────────────────────────────────────────────────── */
export default function LiveMatch({ 
    matchData: matchDataProp, 
    match: matchProp, 
    schools: schoolsProp, 
    allStudents: allStudentsProp, 
    allPlayers: allPlayersProp, 
    year, 
    currentAnalyst,
    onUpdateMatch, 
    onEndMatch, 
    onCancel, 
    isRefereeMode 
}) {
    const matchData = matchDataProp || matchProp || {};
    const allStudents = allStudentsProp || allPlayersProp || [];
    const schools = schoolsProp || [];
    const { 
        homeTeamId, awayTeamId, ageGroup, matchday,
        homeSquadSelection, awaySquadSelection
    } = matchData;
    
    // Authorized Match Controllers (Referees, Master Loggers, Pitchside Analysts, Admins)
    const isMasterLogger = useMemo(() => {
        if (!currentAnalyst) return true; // Default fallback if not specified
        return currentAnalyst.isMasterLogger === true ||
               currentAnalyst.username === 'johnathan' ||
               currentAnalyst.username === 'jonathan' ||
               currentAnalyst.id === 'analyst_johnathan' ||
               currentAnalyst.id === 'analyst_jonathan' ||
               currentAnalyst.username === 'noah' ||
               currentAnalyst.id === 'analyst_noah' ||
               isRefereeMode === true ||
               currentAnalyst.role === 'referee' ||
               currentAnalyst.role === 'admin' ||
               currentAnalyst.role === 'statistician';
    }, [currentAnalyst, isRefereeMode]);

    const captureRole = currentAnalyst?.captureRole || 'all';

    const clockState = matchData.liveState || {};
    const eventState = isRefereeMode ? (matchData.refereeLiveState || {}) : clockState;

    // Fallback if players are missing from global state
    const homePlayers = useMemo(() => {
        const targetTeamName = (matchData.homeTeam || '').toLowerCase();
        const cleanHomeId = (homeTeamId || '').replace(/-team-(pmc|ucl|boys|girls|u\d+)/gi, '').toLowerCase();
        const fullRoster = allStudents.filter(s => {
            const sSchool = (s.schoolId || '').toLowerCase();
            const sTeam = (s.teamAssignments?.[year] || '').toLowerCase();
            return (
                (cleanHomeId && sSchool === cleanHomeId) ||
                (homeTeamId && sSchool === homeTeamId.toLowerCase()) ||
                (homeTeamId && sTeam === homeTeamId.toLowerCase()) ||
                (cleanHomeId && sTeam.includes(cleanHomeId)) ||
                (targetTeamName && s.schoolName?.toLowerCase().includes(targetTeamName)) ||
                (targetTeamName && s.clubName?.toLowerCase().includes(targetTeamName))
            );
        }).map(s => s.id);

        const activeHomeSquad = matchDataRef.current?.homeSquadSelection || homeSquadSelection;
        const squadIds = [
            ...(activeHomeSquad?.startingXI || []),
            ...(activeHomeSquad?.benchPlayers || [])
        ].filter(Boolean);

        return Array.from(new Set([...squadIds, ...(matchData.homePlayers || []), ...fullRoster]));
    }, [matchData.homePlayers, homeSquadSelection, matchData.homeTeam, homeTeamId, allStudents, year]);

    const awayPlayers = useMemo(() => {
        const targetTeamName = (matchData.awayTeam || '').toLowerCase();
        const cleanAwayId = (awayTeamId || '').replace(/-team-(pmc|ucl|boys|girls|u\d+)/gi, '').toLowerCase();
        const fullRoster = allStudents.filter(s => {
            const sSchool = (s.schoolId || '').toLowerCase();
            const sTeam = (s.teamAssignments?.[year] || '').toLowerCase();
            return (
                (cleanAwayId && sSchool === cleanAwayId) ||
                (awayTeamId && sSchool === awayTeamId.toLowerCase()) ||
                (awayTeamId && sTeam === awayTeamId.toLowerCase()) ||
                (cleanAwayId && sTeam.includes(cleanAwayId)) ||
                (targetTeamName && s.schoolName?.toLowerCase().includes(targetTeamName)) ||
                (targetTeamName && s.clubName?.toLowerCase().includes(targetTeamName))
            );
        }).map(s => s.id);

        const activeAwaySquad = matchDataRef.current?.awaySquadSelection || awaySquadSelection;
        const squadIds = [
            ...(activeAwaySquad?.startingXI || []),
            ...(activeAwaySquad?.benchPlayers || [])
        ].filter(Boolean);

        return Array.from(new Set([...squadIds, ...(matchData.awayPlayers || []), ...fullRoster]));
    }, [matchData.awayPlayers, awaySquadSelection, matchData.awayTeam, awayTeamId, allStudents, year]);

    // Starters and Bench players from Coach selection (with fallbacks if none submitted)
    const homeStarters = useMemo(() => {
        if (homeSquadSelection?.startingXI) {
            return homeSquadSelection.startingXI.filter(Boolean);
        }
        return homePlayers.slice(0, 11);
    }, [homeSquadSelection, homePlayers]);

    const homeBench = useMemo(() => {
        if (homeSquadSelection?.benchPlayers) {
            return homeSquadSelection.benchPlayers;
        }
        return homePlayers.slice(11);
    }, [homeSquadSelection, homePlayers]);

    const homeUnassigned = useMemo(() => {
        const selected = new Set([...homeStarters, ...homeBench]);
        return homePlayers.filter(id => !selected.has(id));
    }, [homePlayers, homeStarters, homeBench]);

    const awayStarters = useMemo(() => {
        if (awaySquadSelection?.startingXI) {
            return awaySquadSelection.startingXI.filter(Boolean);
        }
        return awayPlayers.slice(0, 11);
    }, [awaySquadSelection, awayPlayers]);

    const awayBench = useMemo(() => {
        if (awaySquadSelection?.benchPlayers) {
            return awaySquadSelection.benchPlayers;
        }
        return awayPlayers.slice(11);
    }, [awaySquadSelection, awayPlayers]);

    const awayUnassigned = useMemo(() => {
        const selected = new Set([...awayStarters, ...awayBench]);
        return awayPlayers.filter(id => !selected.has(id));
    }, [awayPlayers, awayStarters, awayBench]);

    const startTimeRef = useRef(clockState.startTime || Date.now());
    const offsetRef = useRef(clockState.elapsedOffset || 0);

    const [period, setPeriod] = useState(clockState.period || '1H');          // '1H' | 'HT' | '2H'
    const [isPaused, setIsPaused] = useState(clockState.isRunning === false);
    const lastClockUpdatedAtRef = useRef(clockState.clockUpdatedAt || clockState.updatedAt || 0);
    const lastAppliedClockTimeRef = useRef(clockState.clockUpdatedAt || clockState.updatedAt || 0);
    
    // Sync React state if incoming clockState updates from remote
    useEffect(() => {
        const incClockTime = clockState.clockUpdatedAt || clockState.updatedAt || 0;
        const isTerminated = clockState.period === 'HT' || clockState.period === 'FT' || matchData.status === 'completed' || matchData.status === 'refereed' || matchData.status === 'approved' || matchData.isFinished === true;

        if (isTerminated) {
            setIsPaused(true);
            if (clockState.period) setPeriod(clockState.period);
            if (clockState.elapsedOffset !== undefined) {
                offsetRef.current = clockState.elapsedOffset;
                setElapsed(clockState.elapsedOffset);
            }
            lastAppliedClockTimeRef.current = Math.max(lastAppliedClockTimeRef.current, incClockTime);
            return;
        }

        if (clockState.isRunning === false) {
            setIsPaused(true);
            if (clockState.period) setPeriod(clockState.period);
            if (clockState.elapsedOffset !== undefined) {
                offsetRef.current = clockState.elapsedOffset;
                setElapsed(clockState.elapsedOffset);
            }
            lastAppliedClockTimeRef.current = Math.max(lastAppliedClockTimeRef.current, incClockTime);
            return;
        }

        if (incClockTime > lastAppliedClockTimeRef.current) {
            lastAppliedClockTimeRef.current = incClockTime;
            setIsPaused(false);
            if (clockState.period) setPeriod(clockState.period);
            if (clockState.startTime) startTimeRef.current = clockState.startTime;
            if (clockState.elapsedOffset !== undefined) offsetRef.current = clockState.elapsedOffset;
        }
    }, [clockState.isRunning, clockState.period, clockState.startTime, clockState.elapsedOffset, clockState.clockUpdatedAt, clockState.updatedAt, matchData.status, matchData.isFinished]);

    const localUpdatedAtRef = useRef(clockState.clockUpdatedAt || 0);
    const localSeqRef = useRef(1);
    const [tombstoneEventIds, setTombstoneEventIds] = useState(() => {
        return matchData.tombstoneEventIds || matchData.liveState?.tombstoneEventIds || [];
    });

    // Merge incoming tombstones from remote loggers
    useEffect(() => {
        const incTombstones = matchData.tombstoneEventIds || matchData.liveState?.tombstoneEventIds;
        if (Array.isArray(incTombstones) && incTombstones.length > 0) {
            setTombstoneEventIds(prev => {
                const merged = mergeTombstones(prev, incTombstones);
                if (merged.length !== prev.length) return merged;
                return prev;
            });
        }
    }, [matchData.tombstoneEventIds, matchData.liveState?.tombstoneEventIds]);

    // Bidirectional timeline sync: Merge events logged by any logger without resurrecting tombstoned entries
    useEffect(() => {
        const incomingTimeline = matchData.timeline || matchData.liveState?.timeline;
        if (Array.isArray(incomingTimeline)) {
            setTimeline(prevLocal => {
                const merged = syncTimeline(prevLocal, incomingTimeline, tombstoneEventIds);
                if (merged.length !== (prevLocal || []).length || merged.some((e, i) => e.id !== prevLocal[i]?.id)) {
                    return merged;
                }
                return prevLocal;
            });
        }
    }, [matchData.timeline, matchData.liveState?.timeline, tombstoneEventIds]);

    const [elapsed, setElapsed] = useState(() => {
        if (clockState.isRunning === false) return offsetRef.current;
        return offsetRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
    });

    const [playerStats, setPlayerStats] = useState(() => {
        if (eventState.playerStats && Object.keys(eventState.playerStats).length > 0) return eventState.playerStats;
        return {
            ...initPlayerStats(homePlayers, 'home'),
            ...initPlayerStats(awayPlayers, 'away'),
        };
    });
    const [timeline, setTimeline] = useState(eventState.timeline || []);

    // Synchronize incoming player stats across data capturers supporting decreases and rejecting stale updates
    useEffect(() => {
        const incomingStats = matchData.playerStats || matchData.liveState?.playerStats;
        if (incomingStats && typeof incomingStats === 'object' && Object.keys(incomingStats).length > 0) {
            setPlayerStats(prev => {
                const incMatchTime = matchData.updatedAt || matchData.liveState?.updatedAt || 0;
                const localMatchTime = localUpdatedAtRef.current || 0;
                const { next, hasChanges } = syncPlayerStats(prev, incomingStats, localMatchTime, incMatchTime);
                return hasChanges ? next : prev;
            });
        }
    }, [matchData.playerStats, matchData.liveState?.playerStats, matchData.updatedAt, matchData.liveState?.updatedAt]);
    const [shotModalData, setShotModalData] = useState(null); // { player, defaultOutcome, teammates }
    const [editingEvent, setEditingEvent] = useState(null); // Event being edited or overturned
    const [expandedPlayer, setExpandedPlayer] = useState(null);
    const [livePossession, setLivePossession] = useState(() => matchData?.possession || matchData?.liveState?.possession || { homePct: 50, awayPct: 50 });
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSubmittingEnd, setIsSubmittingEnd] = useState(false);
    const [hoveredBtn, setHoveredBtn] = useState(null);  // `${playerId}-${actionKey}`

    const matchDataRef = useRef(matchData);
    const isEndingRef = useRef(false);
    useEffect(() => {
        matchDataRef.current = matchData;
    }, [matchData]);

    const [homeViewMode, setHomeViewMode] = useState('list'); // 'list' | 'pitch'
    const [awayViewMode, setAwayViewMode] = useState('list'); // 'list' | 'pitch'
    const [mobileTab, setMobileTab] = useState('home'); // 'home' | 'timeline' | 'away'
    const [activePitchPlayerMenu, setActivePitchPlayerMenu] = useState(null); // { playerId, x, y, side }
    const [gkSaveModalData, setGkSaveModalData] = useState(null); // { player }
    const [captureViewMode, setCaptureViewMode] = useState('tile'); // 'tile' | 'roster'
    const [showTimeline, setShowTimeline] = useState(false); // auto-hidden by default for Data Logger!
    const [timelineFilter, setTimelineFilter] = useState('all'); // 'all' | 'goal' | 'shot' | 'card' | 'foul' | 'possession'
    const [timelineTeamFilter, setTimelineTeamFilter] = useState('all'); // 'all' | 'home' | 'away'
    const [timelineLayout, setTimelineLayout] = useState('expanded'); // 'expanded' | 'stream'

    const handleTogglePause = () => {
        if (captureRole === 'readonly') return;
        const now = Date.now();
        lastClockUpdatedAtRef.current = now;
        lastAppliedClockTimeRef.current = now;
        localUpdatedAtRef.current = now;
        let nextIsRunning;
        let nextStartTime;
        let nextOffset;

        if (isPaused) {
            // Resuming
            nextIsRunning = true;
            nextStartTime = now;
            nextOffset = offsetRef.current;
            startTimeRef.current = nextStartTime;
            setIsPaused(false);
        } else {
            // Pausing
            nextIsRunning = false;
            nextOffset = offsetRef.current + Math.max(0, Math.floor((now - startTimeRef.current) / 1000));
            nextStartTime = now;
            offsetRef.current = nextOffset;
            setElapsed(nextOffset);
            setIsPaused(true);
        }

        if (onUpdateMatch) {
            const currentPoss = livePossession || matchDataRef.current?.possession || matchDataRef.current?.liveState?.possession || { homePct: 50, awayPct: 50 };
            const nextVersion = (matchDataRef.current?.version || 0) + 1;
            const updatedLiveState = {
                ...(matchDataRef.current?.liveState || {}),
                isRunning: nextIsRunning,
                period,
                elapsedOffset: nextOffset,
                startTime: nextStartTime,
                clockUpdatedAt: now,
                updatedAt: now,
                playerStats,
                timeline,
                possession: currentPoss,
                version: nextVersion
            };
            const updatedRefereeState = {
                ...(matchDataRef.current?.refereeLiveState || {}),
                isRunning: nextIsRunning,
                period,
                elapsedOffset: nextOffset,
                startTime: nextStartTime,
                clockUpdatedAt: now,
                updatedAt: now,
                playerStats,
                timeline,
                version: nextVersion
            };
            onUpdateMatch({
                ...matchDataRef.current,
                homeScore,
                awayScore,
                timeline,
                playerStats,
                possession: currentPoss,
                updatedAt: now,
                version: nextVersion,
                liveState: updatedLiveState,
                refereeLiveState: updatedRefereeState
            });
        }
    };

    const handleEndFirstHalf = () => {
        if (captureRole === 'readonly') return;
        const now = Date.now();
        lastClockUpdatedAtRef.current = now;
        lastAppliedClockTimeRef.current = now;
        localUpdatedAtRef.current = now;
        offsetRef.current = 45 * 60; // strictly 45:00 at half time
        setElapsed(45 * 60);
        setIsPaused(true);
        setPeriod('HT');

        if (onUpdateMatch) {
            const currentPoss = livePossession || matchDataRef.current?.possession || matchDataRef.current?.liveState?.possession || { homePct: 50, awayPct: 50 };
            const nextVersion = (matchDataRef.current?.version || 0) + 1;
            const updatedLiveState = {
                ...(matchDataRef.current?.liveState || {}),
                isRunning: false,
                period: 'HT',
                elapsedOffset: 45 * 60,
                startTime: now,
                clockUpdatedAt: now,
                updatedAt: now,
                playerStats,
                timeline,
                possession: currentPoss,
                version: nextVersion
            };
            const updatedRefereeState = {
                ...(matchDataRef.current?.refereeLiveState || {}),
                isRunning: false,
                period: 'HT',
                elapsedOffset: 45 * 60,
                startTime: now,
                clockUpdatedAt: now,
                updatedAt: now,
                playerStats,
                timeline,
                version: nextVersion
            };
            onUpdateMatch({
                ...matchDataRef.current,
                homeScore,
                awayScore,
                timeline,
                playerStats,
                possession: currentPoss,
                updatedAt: now,
                version: nextVersion,
                liveState: updatedLiveState,
                refereeLiveState: updatedRefereeState
            });
        }
    };

    const handleStartSecondHalf = () => {
        if (captureRole === 'readonly') return;
        const now = Date.now();
        lastClockUpdatedAtRef.current = now;
        lastAppliedClockTimeRef.current = now;
        localUpdatedAtRef.current = now;
        offsetRef.current = 45 * 60; // strictly 45:00
        startTimeRef.current = now;
        setIsPaused(false);
        setPeriod('2H');
        setElapsed(45 * 60);

        if (onUpdateMatch) {
            const currentPoss = livePossession || matchDataRef.current?.possession || matchDataRef.current?.liveState?.possession || { homePct: 50, awayPct: 50 };
            const nextVersion = (matchDataRef.current?.version || 0) + 1;
            const updatedLiveState = {
                ...(matchDataRef.current?.liveState || {}),
                isRunning: true,
                period: '2H',
                elapsedOffset: 45 * 60,
                startTime: now,
                clockUpdatedAt: now,
                updatedAt: now,
                playerStats,
                timeline,
                possession: currentPoss,
                version: nextVersion
            };
            const updatedRefereeState = {
                ...(matchDataRef.current?.refereeLiveState || {}),
                isRunning: true,
                period: '2H',
                elapsedOffset: 45 * 60,
                startTime: now,
                clockUpdatedAt: now,
                updatedAt: now,
                playerStats,
                timeline,
                version: nextVersion
            };
            onUpdateMatch({
                ...matchDataRef.current,
                homeScore,
                awayScore,
                timeline,
                playerStats,
                possession: currentPoss,
                updatedAt: now,
                version: nextVersion,
                liveState: updatedLiveState,
                refereeLiveState: updatedRefereeState
            });
        }
    };

    /* timer */
    useEffect(() => {
        let iv = null;
        const isTerminated = period === 'HT' || period === 'FT' || matchData?.status === 'completed' || matchData?.status === 'refereed' || matchData?.status === 'approved' || matchData?.isFinished === true;
        if (!isPaused && !isTerminated) {
            iv = setInterval(() => {
                setElapsed(offsetRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);
        }
        return () => {
            if (iv) clearInterval(iv);
        };
    }, [isPaused, isRefereeMode, clockState.startTime, period, matchData?.status, matchData?.isFinished]);

    /* lookup helper */
    const studentsById = useMemo(() => {
        return createPlayerLookupMap(allStudents, matchData);
    }, [allStudents, matchData]);

    const resolveTeamMeta = useCallback((teamId, fallbackName) => {
        if (!teamId && !fallbackName) return { name: 'Unknown Team', school: null };
        
        // 1. Look up in schools prop
        const foundSchool = (schools || []).find(s => s.id === teamId || s.rawId === teamId);
        if (foundSchool) {
            return { name: foundSchool.name, school: foundSchool };
        }

        // 2. Look up in mock TEAMS & SCHOOLS
        const mockTeam = TEAMS.find(t => t.id === teamId);
        if (mockTeam) {
            const mockSchool = SCHOOLS.find(s => s.id === mockTeam.schoolId);
            return { name: `${mockSchool?.name ?? ''} ${mockTeam.ageGroup}`.trim(), school: mockSchool };
        }

        // 3. Fallback to direct name string
        if (fallbackName) {
            const schoolByName = (schools || []).find(s => s.name?.toLowerCase() === fallbackName.toLowerCase());
            return { name: fallbackName, school: schoolByName || null };
        }

        return { name: teamId || 'Team', school: null };
    }, [schools]);

    const home = useMemo(() => resolveTeamMeta(homeTeamId, matchData.homeTeam), [resolveTeamMeta, homeTeamId, matchData.homeTeam]);
    const away = useMemo(() => resolveTeamMeta(awayTeamId, matchData.awayTeam), [resolveTeamMeta, awayTeamId, matchData.awayTeam]);

    /* derived scores */
    const { homeScore, awayScore } = useMemo(() => {
        return recalculateMatchScores(
            { ...matchData, homePlayers, awayPlayers, tombstoneEventIds },
            playerStats,
            timeline
        );
    }, [matchData, homePlayers, awayPlayers, tombstoneEventIds, playerStats, timeline]);

    // Sync state to Match object whenever critical states change
    useEffect(() => {
        if (isEndingRef.current) return;
        if (onUpdateMatch) {
            const currentUpdatedAt = localUpdatedAtRef.current || Date.now();
            const nextVersion = (matchDataRef.current?.version || 0) + 1;

            const currentPoss = livePossession || matchDataRef.current?.possession || matchDataRef.current?.liveState?.possession || { homePct: 50, awayPct: 50 };

            const isTerminated = period === 'HT' || period === 'FT' || matchDataRef.current?.status === 'completed' || matchDataRef.current?.status === 'refereed' || matchDataRef.current?.status === 'approved' || matchDataRef.current?.isFinished === true;
            const effectiveRunning = isTerminated ? false : !isPaused;
            const effectiveClockUpdatedAt = lastClockUpdatedAtRef.current || clockState.clockUpdatedAt || currentUpdatedAt;

            const currentHomeSquad = matchDataRef.current?.homeSquadSelection || homeSquadSelection;
            const currentAwaySquad = matchDataRef.current?.awaySquadSelection || awaySquadSelection;

            const effectiveHomeXI = (currentHomeSquad?.startingXI?.filter(Boolean)?.length === 11)
                ? currentHomeSquad.startingXI.filter(Boolean)
                : (homeStarters.length >= 11 ? homeStarters.slice(0, 11) : homePlayers.slice(0, 11));
            const effectiveHomeBench = (currentHomeSquad?.benchPlayers?.length > 0)
                ? currentHomeSquad.benchPlayers
                : (homeBench.length > 0 ? homeBench : homePlayers.slice(11));

            const effectiveAwayXI = (currentAwaySquad?.startingXI?.filter(Boolean)?.length === 11)
                ? currentAwaySquad.startingXI.filter(Boolean)
                : (awayStarters.length >= 11 ? awayStarters.slice(0, 11) : awayPlayers.slice(0, 11));
            const effectiveAwayBench = (currentAwaySquad?.benchPlayers?.length > 0)
                ? currentAwaySquad.benchPlayers
                : (awayBench.length > 0 ? awayBench : awayPlayers.slice(11));

            const effectiveHomeSquad = currentHomeSquad ? {
                ...currentHomeSquad,
                formation: currentHomeSquad.formation || '4-3-3',
                startingXI: (currentHomeSquad.startingXI && currentHomeSquad.startingXI.filter(Boolean).length > 0) ? currentHomeSquad.startingXI.filter(Boolean) : effectiveHomeXI,
                benchPlayers: currentHomeSquad.benchPlayers || effectiveHomeBench,
                validationStatus: currentHomeSquad.validationStatus || 'approved',
                captainId: currentHomeSquad.captainId || effectiveHomeXI[0] || null,
                lastModified: currentHomeSquad.lastModified || currentUpdatedAt
            } : {
                formation: '4-3-3',
                startingXI: effectiveHomeXI,
                benchPlayers: effectiveHomeBench,
                validationStatus: 'approved',
                captainId: effectiveHomeXI[0] || null,
                lastModified: currentUpdatedAt
            };

            const effectiveAwaySquad = currentAwaySquad ? {
                ...currentAwaySquad,
                formation: currentAwaySquad.formation || '4-3-3',
                startingXI: (currentAwaySquad.startingXI && currentAwaySquad.startingXI.filter(Boolean).length > 0) ? currentAwaySquad.startingXI.filter(Boolean) : effectiveAwayXI,
                benchPlayers: currentAwaySquad.benchPlayers || effectiveAwayBench,
                validationStatus: currentAwaySquad.validationStatus || 'approved',
                captainId: currentAwaySquad.captainId || effectiveAwayXI[0] || null,
                lastModified: currentAwaySquad.lastModified || currentUpdatedAt
            } : {
                formation: '4-3-3',
                startingXI: effectiveAwayXI,
                benchPlayers: effectiveAwayBench,
                validationStatus: 'approved',
                captainId: effectiveAwayXI[0] || null,
                lastModified: currentUpdatedAt
            };

            const combinedHomePlayers = Array.from(new Set([
                ...(effectiveHomeSquad.startingXI || []),
                ...(effectiveHomeSquad.benchPlayers || []),
                ...(matchDataRef.current?.homePlayers || []),
                ...homePlayers
            ]));
            const combinedAwayPlayers = Array.from(new Set([
                ...(effectiveAwaySquad.startingXI || []),
                ...(effectiveAwaySquad.benchPlayers || []),
                ...(matchDataRef.current?.awayPlayers || []),
                ...awayPlayers
            ]));

            const updatedLiveState = {
                ...(matchDataRef.current?.liveState || clockState || {}),
                isRunning: effectiveRunning,
                startTime: startTimeRef.current,
                elapsedOffset: offsetRef.current,
                period: period,
                clockUpdatedAt: effectiveClockUpdatedAt,
                playerStats,
                timeline,
                possession: currentPoss,
                tombstoneEventIds,
                updatedAt: currentUpdatedAt,
                version: nextVersion
            };
            const updatedRefereeState = {
                ...(matchDataRef.current?.refereeLiveState || eventState || {}),
                isRunning: effectiveRunning,
                startTime: startTimeRef.current,
                elapsedOffset: offsetRef.current,
                period: period,
                clockUpdatedAt: effectiveClockUpdatedAt,
                playerStats,
                timeline,
                tombstoneEventIds,
                updatedAt: currentUpdatedAt,
                version: nextVersion
            };

            onUpdateMatch({
                ...matchDataRef.current,
                homeScore,
                awayScore,
                timeline,
                playerStats,
                possession: currentPoss,
                tombstoneEventIds,
                updatedAt: currentUpdatedAt,
                version: nextVersion,
                homeSquadSelection: effectiveHomeSquad,
                awaySquadSelection: effectiveAwaySquad,
                homePlayers: combinedHomePlayers,
                awayPlayers: combinedAwayPlayers,
                liveState: updatedLiveState,
                refereeLiveState: updatedRefereeState
            });
        }
        // eslint-disable-next-line
    }, [isPaused, period, playerStats, timeline, homeScore, awayScore, isRefereeMode, livePossession, tombstoneEventIds]);

    /* quick-action handler */
    const handleQuickAction = useCallback((playerId, actionKey) => {
        // Enforce role-based data capture scoping
        if (captureRole === 'possession') return; // Possession specialist cannot log player events
        const isShotAction = ['goal', 'shotOnTarget', 'shotMissed', 'shotBlocked', 'headerShot', 'penaltyShot', 'freekickShot', 'ownGoal'].includes(actionKey);
        if (captureRole === 'shots' && !isShotAction) return; // Shot specialist cannot log general events
        if (captureRole === 'general' && isShotAction) return; // General events specialist cannot log shots

        const isHome = homePlayers.includes(playerId);
        const targetSideId = isHome ? (matchData.homeTeamId || matchData.homeSchoolId) : (matchData.awayTeamId || matchData.awaySchoolId);
        const student = resolvePlayer(playerId, allStudents, studentsById, targetSideId);
        const name = resolvePlayerName(playerId, allStudents, studentsById, '', targetSideId);
        const effectivePlayerId = student?.id || playerId;
        const teammates = isHome 
            ? homePlayers.map(id => resolvePlayer(id, allStudents, studentsById, matchData.homeTeamId)).filter(Boolean)
            : awayPlayers.map(id => resolvePlayer(id, allStudents, studentsById, matchData.awayTeamId)).filter(Boolean);

        if (isShotAction) {
            let defaultGoalType = 'foot';
            let defaultOutcome = 'goal';

            if (actionKey === 'headerShot') defaultGoalType = 'header';
            if (actionKey === 'penaltyShot') defaultGoalType = 'penalty';
            if (actionKey === 'freekickShot') defaultGoalType = 'freekick';
            if (actionKey === 'ownGoal') defaultGoalType = 'own-goal';

            if (actionKey === 'shotOnTarget') defaultOutcome = 'saved';
            if (actionKey === 'shotBlocked') defaultOutcome = 'blocked';
            if (actionKey === 'shotMissed') defaultOutcome = 'miss';

            // Open LiveShotModal to place shot on goalmouth map
            setShotModalData({
                player: { id: effectivePlayerId, name },
                defaultOutcome: defaultOutcome,
                defaultGoalType: defaultGoalType,
                teammates
            });
        } else {
            // Direct immediate logging using production reducer
            localSeqRef.current += 1;
            const now = Date.now();
            localUpdatedAtRef.current = now;

            const actionToken = `act-${effectivePlayerId}-${now}-${localSeqRef.current}`;
            const outcome = recordMatchActionState({
                playerStats,
                timeline,
                actionKey,
                playerId: effectivePlayerId,
                playerName: name,
                team: isHome ? 'home' : 'away',
                teamId: isHome ? matchData.homeTeamId : matchData.awayTeamId,
                teamName: isHome ? home.name : away.name,
                elapsed,
                period,
                now,
                seq: localSeqRef.current,
                actionToken
            });

            if (!outcome.rejected) {
                setTimeline(outcome.timeline);
                setPlayerStats(outcome.playerStats);
            }
        }
    }, [elapsed, homePlayers, awayPlayers, studentsById, period, matchData.homeTeamId, matchData.awayTeamId, home.name, away.name, allStudents, captureRole, playerStats, timeline]);

    /* Shot/Goal Modal Save */
    const handleSaveShot = (shotDetails) => {
        if (!shotModalData) return;
        const { player } = shotModalData;
        const playerId = player.id;
        const isHome = homePlayers.includes(playerId);
        const { result } = shotDetails;

        const resolvedShooterName = resolvePlayerName(player || playerId, allStudents, studentsById);

        // Goalkeeper attribution: ONLY resolve or prompt for goalkeeper if result === 'saved'
        let oppGkId = null;
        let oppGkName = 'Goalkeeper';

        if (result === 'saved') {
            const oppSide = isHome ? 'away' : 'home';
            const oppPlayersList = isHome ? awayPlayers : homePlayers;
            const gkRes = resolveActiveGoalkeeper({ side: oppSide, matchData, allStudents });
            oppGkId = gkRes.goalkeeperId;

            if (gkRes.isAmbiguous || !oppGkId) {
                const chosenId = window.prompt?.(
                    `Goalkeeper for ${isHome ? away.name : home.name} is ambiguous. Please select or enter the Goalkeeper player ID from the active opposing lineup:\n` +
                    oppPlayersList.map(pid => `${pid}: ${resolvePlayerName(pid, allStudents, studentsById)}`).join('\n'),
                    oppPlayersList[0]
                );

                // CRITICAL FIX: Validate selection against the active opposing lineup and abort if cancelled
                if (chosenId && oppPlayersList.some(p => String(p).trim() === String(chosenId).trim())) {
                    oppGkId = chosenId.trim();
                } else {
                    alert(`Goalkeeper selection cancelled or not in active opposing lineup. Shot save cancelled.`);
                    return; // DO NOT record save without crediting an active goalkeeper!
                }
            }
            oppGkName = resolvePlayerName(oppGkId, allStudents, studentsById);
        }

        localSeqRef.current += 1;
        const now = Date.now();
        localUpdatedAtRef.current = now;

        const actionToken = shotDetails.actionToken || `act-${playerId}-${now}-${localSeqRef.current}`;
        const outcome = recordMatchShotState({
            playerStats,
            timeline,
            shotDetails,
            shooterId: playerId,
            shooterName: resolvedShooterName,
            isHome,
            homeTeamId: matchData.homeTeamId,
            awayTeamId: matchData.awayTeamId,
            homeTeamName: home.name,
            awayTeamName: away.name,
            oppGkId,
            oppGkName,
            oppPlayersList: isHome ? awayPlayers : homePlayers,
            elapsed,
            period,
            now,
            seq: localSeqRef.current,
            actionToken
        });

        if (outcome.rejected) {
            console.warn('[LiveMatch] Shot rejected:', outcome.reason);
            return;
        }

        setTimeline(outcome.timeline);
        setPlayerStats(outcome.playerStats);
        setShotModalData(null);
    };

    const handleSaveGkSave = (gkSaveDetails) => {
        if (!gkSaveModalData) return;
        const { player } = gkSaveModalData;
        const playerId = player.id;
        const isHome = homePlayers.includes(playerId);
        const resolvedGkName = resolvePlayerName(player || playerId, allStudents, studentsById);

        localSeqRef.current += 1;
        const now = Date.now();
        localUpdatedAtRef.current = now;

        const actionToken = gkSaveDetails.actionToken || `gk-${playerId}-${now}-${localSeqRef.current}`;
        const outcome = recordMatchGkSaveState({
            playerStats,
            timeline,
            gkSaveDetails,
            gkId: playerId,
            gkName: resolvedGkName,
            isHome,
            homeTeamId: matchData.homeTeamId,
            awayTeamId: matchData.awayTeamId,
            homeTeamName: home.name,
            awayTeamName: away.name,
            elapsed,
            period,
            now,
            seq: localSeqRef.current,
            actionToken
        });

        if (outcome.rejected) {
            console.warn('[LiveMatch] GK Save rejected:', outcome.reason);
            setGkSaveModalData(null);
            return;
        }

        setTimeline(outcome.timeline);
        setPlayerStats(outcome.playerStats);
        setGkSaveModalData(null);
    };

    /* Undo/Delete Timeline Event */
    const handleUndoEvent = (eventId) => {
        if (captureRole === 'readonly') return;

        localSeqRef.current += 1;
        const now = Date.now();
        localUpdatedAtRef.current = now;

        const outcome = undoMatchEventState({
            playerStats,
            timeline,
            tombstoneEventIds,
            eventId,
            now,
            seq: localSeqRef.current
        });

        if (!outcome.undone) return;

        setTombstoneEventIds(outcome.tombstoneEventIds);
        setPlayerStats(outcome.playerStats);
        setTimeline(outcome.timeline);
    };

    /* Edit Match Event */
    const handleSaveEditedEvent = (eventId, updatedFields) => {
        if (captureRole === 'readonly') return;
        localSeqRef.current += 1;
        const now = Date.now();
        localUpdatedAtRef.current = now;

        const outcome = editMatchEventState({
            playerStats,
            timeline,
            tombstoneEventIds,
            eventId,
            updatedFields,
            now,
            seq: localSeqRef.current,
            editedBy: isRefereeMode ? 'referee' : 'operator'
        });

        if (!outcome.edited) return;

        setPlayerStats(outcome.playerStats);
        setTimeline(outcome.timeline);
        setEditingEvent(null);
    };

    /* Overturn Match Event (Referee Call Change) */
    const handleOverturnEvent = (eventId, overturnReason) => {
        if (captureRole === 'readonly') return;
        localSeqRef.current += 1;
        const now = Date.now();
        localUpdatedAtRef.current = now;

        const outcome = overturnMatchEventState({
            playerStats,
            timeline,
            tombstoneEventIds,
            eventId,
            overturnReason,
            overturnedBy: isRefereeMode ? 'referee' : 'operator',
            now,
            seq: localSeqRef.current,
            removeCompletely: false
        });

        if (!outcome.overturned) return;

        setPlayerStats(outcome.playerStats);
        setTimeline(outcome.timeline);
        setTombstoneEventIds(outcome.tombstoneEventIds);
        setEditingEvent(null);
    };

    /* detail stat change */
    const handleDetailChange = useCallback((playerId, stat, value) => {
        localSeqRef.current += 1;
        const now = Date.now();
        localUpdatedAtRef.current = now;

        const outcome = updateMatchPlayerDetailState({
            playerStats,
            playerId,
            stat,
            value,
            now,
            seq: localSeqRef.current
        });

        setPlayerStats(outcome.playerStats);
    }, [playerStats]);

    /* quick-action badge count */
    const badgeCount = useCallback((playerId, actionKey) => {
        const student = studentsById[playerId] || resolvePlayer(playerId, allStudents, studentsById);
        const resolvedId = student?.id || playerId;
        const s = playerStats[resolvedId] || playerStats[playerId];
        if (!s) return 0;
        switch (actionKey) {
            case 'goal':         return s.Goals + s.ownGoals; // Combined indicator
            case 'assist':       return s.Assists;
            case 'yellowCard':   return s.yellowCards;
            case 'redCard':      return s.redCards;
            default:             return 0;
        }
    }, [playerStats]);

    /* end match */
    const confirmEnd = () => {
        if (isSubmittingEnd) return;
        setIsSubmittingEnd(true);
        isEndingRef.current = true;
        const now = Date.now();
        lastClockUpdatedAtRef.current = now;
        lastAppliedClockTimeRef.current = now;
        localUpdatedAtRef.current = now;
        setIsPaused(true);
        setPeriod('FT');

        try {
            const targetId = matchData?.id || matchProp?.id;
            const targetHomeId = homeTeamId || matchData?.homeTeamId || matchProp?.homeTeamId;
            const targetAwayId = awayTeamId || matchData?.awayTeamId || matchProp?.awayTeamId;
            const targetAgeGroup = ageGroup || matchData?.ageGroup || matchProp?.ageGroup || 'Senior';
            const targetMatchday = matchday || matchData?.matchday || matchProp?.matchday || 'Matchday 1';
            const effectivePossession = livePossession || matchData?.possession || matchProp?.possession || matchData?.liveState?.possession || { homePct: 50, awayPct: 50 };

            const currentHomeSquad = matchDataRef.current?.homeSquadSelection || matchData?.homeSquadSelection || homeSquadSelection;
            const currentAwaySquad = matchDataRef.current?.awaySquadSelection || matchData?.awaySquadSelection || awaySquadSelection;

            const effectiveHomeXI = (currentHomeSquad?.startingXI?.filter(Boolean)?.length === 11)
                ? currentHomeSquad.startingXI.filter(Boolean)
                : (homeStarters.length >= 11 ? homeStarters.slice(0, 11) : homePlayers.slice(0, 11));
            const effectiveHomeBench = (currentHomeSquad?.benchPlayers?.length > 0)
                ? currentHomeSquad.benchPlayers
                : (homeBench.length > 0 ? homeBench : homePlayers.slice(11));

            const effectiveAwayXI = (currentAwaySquad?.startingXI?.filter(Boolean)?.length === 11)
                ? currentAwaySquad.startingXI.filter(Boolean)
                : (awayStarters.length >= 11 ? awayStarters.slice(0, 11) : awayPlayers.slice(0, 11));
            const effectiveAwayBench = (currentAwaySquad?.benchPlayers?.length > 0)
                ? currentAwaySquad.benchPlayers
                : (awayBench.length > 0 ? awayBench : awayPlayers.slice(11));

            const effectiveHomeSquad = currentHomeSquad ? {
                ...currentHomeSquad,
                formation: currentHomeSquad.formation || '4-3-3',
                startingXI: (currentHomeSquad.startingXI && currentHomeSquad.startingXI.filter(Boolean).length > 0) ? currentHomeSquad.startingXI.filter(Boolean) : effectiveHomeXI,
                benchPlayers: currentHomeSquad.benchPlayers || effectiveHomeBench,
                validationStatus: 'approved',
                captainId: currentHomeSquad.captainId || effectiveHomeXI[0] || null,
                lastModified: currentHomeSquad.lastModified || now,
                submittedAt: currentHomeSquad.submittedAt || new Date(now).toISOString()
            } : {
                formation: '4-3-3',
                startingXI: effectiveHomeXI,
                benchPlayers: effectiveHomeBench,
                validationStatus: 'approved',
                captainId: effectiveHomeXI[0] || null,
                lastModified: now,
                submittedAt: new Date(now).toISOString()
            };

            const effectiveAwaySquad = currentAwaySquad ? {
                ...currentAwaySquad,
                formation: currentAwaySquad.formation || '4-3-3',
                startingXI: (currentAwaySquad.startingXI && currentAwaySquad.startingXI.filter(Boolean).length > 0) ? currentAwaySquad.startingXI.filter(Boolean) : effectiveAwayXI,
                benchPlayers: currentAwaySquad.benchPlayers || effectiveAwayBench,
                validationStatus: 'approved',
                captainId: currentAwaySquad.captainId || effectiveAwayXI[0] || null,
                lastModified: currentAwaySquad.lastModified || now,
                submittedAt: currentAwaySquad.submittedAt || new Date(now).toISOString()
            } : {
                formation: '4-3-3',
                startingXI: effectiveAwayXI,
                benchPlayers: effectiveAwayBench,
                validationStatus: 'approved',
                captainId: effectiveAwayXI[0] || null,
                lastModified: now,
                submittedAt: new Date(now).toISOString()
            };

            const finalHomePlayers = Array.from(new Set([
                ...(effectiveHomeSquad.startingXI || []),
                ...(effectiveHomeSquad.benchPlayers || []),
                ...(matchDataRef.current?.homePlayers || []),
                ...(matchData?.homePlayers || []),
                ...homePlayers
            ]));
            const finalAwayPlayers = Array.from(new Set([
                ...(effectiveAwaySquad.startingXI || []),
                ...(effectiveAwaySquad.benchPlayers || []),
                ...(matchDataRef.current?.awayPlayers || []),
                ...(matchData?.awayPlayers || []),
                ...awayPlayers
            ]));

            const finalMatchPayload = {
                ...(matchData || matchProp || {}),
                id: targetId,
                homeTeamId: targetHomeId,
                awayTeamId: targetAwayId,
                ageGroup: targetAgeGroup,
                matchday: targetMatchday,
                homeScore,
                awayScore,
                playerStats,
                timeline,
                possession: effectivePossession,
                status: 'completed',
                isFinished: true,
                homeSquadSelection: effectiveHomeSquad,
                awaySquadSelection: effectiveAwaySquad,
                homePlayers: finalHomePlayers,
                awayPlayers: finalAwayPlayers,
                startTime: startTimeRef.current || now - (elapsed * 1000),
                endTime: now,
                updatedAt: now,
                date: new Date().toISOString(),
                liveState: {
                    ...(matchData?.liveState || {}),
                    status: 'completed',
                    isRunning: false,
                    period: 'FT',
                    elapsedOffset: elapsed,
                    clockUpdatedAt: now,
                    homeScore,
                    awayScore,
                    playerStats,
                    timeline,
                    possession: effectivePossession,
                    updatedAt: now
                },
                refereeLiveState: {
                    ...(matchData?.refereeLiveState || {}),
                    status: 'completed',
                    isRunning: false,
                    period: 'FT',
                    elapsedOffset: elapsed,
                    clockUpdatedAt: now,
                    homeScore,
                    awayScore,
                    playerStats,
                    timeline,
                    updatedAt: now
                }
            };

            if (onEndMatch) {
                onEndMatch(finalMatchPayload);
            }
            if (onUpdateMatch) {
                onUpdateMatch(finalMatchPayload);
            }
        } catch (err) {
            console.error('[LiveMatch] Error concluding match:', err);
        } finally {
            setShowConfirm(false);
            setIsSubmittingEnd(false);
        }
    };

    /* Format timeline timer */
    const formatEventTime = (secs, eventPeriod) => {
        const mins = Math.floor(secs / 60);
        const p = eventPeriod || (mins < 45 ? '1H' : '2H');
        
        if (p === '1H') {
            if (mins >= 45) {
                const extra = mins - 45 + 1;
                return `45+${extra}'`;
            }
            return `${mins + 1}'`;
        } else {
            const displayMins = mins + 1;
            if (displayMins > 90) {
                const extra = displayMins - 90;
                return `90+${extra}'`;
            }
            return `${displayMins}'`;
        }
    };

    /* ─── render helpers ───────────────────────────────────────────── */
    const renderPitchView = (side) => {
        const squadSelection = side === 'home' ? homeSquadSelection : awaySquadSelection;
        const starters = side === 'home' ? homeStarters : awayStarters;
        const formationText = squadSelection?.formation || '4-3-3';
        const layout = FORMATION_LAYOUTS[formationText];
        const slots = layout ? layout.slots : [];

        return (
            <div style={{
                position: 'relative',
                width: '100%',
                paddingBottom: '125%',
                background: 'linear-gradient(180deg, #134e23 0%, #175a2a 15%, #134e23 30%, #175a2a 45%, #134e23 60%, #175a2a 75%, #134e23 90%, #175a2a 100%)',
                borderRadius: '12px',
                overflow: 'hidden',
                border: 'var(--border)',
                boxShadow: 'var(--shadow-md)',
            }}>
                {/* Pitch markings */}
                <div style={{ position: 'absolute', inset: '4%', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '4px' }} />
                <div style={{ position: 'absolute', left: '4%', right: '4%', top: '50%', height: '1.5px', background: 'rgba(255,255,255,0.15)' }} />
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '22%', height: '16%', transform: 'translate(-50%, -50%)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', left: '24%', right: '24%', top: '4%', height: '12%', border: '1.5px solid rgba(255,255,255,0.15)', borderTop: 'none' }} />
                <div style={{ position: 'absolute', left: '24%', right: '24%', bottom: '4%', height: '12%', border: '1.5px solid rgba(255,255,255,0.15)', borderBottom: 'none' }} />

                {/* Click-away overlay for context menu */}
                {activePitchPlayerMenu && activePitchPlayerMenu.side === side && (
                    <div 
                        onClick={() => setActivePitchPlayerMenu(null)}
                        style={{ position: 'absolute', inset: 0, zIndex: 40 }}
                    />
                )}

                {/* Player slots on Pitch */}
                {slots.map((slot, idx) => {
                    const playerId = starters[idx];
                    const targetSideId = side === 'home' ? (matchData.homeTeamId || matchData.homeSchoolId) : (matchData.awayTeamId || matchData.awaySchoolId);
                    const student = studentsById[playerId] || resolvePlayer(playerId, allStudents, studentsById, targetSideId);
                    if (!student) return null;

                    const roleColor = ROLE_COLORS[slot.role] || '#6366f1';
                    const jersey = student.jerseyNumber;
                    const nameParts = student.name.trim().split(/\s+/);
                    const lastName = nameParts[nameParts.length - 1] || student.name;
                    const stats = playerStats[student.id] || playerStats[playerId] || {};

                    return (
                        <div 
                            key={idx} 
                            onClick={(e) => {
                                e.stopPropagation();
                                setActivePitchPlayerMenu({
                                    playerId: student.id,
                                    x: slot.x,
                                    y: slot.y,
                                    side
                                });
                            }}
                            style={{
                                position: 'absolute',
                                left: `${slot.x}%`,
                                top: `${slot.y}%`,
                                transform: 'translate(-50%, -50%)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                                zIndex: 2,
                                cursor: 'pointer',
                            }}
                        >
                            {/* Player Circle */}
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: roleColor,
                                border: '1.5px solid rgba(255,255,255,0.85)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: '800',
                                color: '#ffffff',
                                boxShadow: `0 2px 6px ${roleColor}66`,
                                position: 'relative',
                            }}>
                                {jersey != null ? jersey : (idx + 1)}

                                {/* Small stat indicator dot badges */}
                                {(stats.Goals > 0 || stats.ownGoals > 0) && (
                                    <span style={{
                                        position: 'absolute', top: '-4px', right: '-4px',
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        background: '#22c55e', color: '#fff', fontSize: '7px', fontWeight: '900',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {stats.Goals + stats.ownGoals}
                                    </span>
                                )}
                            </div>
                            
                            {/* Position & Name Labels */}
                            <div style={{
                                background: 'rgba(15,15,15,0.85)',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                fontSize: '8px',
                                fontWeight: '700',
                                color: '#ffffff',
                                whiteSpace: 'nowrap',
                                maxWidth: '60px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textAlign: 'center',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                {lastName}
                            </div>
                        </div>
                    );
                })}

                {/* Floating Context Menu Card */}
                {activePitchPlayerMenu && activePitchPlayerMenu.side === side && (() => {
                    const activeStudent = resolvePlayer(activePitchPlayerMenu.playerId, allStudents, studentsById);
                    const activeStudentName = resolvePlayerName(activePitchPlayerMenu.playerId, allStudents, studentsById);
                    return (
                        <div style={{
                            position: 'absolute',
                            left: `${activePitchPlayerMenu.x}%`,
                            top: `${activePitchPlayerMenu.y}%`,
                            transform: activePitchPlayerMenu.y < 35 ? 'translate(-50%, 15px)' : 'translate(-50%, -108%)', // Flip if too high up
                            background: 'rgba(10, 16, 32, 0.96)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '10px',
                            padding: '8px',
                            zIndex: 50,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                            minWidth: '130px'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '3px', marginBottom: '3px', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                #{activeStudent?.jerseyNumber || (parseInt(String(activePitchPlayerMenu.playerId).replace(/\D/g, ''), 10) % 22 || 10)} {activeStudentName}
                            </div>
                            {captureRole === 'possession' ? (
                                <div style={{ fontSize: '11px', color: '#94a3b8', padding: '6px 4px', textAlign: 'center', fontStyle: 'italic' }}>
                                    🔒 Possession Logger (Use Main Possession Tracker)
                                </div>
                            ) : (
                                <>
                                    {(captureRole === 'all' || captureRole === 'shots') && (
                                        <button onClick={() => { handleQuickAction(activePitchPlayerMenu.playerId, 'goal'); setActivePitchPlayerMenu(null); }} className="pitch-menu-item" style={{ color: '#4ade80', fontWeight: '700' }}>⚽ Log Goal / Shot</button>
                                    )}
                                    {(captureRole === 'all' || captureRole === 'general') && (
                                        <>
                                            <button onClick={() => { handleQuickAction(activePitchPlayerMenu.playerId, 'assist'); setActivePitchPlayerMenu(null); }} className="pitch-menu-item">👟 Log Assist</button>
                                            <button onClick={() => { handleQuickAction(activePitchPlayerMenu.playerId, 'yellowCard'); setActivePitchPlayerMenu(null); }} className="pitch-menu-item" style={{ color: '#facc15' }}>🟨 Yellow Card</button>
                                            <button onClick={() => { handleQuickAction(activePitchPlayerMenu.playerId, 'redCard'); setActivePitchPlayerMenu(null); }} className="pitch-menu-item" style={{ color: '#f87171' }}>🟥 Red Card</button>
                                            {activeStudent?.position === 'Goalkeeper' && (
                                                <button onClick={() => { setGkSaveModalData({ player: { id: activePitchPlayerMenu.playerId, name: activeStudentName } }); setActivePitchPlayerMenu(null); }} className="pitch-menu-item" style={{ color: '#34d399', fontWeight: '700' }}>🧤 Log GK Save</button>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                            <button onClick={() => setActivePitchPlayerMenu(null)} className="pitch-menu-item" style={{ color: 'var(--danger)', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '2px', paddingTop: '4px' }}>Close</button>
                        </div>
                    );
                })()}
            </div>
        );
    };

    /* ─── render helpers ───────────────────────────────────────────── */
    const renderPlayerRow = (playerId) => {
        const isHome = homePlayers.includes(playerId);
        const targetSideId = isHome ? (matchData.homeTeamId || matchData.homeSchoolId) : (matchData.awayTeamId || matchData.awaySchoolId);
        const student = resolvePlayer(playerId, allStudents, studentsById, targetSideId);
        const name = resolvePlayerName(playerId, allStudents, studentsById, '', targetSideId);
        const rawNum = parseInt(String(playerId).replace(/\D/g, ''), 10);
        const jersey = student?.jerseyNumber != null ? student.jerseyNumber : (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 1 : 10);
        const isExpanded = expandedPlayer === playerId;

        return (
            <div key={playerId} style={styles.playerCard}>
                {/* Main row */}
                <div
                    style={styles.playerRow}
                    onClick={() => setExpandedPlayer(isExpanded ? null : playerId)}
                >
                    {/* Jersey + name */}
                    <div style={styles.playerIdentity}>
                        <span style={styles.jerseyBadge}>{jersey}</span>
                        <span style={styles.playerName}>{name}</span>
                        {homeStarters.includes(playerId) || awayStarters.includes(playerId) ? (
                            <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--success)', background: 'rgba(16,185,129,0.12)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', flexShrink: 0 }}>XI</span>
                        ) : homeBench.includes(playerId) || awayBench.includes(playerId) ? (
                            <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--warning)', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', flexShrink: 0 }}>SUB</span>
                        ) : null}
                        <span style={{ ...styles.expandArrow, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                    </div>

                    {/* Quick actions */}
                    <div style={styles.actionsRow} onClick={e => e.stopPropagation()}>
                        {(isRefereeMode ? QUICK_ACTIONS.filter(a => a.key !== 'assist') : QUICK_ACTIONS).map(action => {
                            const count = badgeCount(playerId, action.key);
                            const hoverKey = `${playerId}-${action.key}`;
                            const isHovered = hoveredBtn === hoverKey;
                            const isShotAction = action.key === 'goal';
                            const isAllowed = captureRole === 'all' || 
                                (captureRole === 'shots' && isShotAction) ||
                                (captureRole === 'general' && !isShotAction);
                            return (
                                <button
                                    key={action.key}
                                    title={isAllowed ? action.tooltip : 'Restricted by Assigned Scope'}
                                    disabled={!isAllowed}
                                    style={{
                                        ...styles.actionBtn,
                                        background: isHovered && isAllowed ? action.hoverColor : action.color,
                                        transform: isHovered && isAllowed ? 'scale(1.12)' : 'scale(1)',
                                        opacity: isAllowed ? 1 : 0.25,
                                        cursor: isAllowed ? 'pointer' : 'not-allowed',
                                        filter: isAllowed ? 'none' : 'grayscale(90%)'
                                    }}
                                    onMouseEnter={() => isAllowed && setHoveredBtn(hoverKey)}
                                    onMouseLeave={() => setHoveredBtn(null)}
                                    onClick={() => isAllowed && handleQuickAction(playerId, action.key)}
                                >
                                    <span style={styles.actionEmoji}>{action.label}</span>
                                    {count > 0 && (
                                        <span style={styles.badge}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Expandable detail panel */}
                {isExpanded && !isRefereeMode && (
                    <div style={styles.detailPanel}>
                        <div style={styles.detailGrid}>
                            {DETAIL_STATS.map(stat => {
                                const val = stat === 'Minutes Played'
                                    ? playerStats[playerId]?.minutesPlayed ?? 0
                                    : playerStats[playerId]?.[stat] ?? 0;
                                return (
                                    <div key={stat} style={styles.detailField}>
                                        <label style={styles.detailLabel}>{stat}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={val}
                                            onChange={e => handleDetailChange(playerId, stat, e.target.value)}
                                            style={styles.detailInput}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    /* ─── main render ──────────────────────────────────────────────── */
    return (
        <div style={styles.wrapper}>
            {/* ── Scoreboard ─────────────────────────────────────────── */}
            <div style={styles.scoreboard}>
                <div style={styles.matchdayLabel}>{matchday ?? 'Match Day'}</div>

                <div style={styles.scoreRow}>
                    {/* Home */}
                    <div style={styles.teamBlock}>
                        {home.school?.logo && (
                            <img src={home.school.logo} alt="" style={styles.teamLogo} />
                        )}
                        <span style={styles.teamName}>{home.name}</span>
                    </div>

                    {/* Score + Timer */}
                    <div style={styles.scoreCenter}>
                        <div style={styles.scoreLine}>
                            <span style={styles.scoreNum}>{homeScore}</span>
                            <span style={styles.scoreDivider}>–</span>
                            <span style={styles.scoreNum}>{awayScore}</span>
                        </div>
                        <div style={styles.timer}>
                            <span style={{
                                ...styles.liveDot,
                                background: isPaused ? 'var(--text-muted)' : 'var(--success)',
                                animation: isPaused ? 'none' : 'pulse 1.5s infinite'
                            }} />
                            <span style={{ marginRight: '10px', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {period === 'HT' ? 'Half-Time' : (
                                    <>
                                        {period === '1H' && elapsed > 2700 ? (
                                            `45:00 +${pad(Math.floor((elapsed - 2700) / 60))}:${pad((elapsed - 2700) % 60)}`
                                        ) : period === '2H' && elapsed > 5400 ? (
                                            `90:00 +${pad(Math.floor((elapsed - 5400) / 60))}:${pad((elapsed - 5400) % 60)}`
                                        ) : (
                                            `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`
                                        )}
                                    </>
                                )}
                            </span>
                            
                            {captureRole !== 'readonly' ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {period !== 'HT' && (
                                        <button
                                            type="button"
                                            onClick={handleTogglePause}
                                            style={{
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '6px',
                                                padding: '4px 10px',
                                                color: 'var(--text-primary)',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                outline: 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        >
                                            {isPaused ? '▶️ Resume' : '⏸️ Pause'}
                                        </button>
                                    )}

                                    {period === '1H' && (
                                        <button
                                            type="button"
                                            onClick={handleEndFirstHalf}
                                            style={{
                                                background: 'rgba(239, 68, 68, 0.12)',
                                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                                borderRadius: '6px',
                                                padding: '4px 10px',
                                                color: '#f87171',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                                        >
                                            End 1st Half
                                        </button>
                                    )}

                                    {period === 'HT' && (
                                        <button
                                            type="button"
                                            onClick={handleStartSecondHalf}
                                            style={{
                                                background: 'rgba(16, 185, 129, 0.12)',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                borderRadius: '6px',
                                                padding: '4px 10px',
                                                color: '#34d399',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)'}
                                        >
                                            Start 2nd Half
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(true)}
                                        style={{
                                            background: 'rgba(239, 68, 68, 0.12)',
                                            border: '1px solid rgba(239, 68, 68, 0.25)',
                                            borderRadius: '6px',
                                            padding: '4px 10px',
                                            color: '#f87171',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                                    >
                                        End Match
                                    </button>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 10px', borderRadius: '8px',
                                    background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)',
                                    fontSize: '11px', fontWeight: '700', color: '#38bdf8'
                                }}>
                                    <span>🔒</span> Spectator View
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Away */}
                    <div style={{ ...styles.teamBlock, flexDirection: 'row-reverse' }}>
                        {away.school?.logo && (
                            <img src={away.school.logo} alt="" style={styles.teamLogo} />
                        )}
                        <span style={{ ...styles.teamName, textAlign: 'right' }}>{away.name}</span>
                    </div>
                </div>
            </div>

            {/* ── Mobile Section Switcher ──────────────────────────────── */}
            <div className="mobile-live-tab-bar">
                <button
                    className={`mobile-live-tab-btn ${mobileTab === 'home' ? 'active' : ''}`}
                    onClick={() => setMobileTab('home')}
                >
                    🏠 Home ({homeStarters.length + homeBench.length})
                </button>
                <button
                    className={`mobile-live-tab-btn ${mobileTab === 'timeline' ? 'active' : ''}`}
                    onClick={() => setMobileTab('timeline')}
                >
                    ⏱️ Timeline ({timeline.length})
                </button>
                <button
                    className={`mobile-live-tab-btn ${mobileTab === 'away' ? 'active' : ''}`}
                    onClick={() => setMobileTab('away')}
                >
                    ✈️ Away ({awayStarters.length + awayBench.length})
                </button>
            </div>

            {/* ── Render Rapid Tile Capture Control Panel ────────────── */}
            {!isRefereeMode && (
                <TileDataCaptureControlPanel
                    match={matchData}
                    home={home}
                    away={away}
                    homePlayers={homePlayers}
                    awayPlayers={awayPlayers}
                    studentsById={studentsById}
                    playerStats={playerStats}
                    elapsed={elapsed}
                    period={period}
                    isPaused={isPaused}
                    captureRole={captureRole}
                    onQuickLogEvent={(logData) => {
                        if (logData.type === 'possessionSync' && logData.possession) {
                            setLivePossession(logData.possession);
                            if (onUpdateMatch) {
                                onUpdateMatch({
                                    ...matchDataRef.current,
                                    possession: logData.possession,
                                    liveState: {
                                        ...(matchDataRef.current.liveState || {}),
                                        possession: logData.possession
                                    }
                                });
                            }
                            return;
                        }
                        if (logData.type === 'possessionChange') {
                            const nextPoss = logData.possession || {
                                homePct: logData.homePct ?? 50,
                                awayPct: logData.awayPct ?? 50,
                                inContestPct: logData.inContestPct ?? 0,
                                activeSide: logData.team,
                                teamName: logData.teamName
                            };
                            setLivePossession(nextPoss);
                            setTimeline(prev => [
                                ...prev,
                                {
                                    id: `event-${Date.now()}`,
                                    elapsed,
                                    period,
                                    type: 'possession',
                                    team: logData.team,
                                    teamName: logData.teamName,
                                    homePct: logData.homePct,
                                    awayPct: logData.awayPct,
                                    inContestPct: logData.inContestPct ?? nextPoss.inContestPct ?? 0,
                                    playerName: logData.team === 'contest'
                                        ? `Ball In Contest / Loose Ball (${logData.inContestPct ?? nextPoss.inContestPct ?? 0}%)`
                                        : `Ball Possession: ${logData.teamName} (${logData.team === 'home' ? logData.homePct : logData.awayPct}%)`
                                }
                            ]);
                            if (onUpdateMatch) {
                                onUpdateMatch({
                                    ...matchDataRef.current,
                                    possession: nextPoss,
                                    liveState: {
                                        ...(matchDataRef.current.liveState || {}),
                                        possession: nextPoss
                                    }
                                });
                            }
                            return;
                        }
                        handleQuickAction(logData.playerId, logData.type);
                    }}
                    onShotModal={(player, defaultGoalType, defaultResult) => {
                        const isHome = homePlayers.includes(player.id);
                        const teammates = isHome 
                            ? homePlayers.map(id => resolvePlayer(id, allStudents, studentsById)).filter(Boolean)
                            : awayPlayers.map(id => resolvePlayer(id, allStudents, studentsById)).filter(Boolean);
                        setShotModalData({
                            player: {
                                ...player,
                                name: resolvePlayerName(player, allStudents, studentsById)
                            },
                            defaultOutcome: defaultResult || 'goal',
                            defaultGoalType: defaultGoalType || 'foot',
                            teammates
                        });
                    }}
                    onGkSaveModal={(player) => {
                        setGkSaveModalData({ player });
                    }}
                />
            )}

            {/* ── Auto-Hidden & Expandable Match Timeline for Data Logger ───────────────── */}
            {!isRefereeMode && (
                <div>
                    {!showTimeline ? (
                        /* ── Collapsed Timeline Bar (Default Auto-Hidden State) ── */
                        <div className="glass-panel" style={{
                            padding: '12px 18px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                            background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '18px' }}>⏱️</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Match Event Timeline
                                    </span>
                                    <span style={{
                                        fontSize: '11px', fontWeight: '800',
                                        background: timeline.length > 0 ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                                        color: timeline.length > 0 ? '#a5b4fc' : 'var(--text-muted)',
                                        padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.25)'
                                    }}>
                                        {timeline.length} {timeline.length === 1 ? 'Event' : 'Events'}
                                    </span>
                                    {timeline.length > 0 && (
                                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                            • Latest: <strong style={{ color: '#ffffff' }}>
                                                {timeline[timeline.length - 1]?.playerName || 'Play'} ({timeline[timeline.length - 1]?.type})
                                            </strong>
                                        </span>
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowTimeline(true)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 16px', borderRadius: '8px',
                                    background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
                                    border: '1px solid rgba(99,102,241,0.35)',
                                    fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>👁️</span> Show &amp; Expand Timeline ▾
                            </button>
                        </div>
                    ) : (
                        /* ── Full Expanded Timeline View ── */
                        <div className="glass-panel" style={{
                            padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
                            background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
                            border: '1px solid rgba(99,102,241,0.35)', borderRadius: '14px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                        }}>
                            {/* Expanded Header & Controls */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '20px' }}>⏱️</span>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Live Match Timeline &amp; Event Feed
                                            </h3>
                                            <span style={{ fontSize: '11px', fontWeight: '800', background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                                {timeline.length} Total
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            Chronological match log · Filter by event type, review detailed stats, or click ✕ to undo
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {/* Layout Mode Toggle */}
                                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <button
                                            type="button"
                                            onClick={() => setTimelineLayout('expanded')}
                                            style={{
                                                padding: '5px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '700',
                                                background: timelineLayout === 'expanded' ? 'rgba(99,102,241,0.3)' : 'transparent',
                                                color: timelineLayout === 'expanded' ? '#ffffff' : 'var(--text-muted)',
                                                border: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            📊 Expanded Feed
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTimelineLayout('stream')}
                                            style={{
                                                padding: '5px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '700',
                                                background: timelineLayout === 'stream' ? 'rgba(99,102,241,0.3)' : 'transparent',
                                                color: timelineLayout === 'stream' ? '#ffffff' : 'var(--text-muted)',
                                                border: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            🎞️ Stream
                                        </button>
                                    </div>

                                    {/* Hide / Collapse Button */}
                                    <button
                                        type="button"
                                        onClick={() => setShowTimeline(false)}
                                        style={{
                                            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                                            background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                            border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        ▲ Hide Timeline
                                    </button>
                                </div>
                            </div>

                            {/* Filter Bar: Event Categories & Teams */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                {/* Category Filters */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { key: 'all', label: `All (${timeline.length})` },
                                        { key: 'goal', label: `⚽ Goals (${timeline.filter(t => t.type === 'goal').length})` },
                                        { key: 'shot', label: `🎯 Shots & Saves (${timeline.filter(t => t.type.includes('shot') || t.type === 'gkSave').length})` },
                                        { key: 'card', label: `🟨 Cards (${timeline.filter(t => t.type === 'yellowCard' || t.type === 'redCard').length})` },
                                        { key: 'foul', label: `🛑 Fouls (${timeline.filter(t => t.type === 'foul').length})` },
                                        { key: 'possession', label: `⏱️ Possession & Other (${timeline.filter(t => t.type === 'possession' || t.type === 'sub' || t.type === 'corner' || t.type === 'offside').length})` }
                                    ].map(cat => (
                                        <button
                                            key={cat.key}
                                            type="button"
                                            onClick={() => setTimelineFilter(cat.key)}
                                            style={{
                                                padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: '700',
                                                background: timelineFilter === cat.key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.03)',
                                                color: timelineFilter === cat.key ? '#a5b4fc' : 'var(--text-secondary)',
                                                border: timelineFilter === cat.key ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                                                cursor: 'pointer', transition: 'all 0.12s'
                                            }}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Team Filters */}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setTimelineTeamFilter('all')}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                            background: timelineTeamFilter === 'all' ? 'rgba(255,255,255,0.12)' : 'transparent',
                                            color: timelineTeamFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
                                            border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer'
                                        }}
                                    >
                                        Both Teams
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTimelineTeamFilter('home')}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                            background: timelineTeamFilter === 'home' ? 'rgba(34,197,94,0.2)' : 'transparent',
                                            color: timelineTeamFilter === 'home' ? '#4ade80' : 'var(--text-muted)',
                                            border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer'
                                        }}
                                    >
                                        🟢 {home?.name || 'Home'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTimelineTeamFilter('away')}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                            background: timelineTeamFilter === 'away' ? 'rgba(99,102,241,0.2)' : 'transparent',
                                            color: timelineTeamFilter === 'away' ? '#a5b4fc' : 'var(--text-muted)',
                                            border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer'
                                        }}
                                    >
                                        🔵 {away?.name || 'Away'}
                                    </button>
                                </div>
                            </div>

                            {/* Render Filtered Timeline List */}
                            {(() => {
                                const filtered = timeline.slice().reverse().filter(ev => {
                                    if (timelineFilter === 'goal' && ev.type !== 'goal') return false;
                                    if (timelineFilter === 'shot' && !(ev.type.includes('shot') || ev.type === 'gkSave')) return false;
                                    if (timelineFilter === 'card' && !(ev.type === 'yellowCard' || ev.type === 'redCard')) return false;
                                    if (timelineFilter === 'foul' && ev.type !== 'foul') return false;
                                    if (timelineFilter === 'possession' && !(ev.type === 'possession' || ev.type === 'sub' || ev.type === 'corner' || ev.type === 'offside')) return false;
                                    
                                    if (timelineTeamFilter === 'home' && ev.team !== 'home' && !homePlayers.includes(ev.playerId)) return false;
                                    if (timelineTeamFilter === 'away' && ev.team !== 'away' && !awayPlayers.includes(ev.playerId)) return false;

                                    return true;
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: '13px' }}>
                                            {timeline.length === 0
                                                ? 'No match events logged yet. Tap any stat tile or player to record live play events.'
                                                : 'No events match the selected category or team filter.'
                                            }
                                        </div>
                                    );
                                }

                                if (timelineLayout === 'expanded') {
                                    return (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                                            gap: '12px',
                                            maxHeight: '460px',
                                            overflowY: 'auto',
                                            paddingRight: '4px'
                                        }}>
                                            {filtered.map(event => {
                                                let icon = '⚡';
                                                let clr = '#6366f1';
                                                let badgeTitle = 'Event';
                                                let desc = '';
                                                let isHomeEvent = event.team === 'home' || homePlayers.includes(event.playerId);

                                                if (event.type === 'goal') {
                                                    icon = '⚽';
                                                    clr = '#22c55e';
                                                    badgeTitle = event.goalType === 'own-goal' ? 'Own Goal' : 'Goal Scored';
                                                    desc = `${event.playerName}`;
                                                    if (event.assistingPlayerName) desc += ` (Assist: ${event.assistingPlayerName})`;
                                                } else if (event.type === 'shotOnTarget') {
                                                    icon = '🎯';
                                                    clr = '#14b8a6';
                                                    badgeTitle = 'Shot on Target';
                                                    desc = `${event.playerName} • Saved by Opposing GK`;
                                                } else if (event.type === 'shotMissed') {
                                                    icon = '❌';
                                                    clr = '#64748b';
                                                    badgeTitle = 'Shot Off-Target';
                                                    desc = `${event.playerName} • Missed Wide/Over`;
                                                } else if (event.type === 'yellowCard') {
                                                    icon = '🟨';
                                                    clr = '#f59e0b';
                                                    badgeTitle = 'Yellow Card Caution';
                                                    desc = `${event.playerName}`;
                                                } else if (event.type === 'redCard') {
                                                    icon = '🟥';
                                                    clr = '#ef4444';
                                                    badgeTitle = 'Red Card Send-Off';
                                                    desc = `${event.playerName}`;
                                                } else if (event.type === 'possession') {
                                                    icon = event.team === 'contest' ? '⚔️' : '⏱️';
                                                    clr = event.team === 'contest' ? '#f59e0b' : (event.team === 'home' ? '#22c55e' : '#6366f1');
                                                    badgeTitle = event.team === 'contest' ? 'Ball In Contest' : 'Ball Possession Shift';
                                                    desc = event.playerName || (event.team === 'contest' ? 'Ball In Contest / Loose Ball' : `${event.teamName} Possession`);
                                                } else if (event.type === 'foul') {
                                                    icon = '🛑';
                                                    clr = '#ea580c';
                                                    badgeTitle = 'Foul Committed';
                                                    desc = `${event.playerName}`;
                                                } else if (event.type === 'corner') {
                                                    icon = '🚩';
                                                    clr = '#3b82f6';
                                                    badgeTitle = 'Corner Kick';
                                                    desc = `${event.playerName}`;
                                                } else if (event.type === 'penalty') {
                                                    icon = '🎯';
                                                    clr = '#8b5cf6';
                                                    badgeTitle = 'Penalty Awarded';
                                                    desc = `${event.playerName}`;
                                                } else if (event.type === 'offside') {
                                                    icon = '🚩';
                                                    clr = '#64748b';
                                                    badgeTitle = 'Offside Call';
                                                    desc = `${event.playerName}`;
                                                } else if (event.type === 'gkSave') {
                                                    icon = '🧤';
                                                    clr = '#06b6d4';
                                                    badgeTitle = 'Goalkeeper Save';
                                                    desc = `${event.playerName} • Save Recorded`;
                                                } else {
                                                    desc = event.playerName || 'Play event recorded';
                                                }

                                                return (
                                                    <div
                                                        key={event.id}
                                                        style={{
                                                            padding: '14px', borderRadius: '12px',
                                                            background: 'rgba(255,255,255,0.03)',
                                                            borderLeft: `4px solid ${clr}`,
                                                            borderTop: '1px solid rgba(255,255,255,0.07)',
                                                            borderRight: '1px solid rgba(255,255,255,0.07)',
                                                            borderBottom: '1px solid rgba(255,255,255,0.07)',
                                                            display: 'flex', flexDirection: 'column', gap: '8px',
                                                            boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
                                                        }}
                                                    >
                                                        {/* Top Card Meta Row */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{
                                                                    fontSize: '11px', fontWeight: '800', color: 'var(--primary-light)',
                                                                    background: 'rgba(99,102,241,0.15)', padding: '2px 7px', borderRadius: '6px'
                                                                }}>
                                                                    {formatEventTime(event.elapsed, event.period)}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '10.5px', fontWeight: '700',
                                                                    color: isHomeEvent ? '#86efac' : '#c7d2fe',
                                                                    background: isHomeEvent ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)',
                                                                    padding: '2px 6px', borderRadius: '4px'
                                                                }}>
                                                                    {isHomeEvent ? (home?.name || 'Home') : (away?.name || 'Away')}
                                                                </span>
                                                                {event.overturned && (
                                                                    <span style={{
                                                                        fontSize: '10px', fontWeight: '800',
                                                                        color: '#fbbf24', background: 'rgba(245, 158, 11, 0.2)',
                                                                        padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.4)'
                                                                    }}>
                                                                        OVERTURNED
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <button
                                                                    title="Edit event details or overturn call"
                                                                    onClick={() => setEditingEvent(event)}
                                                                    style={{
                                                                        background: 'rgba(56, 189, 248, 0.15)',
                                                                        color: '#38bdf8',
                                                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                                                        borderRadius: '6px',
                                                                        padding: '3px 8px',
                                                                        fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '3px'
                                                                    }}
                                                                >
                                                                    <span>✏️</span> Edit
                                                                </button>
                                                                <button
                                                                    title="Undo this event and revert stats"
                                                                    onClick={() => handleUndoEvent(event.id)}
                                                                    style={{
                                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                                        color: '#f87171',
                                                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                        borderRadius: '6px',
                                                                        padding: '3px 8px',
                                                                        fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                                    }}
                                                                >
                                                                    <span>✕</span> Undo
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Card Body */}
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', opacity: event.overturned ? 0.65 : 1 }}>
                                                            <span style={{ fontSize: '20px', lineHeight: 1 }}>{icon}</span>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: '12px', fontWeight: '800', color: clr, letterSpacing: '0.02em', textDecoration: event.overturned ? 'line-through' : 'none' }}>
                                                                    {badgeTitle}
                                                                </div>
                                                                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px', wordBreak: 'break-word', textDecoration: event.overturned ? 'line-through' : 'none' }}>
                                                                    {desc}
                                                                </div>
                                                                {event.overturned && (
                                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#fbbf24', marginTop: '4px' }}>
                                                                        Call Overturned: {event.overturnReason || 'Referee changed call'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                }

                                // Stream carousel mode
                                return (
                                    <div style={{
                                        display: 'flex', gap: '12px', overflowX: 'auto', padding: '4px 4px 12px 4px',
                                        scrollSnapType: 'x mandatory'
                                    }}>
                                        {filtered.map(event => {
                                            let icon = '⚡';
                                            let clr = '#6366f1';
                                            let desc = '';

                                            if (event.type === 'goal') {
                                                icon = '⚽';
                                                clr = '#22c55e';
                                                let goalLabel = 'Goal';
                                                if (event.goalType === 'header') goalLabel = 'Header Goal';
                                                if (event.goalType === 'penalty') goalLabel = 'Penalty Goal';
                                                if (event.goalType === 'freekick') goalLabel = 'Free Kick Goal';
                                                if (event.goalType === 'own-goal') {
                                                    goalLabel = 'Own Goal ⚠️';
                                                    clr = '#ef4444';
                                                }
                                                desc = `${goalLabel} by ${event.playerName}`;
                                                if (event.assistingPlayerName) desc += ` (Assist: ${event.assistingPlayerName})`;
                                            } else if (event.type === 'shotOnTarget') {
                                                icon = '🎯';
                                                clr = '#14b8a6';
                                                desc = `Shot Saved - ${event.playerName}`;
                                            } else if (event.type === 'shotMissed') {
                                                icon = '❌';
                                                clr = '#6b7280';
                                                desc = `Shot Missed - ${event.playerName}`;
                                            } else if (event.type === 'yellowCard') {
                                                icon = '🟨';
                                                clr = '#f59e0b';
                                                desc = `Yellow Card - ${event.playerName}`;
                                            } else if (event.type === 'redCard') {
                                                icon = '🟥';
                                                clr = '#ef4444';
                                                desc = `Red Card - ${event.playerName}`;
                                            } else if (event.type === 'possession') {
                                                icon = event.team === 'contest' ? '⚔️' : '⏱️';
                                                clr = event.team === 'contest' ? '#f59e0b' : (event.team === 'home' ? '#22c55e' : '#6366f1');
                                                desc = event.playerName || (event.team === 'contest' ? 'Ball In Contest / Loose Ball' : `Ball Possession: ${event.teamName}`);
                                            } else if (event.type === 'foul') {
                                                icon = '🛑';
                                                clr = '#ea580c';
                                                desc = `Foul - ${event.playerName}`;
                                            } else if (event.type === 'corner') {
                                                icon = '🚩';
                                                clr = '#3b82f6';
                                                desc = `Corner Kick - ${event.playerName}`;
                                            } else if (event.type === 'penalty') {
                                                icon = '🎯';
                                                clr = '#8b5cf6';
                                                desc = `Penalty Kick - ${event.playerName}`;
                                            } else if (event.type === 'offside') {
                                                icon = '🚩';
                                                clr = '#64748b';
                                                desc = `Offside - ${event.playerName}`;
                                            } else {
                                                desc = event.playerName || 'Play event recorded';
                                            }

                                            return (
                                                <div
                                                    key={event.id}
                                                    style={{
                                                        flexShrink: 0,
                                                        padding: '10px 16px', borderRadius: '12px',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        borderLeft: `4px solid ${clr}`,
                                                        borderTop: '1px solid rgba(255,255,255,0.08)',
                                                        borderRight: '1px solid rgba(255,255,255,0.08)',
                                                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                                                        display: 'flex', alignItems: 'center', gap: '10px',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                                        scrollSnapAlign: 'start'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-light)', background: 'rgba(99,102,241,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {formatEventTime(event.elapsed, event.period)}
                                                    </span>
                                                    <span style={{ fontSize: '15px' }}>{icon}</span>
                                                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff', whiteSpace: 'nowrap' }}>
                                                        {desc}
                                                    </span>
                                                    {event.overturned && (
                                                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#fbbf24', background: 'rgba(245,158,11,0.2)', padding: '2px 5px', borderRadius: '4px' }}>
                                                            OVERTURNED
                                                        </span>
                                                    )}
                                                    <button
                                                        title="Edit this event or overturn call"
                                                        onClick={() => setEditingEvent(event)}
                                                        style={{
                                                            background: 'rgba(56, 189, 248, 0.15)',
                                                            color: '#38bdf8',
                                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                                            borderRadius: '50%',
                                                            width: '20px', height: '20px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
                                                            marginLeft: '4px'
                                                        }}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        title="Undo this event"
                                                        onClick={() => handleUndoEvent(event.id)}
                                                        style={{
                                                            background: 'rgba(239, 68, 68, 0.15)',
                                                            color: '#f87171',
                                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                                            borderRadius: '50%',
                                                            width: '20px', height: '20px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                                                            marginLeft: '4px'
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* ── Three-column layout (Referee View) ─────────────────── */}
            {isRefereeMode && (
                <div style={styles.columns} className="live-match-columns">
                    {/* Home column */}
                    <div style={{ ...styles.column, display: (window.innerWidth <= 900 && mobileTab !== 'home') ? 'none' : 'flex' }}>
                    <div style={styles.columnHeader}>
                        <span style={styles.columnHeaderDot('#22c55e')} />
                        <span style={{ flex: 1 }}>Home Roster</span>
                        {homePlayers.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button 
                                    onClick={() => setHomeViewMode('list')}
                                    style={homeViewMode === 'list' ? styles.toggleBtnActive : styles.toggleBtn}
                                >
                                    List
                                </button>
                                <button 
                                    onClick={() => setHomeViewMode('pitch')}
                                    style={homeViewMode === 'pitch' ? styles.toggleBtnActive : styles.toggleBtn}
                                >
                                    Pitch
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {homeViewMode === 'pitch' ? (
                        renderPitchView('home')
                    ) : (
                        <div style={styles.playerList}>
                            {homeSquadSelection ? (
                                <>
                                    {homeStarters.length > 0 && (
                                        <>
                                            <div style={styles.rosterGroupHeader}>Starting XI ({homeSquadSelection.formation || '4-3-3'})</div>
                                            {homeStarters.map(renderPlayerRow)}
                                        </>
                                    )}
                                    {homeBench.length > 0 && (
                                        <>
                                            <div style={styles.rosterGroupHeader}>Substitutes Bench</div>
                                            {homeBench.map(renderPlayerRow)}
                                        </>
                                    )}
                                    {homeUnassigned.length > 0 && (
                                        <>
                                            <div style={styles.rosterGroupHeader}>Reserves</div>
                                            {homeUnassigned.map(renderPlayerRow)}
                                        </>
                                    )}
                                </>
                            ) : (
                                homePlayers.map(renderPlayerRow)
                            )}
                        </div>
                    )}
                </div>

                {/* Center Match Timeline Column */}
                <div style={{ ...styles.timelineColumn, display: (window.innerWidth <= 900 && mobileTab !== 'timeline') ? 'none' : 'flex' }}>
                    <div style={styles.columnHeader}>
                        ⏱️ Match Timeline
                    </div>
                    <div style={styles.timelineWrapper}>
                        {timeline.length === 0 ? (
                            <div style={styles.timelineEmpty}>
                                No events logged yet.<br />
                                <span style={{ fontSize: '11px', opacity: 0.6 }}>Tap quick action buttons on players to register events.</span>
                            </div>
                        ) : (
                            <div style={styles.timelineList}>
                                {timeline.slice().reverse().map(event => {
                                    let icon = '⚡';
                                    let clr = '#fff';
                                    let desc = '';

                                    if (event.type === 'goal') {
                                        icon = '⚽';
                                        clr = '#22c55e';
                                        let goalLabel = 'Goal';
                                        if (event.goalType === 'header') goalLabel = 'Header Goal';
                                        if (event.goalType === 'penalty') goalLabel = 'Penalty Goal';
                                        if (event.goalType === 'freekick') goalLabel = 'Free Kick Goal';
                                        if (event.goalType === 'own-goal') {
                                            goalLabel = 'Own Goal ⚠️';
                                            clr = '#ef4444';
                                        }

                                        desc = `${goalLabel} by ${event.playerName}`;
                                        if (event.assistingPlayerName) {
                                            desc += ` (Assist: ${event.assistingPlayerName})`;
                                        }
                                    } else if (event.type === 'shotOnTarget') {
                                        icon = '🎯';
                                        clr = '#14b8a6';
                                        desc = `Shot Saved - ${event.playerName}`;
                                    } else if (event.type === 'shotMissed') {
                                        icon = '❌';
                                        clr = '#6b7280';
                                        desc = `Shot Missed - ${event.playerName}`;
                                    } else if (event.type === 'assist') {
                                        icon = '🅰️';
                                        clr = '#6366f1';
                                        desc = `Direct Assist by ${event.playerName}`;
                                    } else if (event.type === 'yellowCard') {
                                        icon = '🟨';
                                        clr = '#f59e0b';
                                        desc = `Yellow Card - ${event.playerName}`;
                                    } else if (event.type === 'redCard') {
                                        icon = '🟥';
                                        clr = '#ef4444';
                                        desc = `Red Card - ${event.playerName}`;
                                    } else if (event.type === 'gkSave') {
                                        icon = '🧤';
                                        clr = '#10b981';
                                        let saveLabel = 'Save';
                                        if (event.saveType === 'penalty') saveLabel = 'Penalty Save 🥅';
                                        if (event.saveType === 'freekick') saveLabel = 'Free Kick Save 🎯';
                                        const cornerLabel = event.corner ? event.corner.replace('-', ' ') : '';
                                        desc = `${saveLabel} in the ${cornerLabel} corner by ${event.playerName}`;
                                    } else if (event.type === 'possession') {
                                        icon = event.team === 'contest' ? '⚔️' : '⏱️';
                                        clr = event.team === 'contest' ? '#f59e0b' : (event.team === 'home' ? '#22c55e' : '#6366f1');
                                        desc = event.playerName || (event.team === 'contest' ? 'Ball In Contest / Loose Ball' : `Ball Possession: ${event.teamName}`);
                                    } else if (event.type === 'foul') {
                                        icon = '🛑';
                                        clr = '#ea580c';
                                        desc = `Foul Committed - ${event.playerName}`;
                                    } else if (event.type === 'corner') {
                                        icon = '🚩';
                                        clr = '#3b82f6';
                                        desc = `Corner Kick - ${event.playerName}`;
                                    } else if (event.type === 'penalty') {
                                        icon = '🎯';
                                        clr = '#8b5cf6';
                                        desc = `Penalty Kick Awarded - ${event.playerName}`;
                                    } else if (event.type === 'offside') {
                                        icon = '🚩';
                                        clr = '#64748b';
                                        desc = `Offside Infringement - ${event.playerName}`;
                                    }

                                    return (
                                        <div key={event.id} style={{ ...styles.timelineItem(clr), opacity: event.overturned ? 0.6 : 1 }}>
                                            <span style={styles.timelineTime}>{formatEventTime(event.elapsed, event.period)}</span>
                                            <span style={{ fontSize: '14px' }}>{icon}</span>
                                            <span style={{ ...styles.timelineText, textDecoration: event.overturned ? 'line-through' : 'none' }}>
                                                {desc}
                                                {event.overturned && (
                                                    <span style={{ color: '#fbbf24', marginLeft: '6px', fontWeight: '800', fontSize: '10px' }}>
                                                        [OVERTURNED]
                                                    </span>
                                                )}
                                            </span>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <button
                                                    title="Edit event details or overturn call"
                                                    onClick={() => setEditingEvent(event)}
                                                    style={{
                                                        background: 'rgba(56, 189, 248, 0.15)',
                                                        color: '#38bdf8',
                                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                                        borderRadius: '4px',
                                                        padding: '2px 6px',
                                                        fontSize: '10px', fontWeight: '700', cursor: 'pointer'
                                                    }}
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    title="Undo this event"
                                                    onClick={() => handleUndoEvent(event.id)}
                                                    style={styles.undoBtn}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Away column */}
                <div style={{ ...styles.column, display: (window.innerWidth <= 900 && mobileTab !== 'away') ? 'none' : 'flex' }}>
                    <div style={styles.columnHeader}>
                        <span style={styles.columnHeaderDot('#6366f1')} />
                        <span style={{ flex: 1 }}>Away Roster</span>
                        {awayPlayers.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button 
                                    onClick={() => setAwayViewMode('list')}
                                    style={awayViewMode === 'list' ? styles.toggleBtnActive : styles.toggleBtn}
                                >
                                    List
                                </button>
                                <button 
                                    onClick={() => setAwayViewMode('pitch')}
                                    style={awayViewMode === 'pitch' ? styles.toggleBtnActive : styles.toggleBtn}
                                >
                                    Pitch
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {awayViewMode === 'pitch' ? (
                        renderPitchView('away')
                    ) : (
                        <div style={styles.playerList}>
                            {awaySquadSelection ? (
                                <>
                                    {awayStarters.length > 0 && (
                                        <>
                                            <div style={styles.rosterGroupHeader}>Starting XI ({awaySquadSelection.formation || '4-3-3'})</div>
                                            {awayStarters.map(renderPlayerRow)}
                                        </>
                                    )}
                                    {awayBench.length > 0 && (
                                        <>
                                            <div style={styles.rosterGroupHeader}>Substitutes Bench</div>
                                            {awayBench.map(renderPlayerRow)}
                                        </>
                                    )}
                                    {awayUnassigned.length > 0 && (
                                        <>
                                            <div style={styles.rosterGroupHeader}>Reserves</div>
                                            {awayUnassigned.map(renderPlayerRow)}
                                        </>
                                    )}
                                </>
                            ) : (
                                awayPlayers.map(renderPlayerRow)
                            )}
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* ── Bottom bar ─────────────────────────────────────────── */}
            <div style={styles.bottomBar}>
                <button
                    style={styles.cancelBtn}
                    onClick={onCancel}
                >
                    Cancel Match
                </button>
                {isMasterLogger || captureRole !== 'readonly' ? (
                    <button
                        style={styles.endBtn}
                        onClick={() => setShowConfirm(true)}
                    >
                        End Match
                    </button>
                ) : (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '8px',
                        background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)',
                        fontSize: '11px', fontWeight: '700', color: '#38bdf8'
                    }}>
                        <span>🔒</span> Spectator View
                    </div>
                )}
            </div>

            {/* ── Visual Shot Modal ───────────────────────────────────── */}
            {shotModalData && (
                <LiveShotModal
                    player={shotModalData.player}
                    teammates={shotModalData.teammates}
                    defaultOutcome={shotModalData.defaultOutcome}
                    defaultGoalType={shotModalData.defaultGoalType}
                    onSave={handleSaveShot}
                    onClose={() => setShotModalData(null)}
                />
            )}

            {/* ── Goalkeeper Save Modal ───────────────────────────────── */}
            {gkSaveModalData && (
                <LiveGkSaveModal
                    player={gkSaveModalData.player}
                    onSave={handleSaveGkSave}
                    onClose={() => setGkSaveModalData(null)}
                />
            )}

            {/* ── Edit / Overturn Match Event Modal ────────────────────── */}
            {editingEvent && (
                <EditMatchEventModal
                    isOpen={!!editingEvent}
                    event={editingEvent}
                    match={matchData}
                    allPlayers={allStudents}
                    userRole={isRefereeMode ? 'referee' : 'operator'}
                    onSave={handleSaveEditedEvent}
                    onOverturn={handleOverturnEvent}
                    onClose={() => setEditingEvent(null)}
                />
            )}

            {/* ── Confirmation dialog ────────────────────────────────── */}
            {showConfirm && (
                <div style={styles.overlay} onClick={() => setShowConfirm(false)}>
                    <div style={styles.dialog} onClick={e => e.stopPropagation()}>
                        <h3 style={styles.dialogTitle}>End Match?</h3>
                        <p style={styles.dialogBody}>
                            Final score: <strong>{home.name} {homeScore}</strong> – <strong>{awayScore} {away.name}</strong>.
                            <br />All player stats will be saved. This cannot be undone.
                        </p>
                        <div style={styles.dialogActions}>
                            <button
                                style={styles.dialogCancelBtn}
                                onClick={() => setShowConfirm(false)}
                            >
                                Keep Playing
                            </button>
                            <button
                                style={{
                                    ...styles.dialogConfirmBtn,
                                    opacity: isSubmittingEnd ? 0.6 : 1,
                                    cursor: isSubmittingEnd ? 'not-allowed' : 'pointer'
                                }}
                                onClick={confirmEnd}
                                disabled={isSubmittingEnd}
                            >
                                {isSubmittingEnd ? 'Concluding Match...' : 'Confirm & End'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{__html: `
                .pitch-menu-item {
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 11px;
                    font-weight: 600;
                    padding: 5px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    text-align: left;
                    font-family: inherit;
                    transition: all 0.15s ease;
                }
                .pitch-menu-item:hover {
                    background: rgba(255,255,255,0.08);
                    color: var(--text-primary);
                }
            `}} />
        </div>
    );
}

/* ─── styles ───────────────────────────────────────────────────────── */
const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '24px 32px 48px',
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary, #e2e8f0)',
        fontFamily: 'inherit',
    },

    /* Scoreboard */
    scoreboard: {
        background: 'var(--bg-surface)',
        border: 'var(--border)',
        borderRadius: '20px',
        padding: '24px 32px',
        textAlign: 'center',
    },
    matchdayLabel: {
        fontSize: '13px',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        color: 'var(--text-muted, #64748b)',
        marginBottom: '12px',
    },
    scoreRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
    },
    teamBlock: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1,
        justifyContent: 'flex-end',
    },
    teamLogo: {
        width: '48px',
        height: '48px',
        objectFit: 'contain',
        borderRadius: '8px',
    },
    teamName: {
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--text-primary, #e2e8f0)',
        maxWidth: '180px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    scoreCenter: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '160px',
    },
    scoreLine: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    scoreNum: {
        fontSize: '52px',
        fontWeight: 800,
        lineHeight: 1,
        color: '#fff',
        fontVariantNumeric: 'tabular-nums',
    },
    scoreDivider: {
        fontSize: '36px',
        fontWeight: 300,
        color: 'var(--text-muted, #64748b)',
    },
    timer: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '8px',
        fontSize: '14px',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--text-primary)',
    },
    liveDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: 'var(--success)',
        animation: 'pulse 1.5s infinite',
        boxShadow: 'none',
    },

    /* Columns layout */
    columns: {
        display: 'grid',
        gridTemplateColumns: '1fr 340px 1fr',
        gap: '20px',
        alignItems: 'start'
    },
    column: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    timelineColumn: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        background: 'var(--bg-card)',
        border: 'var(--border)',
        borderRadius: '16px',
        padding: '16px',
        height: '460px'
    },
    timelineWrapper: {
        flex: 1,
        overflowY: 'auto',
        paddingRight: '4px'
    },
    timelineEmpty: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '13px',
        lineHeight: 1.6,
        padding: '20px'
    },
    timelineList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    timelineItem: (clr) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'var(--bg-card)',
        borderLeft: `3px solid ${clr}`,
        borderRadius: '0 8px 8px 0',
        fontSize: '12px',
        animation: 'fadeIn 0.2s ease'
    }),
    timelineTime: {
        fontWeight: '700',
        color: 'var(--primary-light)',
        minWidth: '24px',
    },
    timelineText: {
        flex: 1,
        color: 'var(--text-primary)',
        fontWeight: '500',
        lineHeight: 1.3
    },
    undoBtn: {
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.2)',
        fontSize: '12px',
        cursor: 'pointer',
        padding: '4px 6px',
        borderRadius: '4px',
        transition: 'all 0.15s ease'
    },
    columnHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        color: 'var(--text-secondary, #94a3b8)',
        padding: '0 4px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    columnHeaderDot: (clr) => ({
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: clr,
        display: 'inline-block',
    }),
    playerList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    rosterGroupHeader: {
        fontSize: '10px',
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color: 'var(--text-secondary)',
        marginTop: '12px',
        marginBottom: '4px',
        padding: '4px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
    },
    toggleBtn: {
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '10px',
        fontWeight: '700',
        background: 'rgba(255,255,255,0.03)',
        color: 'var(--text-muted)',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        transition: 'all 0.15s'
    },
    toggleBtnActive: {
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '10px',
        fontWeight: '700',
        background: 'rgba(37,99,235,0.18)',
        color: 'var(--primary-light)',
        border: '1px solid rgba(37,99,235,0.35)',
        cursor: 'pointer',
        transition: 'all 0.15s'
    },

    /* Player card */
    playerCard: {
        background: 'var(--bg-card)',
        border: 'var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
    },
    playerRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        gap: '8px',
    },
    playerIdentity: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0,
        flex: '1 1 auto',
    },
    jerseyBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        background: 'var(--bg-input)',
        border: 'var(--border)',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        flexShrink: 0,
    },
    playerName: {
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-primary, #e2e8f0)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    expandArrow: {
        fontSize: '11px',
        color: 'var(--text-muted, #64748b)',
        transition: 'transform 0.2s ease',
        flexShrink: 0,
    },

    /* Quick-action buttons */
    actionsRow: {
        display: 'flex',
        gap: '4px',
        flexShrink: 0,
    },
    actionBtn: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
        padding: 0,
    },
    actionEmoji: {
        fontSize: '14px',
        lineHeight: 1,
    },
    badge: {
        position: 'absolute',
        top: '-5px',
        right: '-5px',
        minWidth: '16px',
        height: '16px',
        borderRadius: '8px',
        background: '#fff',
        color: '#040814',
        fontSize: '10px',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 3px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    },

    /* Detail panel */
    detailPanel: {
        padding: '12px 14px 14px',
        borderTop: 'var(--border)',
        background: 'rgba(0,0,0,0.15)',
    },
    detailGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '10px',
    },
    detailField: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    detailLabel: {
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted, #64748b)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    detailInput: {
        width: '100%',
        padding: '6px 8px',
        borderRadius: '6px',
        border: 'var(--border)',
        background: 'var(--bg-input)',
        color: 'var(--text-primary, #e2e8f0)',
        fontSize: '13px',
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
    },

    /* Bottom bar */
    bottomBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0 0',
        borderTop: 'var(--border)',
    },
    cancelBtn: {
        padding: '10px 20px',
        borderRadius: '10px',
        border: 'var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-secondary, #94a3b8)',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
    },
    endBtn: {
        padding: '10px 28px',
        borderRadius: '10px',
        border: 'none',
        background: 'var(--danger)',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
        boxShadow: 'none',
    },

    /* Overlay / Confirmation dialog */
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    dialog: {
        background: 'var(--bg-surface)',
        border: 'var(--border)',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '440px',
        width: '90%',
        textAlign: 'center',
        boxShadow: 'var(--shadow-lg)',
    },
    dialogTitle: {
        fontSize: '20px',
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 12px',
    },
    dialogBody: {
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'var(--text-secondary, #94a3b8)',
        margin: '0 0 24px',
    },
    dialogActions: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
    },
    dialogCancelBtn: {
        padding: '10px 22px',
        borderRadius: '10px',
        border: 'var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-secondary, #94a3b8)',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
    },
    dialogConfirmBtn: {
        padding: '10px 22px',
        borderRadius: '10px',
        border: 'none',
        background: 'var(--danger)',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
        boxShadow: 'none',
    },
};
