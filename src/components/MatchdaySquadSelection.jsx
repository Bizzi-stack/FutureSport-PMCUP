import { useState, useEffect, useMemo } from 'react';
import StudentProfileDrawer from './StudentProfileDrawer';
import JerseyIcon from './JerseyIcon';
import CountdownSheetModal from './match/CountdownSheetModal';
import MatchdayCountdownSheetModal from './match/MatchdayCountdownSheetModal';
import UploadPlayerRosterModal from './UploadPlayerRosterModal';
import { downloadPlayerCsvTemplate } from '../utils/playerCsvImport';
import { 
    sendRefereeSquadNotification, 
    sendDataLoggerMatchReadyNotification, 
    sendCoachSquadReminderNotification, 
    sendSuperAdminSquadSubmissionAlert,
    getRefereeContactSettings 
} from '../services/refereeNotificationService';
import { PMC_MATCHES } from '../utils/pmcDataLoader';
import { isMatchForTeam } from '../utils/fixtureUtils';

// Formation layouts define rows from back (GK) to front (FWD)
// Each row has: y position (% from top), count of players, role, and position labels
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
            { y: 16, x: 50, role: 'ST', label: 'ST' },
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
            { y: 70, x: 15, role: 'DEF', label: 'LB' },
            { y: 70, x: 38, role: 'DEF', label: 'CB' },
            { y: 70, x: 62, role: 'DEF', label: 'CB' },
            { y: 70, x: 85, role: 'DEF', label: 'RB' },
            { y: 52, x: 35, role: 'CDM', label: 'DM' },
            { y: 52, x: 65, role: 'CDM', label: 'DM' },
            { y: 32, x: 20, role: 'CAM', label: 'LAM' },
            { y: 30, x: 50, role: 'CAM', label: 'CAM' },
            { y: 32, x: 80, role: 'CAM', label: 'RAM' },
            { y: 15, x: 50, role: 'ST', label: 'ST' }
        ]
    },
    '3-5-2': { 
        label: '3-5-2', 
        slots: [
            { y: 88, x: 50, role: 'GK', label: 'GK' },
            { y: 70, x: 25, role: 'DEF', label: 'CB' },
            { y: 70, x: 50, role: 'DEF', label: 'CB' },
            { y: 70, x: 75, role: 'DEF', label: 'CB' },
            { y: 46, x: 12, role: 'MID', label: 'LWB' },
            { y: 46, x: 32, role: 'MID', label: 'CM' },
            { y: 48, x: 50, role: 'MID', label: 'CM' },
            { y: 46, x: 68, role: 'MID', label: 'CM' },
            { y: 46, x: 88, role: 'MID', label: 'RWB' },
            { y: 18, x: 35, role: 'ST', label: 'ST' },
            { y: 18, x: 65, role: 'ST', label: 'ST' }
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

const MAX_BENCH = 7;

const ROLE_COLORS = {
    GK: '#f59e0b',
    DEF: '#3b82f6',
    CDM: '#8b5cf6',
    MID: '#10b981',
    CAM: '#06b6d4',
    FWD: '#ef4444',
    ST: '#ef4444',
};

export default function MatchdaySquadSelection({ matches, schoolId, allPlayers, allTeams, schools, onUpdateMatch, onStudentClick, onImportPlayers }) {
    const [selectedMatchId, setSelectedMatchId] = useState(null);
    const [formation, setFormation] = useState('4-3-3');
    const [previewStudent, setPreviewStudent] = useState(null);
    const [showSquadUploadModal, setShowSquadUploadModal] = useState(false);
    
    // startingXI mapped to slot indices (indices 0 to 10 matching slot configuration)
    const [startingXI, setStartingXI] = useState(() => Array(11).fill(null));
    const [benchPlayers, setBenchPlayers] = useState([]);
    const [captainId, setCaptainId] = useState(null);
    
    // Active slot being selected via pop-up player picker
    const [activeSlotIndex, setActiveSlotIndex] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [notificationInfo, setNotificationInfo] = useState(null);
    const [activeCountdownMatch, setActiveCountdownMatch] = useState(null);
    const [activeCountdownScheduleMatch, setActiveCountdownScheduleMatch] = useState(null);
    const [reminderSentToast, setReminderSentToast] = useState(null);

    // Pre-Match Warm-Up Emergency Injury Amendment State
    const [showWarmupModal, setShowWarmupModal] = useState(false);
    const [warmupInjuredPlayerId, setWarmupInjuredPlayerId] = useState('');
    const [warmupReplacementPlayerId, setWarmupReplacementPlayerId] = useState('');
    const [warmupInjuryReason, setWarmupInjuryReason] = useState('');
    const [warmupSuccessToast, setWarmupSuccessToast] = useState(null);

    const schoolName = useMemo(() => {
        const sc = schools?.find(s => s.id === schoolId);
        return sc ? sc.name : 'My School';
    }, [schools, schoolId]);

    const myTeamIds = useMemo(() => {
        return (allTeams || []).filter(t => t.schoolId === schoolId).map(t => t.id);
    }, [allTeams, schoolId]);

    const myMatches = useMemo(() => {
        const pool = (matches && matches.length > 0) ? matches : (PMC_MATCHES || []);
        const schoolObj = (schools || []).find(s => s.id === schoolId || s.name === schoolId || s.rawId === schoolId);
        const schoolNameStr = schoolObj?.name || schoolName || '';
        const myTeam = (allTeams || []).find(t => t.schoolId === schoolId || t.schoolId === schoolObj?.id);

        let found = (pool || []).filter(m => isMatchForTeam(m, schoolId, myTeam?.id, schoolNameStr));

        // Fallback: If parent matches lacked fixtures for this school, check master PMC_MATCHES
        if (found.length === 0 && pool !== PMC_MATCHES) {
            found = (PMC_MATCHES || []).filter(m => isMatchForTeam(m, schoolId, myTeam?.id, schoolNameStr));
        }
        return found;
    }, [matches, schoolId, schoolName, schools, allTeams]);

    const selectedMatch = useMemo(() => {
        if (!myMatches || myMatches.length === 0) return null;
        if (selectedMatchId) {
            const found = myMatches.find(m => m.id === selectedMatchId);
            if (found) return found;
        }
        // Default to upcoming/scheduled fixture so coach lands directly on match requiring squad selection
        const upcoming = myMatches.find(m => m.status === 'upcoming' || m.status === 'scheduled');
        if (upcoming) return upcoming;
        const live = myMatches.find(m => m.status === 'live');
        if (live) return live;
        return myMatches[0];
    }, [myMatches, selectedMatchId]);

    const isHome = useMemo(() => {
        if (!selectedMatch) return false;
        const targets = [
            schoolId, schoolName,
            ...(allTeams || []).filter(t => t.schoolId === schoolId).flatMap(t => [t.id, t.name])
        ].filter(Boolean).map(x => String(x).toLowerCase());

        const homeVals = [selectedMatch.homeTeamId, selectedMatch.homeTeam, selectedMatch.homeSchoolId].filter(Boolean).map(x => String(x).toLowerCase());
        return homeVals.some(h => targets.some(t => h.includes(t) || t.includes(h)));
    }, [selectedMatch, schoolId, schoolName, allTeams]);

    const eligiblePlayers = useMemo(() => {
        if (!selectedMatch) return [];
        return (allPlayers || []).filter(p => {
            if (p.schoolId === schoolId) return true;
            const assignments = p.teamAssignments || {};
            const teamIds = (allTeams || []).filter(t => t.schoolId === schoolId).map(t => t.id);
            return teamIds.some(tId => Object.values(assignments).includes(tId)) || Object.values(assignments).includes(schoolId);
        });
    }, [allPlayers, selectedMatch, schoolId, allTeams]);

    // Flat list of selected player IDs in starting XI (no nulls)
    const selectedStartingXIIds = useMemo(() => {
        return startingXI.filter(id => id !== null);
    }, [startingXI]);

    // Available players for selection (not in Starting XI and not on bench)
    const availablePlayers = useMemo(() => {
        const selectedIds = new Set([...selectedStartingXIIds, ...benchPlayers]);
        return eligiblePlayers.filter(p => !selectedIds.has(p.id));
    }, [eligiblePlayers, selectedStartingXIIds, benchPlayers]);

    // Filter available players by search query
    const filteredAvailablePlayers = useMemo(() => {
        if (!searchQuery) return availablePlayers;
        const q = searchQuery.toLowerCase();
        return availablePlayers.filter(p => 
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.firstName && p.firstName.toLowerCase().includes(q)) || 
            (p.lastName && p.lastName.toLowerCase().includes(q)) ||
            (p.jerseyNumber != null && String(p.jerseyNumber).includes(q)) ||
            (p.position && p.position.toLowerCase().includes(q)) ||
            (p.playerId && p.playerId.toLowerCase().includes(q)) ||
            (p.id && String(p.id).toLowerCase().includes(q))
        );
    }, [availablePlayers, searchQuery]);

    const getSchoolObj = (teamId) => {
        if (!teamId) return null;
        let sc = (schools || []).find(s => s.id === teamId || s.rawId === teamId);
        if (sc) return sc;
        if (typeof teamId === 'string') {
            const baseId = teamId.includes('-team-') ? teamId.split('-team-')[0] : teamId.split('_')[0];
            sc = (schools || []).find(s => s.id === baseId || s.rawId === baseId);
            if (sc) return sc;
            sc = (schools || []).find(s => s.name?.toLowerCase() === teamId.toLowerCase());
            if (sc) return sc;
        }
        return null;
    };

    const getSchoolName = (teamId, matchObj) => {
        if (!teamId && !matchObj) return 'Unknown Team';
        
        if (matchObj) {
            if (matchObj.homeTeamId === teamId && matchObj.homeTeam && typeof matchObj.homeTeam === 'string' && !matchObj.homeTeam.includes('-team-') && !matchObj.homeTeam.startsWith('s1-') && !matchObj.homeTeam.startsWith('s2-') && !matchObj.homeTeam.startsWith('s3-')) {
                return matchObj.homeTeam;
            }
            if (matchObj.awayTeamId === teamId && matchObj.awayTeam && typeof matchObj.awayTeam === 'string' && !matchObj.awayTeam.includes('-team-') && !matchObj.awayTeam.startsWith('s1-') && !matchObj.awayTeam.startsWith('s2-') && !matchObj.awayTeam.startsWith('s3-')) {
                return matchObj.awayTeam;
            }
        }

        const sc = getSchoolObj(teamId);
        if (sc?.name) {
            if (typeof teamId === 'string' && teamId.includes('-team-')) {
                const ageGroup = teamId.split('-team-')[1];
                if (ageGroup && ageGroup !== 'PMC') {
                    return `${sc.name} (${ageGroup})`;
                }
            }
            return sc.name;
        }

        const team = (allTeams || []).find(t => t.id === teamId || t.schoolId === teamId);
        if (team) {
            const sc2 = getSchoolObj(team.schoolId);
            return sc2 ? `${sc2.name} (${team.name})` : team.name;
        }

        if (matchObj) {
            if (matchObj.homeTeamId === teamId && matchObj.homeTeam) return matchObj.homeTeam;
            if (matchObj.awayTeamId === teamId && matchObj.awayTeam) return matchObj.awayTeam;
        }

        if (typeof teamId === 'string') {
            return teamId
                .replace('-team-PMC', '')
                .replace('-team-', ' ')
                .replace('pmc-club-', 'Club ')
                .replace(/^s1(\b|_|-|\s)/, 'Elite Academy ')
                .replace(/^s2(\b|_|-|\s)/, 'City Football Club ')
                .replace(/^s3(\b|_|-|\s)/, 'United Youth Academy ')
                .replace(/_/g, ' ');
        }

        return 'Team';
    };

    const getPlayerById = (id) => eligiblePlayers.find(p => p.id === id);

    // Helper to persist squad state directly into the match object and sync across tabs/cloud
    const persistSquad = (newXI, newBench, newFormation, newCaptain, isOfficialSubmit = false) => {
        if (!selectedMatch) return null;
        const squadKey = isHome ? 'homeSquadSelection' : 'awaySquadSelection';
        const existingSquad = selectedMatch[squadKey] || {};

        const xiToSave = newXI !== undefined ? newXI : startingXI;
        const benchToSave = newBench !== undefined ? newBench : benchPlayers;
        const formationToSave = newFormation !== undefined ? newFormation : formation;
        const captainToSave = newCaptain !== undefined ? newCaptain : captainId;

        const isFullXI = xiToSave.filter(Boolean).length === 11;
        const wasSubmitted = !!(existingSquad.submittedAt || existingSquad.confirmedAt);

        const squadPayload = {
            ...existingSquad,
            formation: formationToSave,
            startingXI: xiToSave,
            benchPlayers: benchToSave,
            captainId: captainToSave,
            submittedAt: isOfficialSubmit
                ? new Date().toISOString()
                : (isFullXI && wasSubmitted ? existingSquad.submittedAt : null),
            submittedBy: schoolName,
            validationStatus: isOfficialSubmit
                ? 'pending_validation'
                : (isFullXI && wasSubmitted ? (existingSquad.validationStatus || 'draft') : 'draft'),
            lastModified: Date.now()
        };

        const updatedMatch = {
            ...selectedMatch,
            [squadKey]: squadPayload,
            updatedAt: Date.now()
        };

        if (onUpdateMatch) {
            onUpdateMatch(updatedMatch);
        }

        try {
            const draftKey = `fs_squad_draft_${selectedMatch.id}_${schoolId}`;
            if (isOfficialSubmit) {
                localStorage.removeItem(draftKey);
            } else {
                localStorage.setItem(draftKey, JSON.stringify(squadPayload));
            }
        } catch {}

        return updatedMatch;
    };

    // Automatically sync squad state when active match, school, or home/away orientation changes
    // Safely arbitrates between local unsubmitted draft and canonical match state
    useEffect(() => {
        if (!selectedMatch) return;
        const squadKey = isHome ? 'homeSquadSelection' : 'awaySquadSelection';

        let draftSquad = null;
        try {
            const draftKey = `fs_squad_draft_${selectedMatch.id}_${schoolId}`;
            const cached = localStorage.getItem(draftKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && (Array.isArray(parsed.startingXI) || parsed.formation)) {
                    draftSquad = parsed;
                }
            }
        } catch {}

        const matchSquad = selectedMatch[squadKey];

        const getSquadTime = (sq) => {
            if (!sq) return 0;
            const candidates = [sq.lastModified, sq.submittedAt, sq.confirmedAt, sq.updatedAt];
            for (const val of candidates) {
                if (val == null) continue;
                if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
                if (typeof val === 'string') {
                    const parsed = Date.parse(val);
                    if (!isNaN(parsed) && parsed > 0) return parsed;
                }
            }
            return 0;
        };

        const draftTime = getSquadTime(draftSquad);
        const matchTime = getSquadTime(matchSquad);

        let savedSquad = null;
        // Prioritize match squad if it was officially submitted or if draft is older than match state
        if (draftSquad && draftTime > matchTime && !matchSquad?.confirmedAt) {
            savedSquad = draftSquad;
        } else if (matchSquad) {
            savedSquad = matchSquad;
        } else if (draftSquad) {
            savedSquad = draftSquad;
        }

        if (savedSquad) {
            setFormation(savedSquad.formation || '4-3-3');
            setBenchPlayers(savedSquad.benchPlayers || []);
            setCaptainId(savedSquad.captainId || null);
            if (Array.isArray(savedSquad.startingXI) && savedSquad.startingXI.length === 11) {
                setStartingXI(savedSquad.startingXI);
            } else {
                const restored = Array(11).fill(null);
                (savedSquad.startingXI || []).forEach((id, index) => {
                    if (index < 11) restored[index] = id;
                });
                setStartingXI(restored);
            }
        } else {
            setFormation('4-3-3');
            setStartingXI(Array(11).fill(null));
            setBenchPlayers([]);
            setCaptainId(null);
        }
        
        setActiveSlotIndex(null);
        setSearchQuery('');
        setSubmitSuccess(false);
    }, [selectedMatch?.id, schoolId, isHome]);

    const handleSelectMatch = (matchId) => {
        if (selectedMatch && selectedMatch.id !== matchId) {
            persistSquad(startingXI, benchPlayers, formation, captainId);
        }
        setSelectedMatchId(matchId);
        setNotificationInfo(null);
    };

    const assignPlayerToSlot = (playerId) => {
        if (activeSlotIndex === null) return;
        
        const newXI = [...startingXI];
        const existingSlotIdx = newXI.indexOf(playerId);
        if (existingSlotIdx !== -1) {
            newXI[existingSlotIdx] = null;
        }

        newXI[activeSlotIndex] = playerId;
        setStartingXI(newXI);
        setActiveSlotIndex(null);
        setSearchQuery('');
        persistSquad(newXI, benchPlayers, formation, captainId);
    };

    const clearSlot = (slotIdx) => {
        const newXI = [...startingXI];
        const clearedPlayerId = newXI[slotIdx];
        newXI[slotIdx] = null;
        setStartingXI(newXI);
        setActiveSlotIndex(null);

        const newCaptain = (clearedPlayerId && String(captainId) === String(clearedPlayerId)) ? null : captainId;
        if (newCaptain !== captainId) {
            setCaptainId(newCaptain);
        }
        persistSquad(newXI, benchPlayers, formation, newCaptain);
    };

    const clearAllStarters = () => {
        const emptyXI = Array(11).fill(null);
        setStartingXI(emptyXI);
        setCaptainId(null);
        setActiveSlotIndex(null);
        persistSquad(emptyXI, benchPlayers, formation, null);
    };

    const clearAllBench = () => {
        setBenchPlayers([]);
        persistSquad(startingXI, [], formation, captainId);
    };

    const addToBench = (playerId) => {
        if (benchPlayers.length >= MAX_BENCH) return;
        const newBench = [...benchPlayers, playerId];
        setBenchPlayers(newBench);
        persistSquad(startingXI, newBench, formation, captainId);
    };

    const removeFromBench = (playerId) => {
        const newBench = benchPlayers.filter(id => id !== playerId);
        setBenchPlayers(newBench);
        persistSquad(startingXI, newBench, formation, captainId);
    };

    const handleSubmitSquad = () => {
        if (selectedStartingXIIds.length !== 11 || !selectedMatch) return;
        const opponentSquadKey = isHome ? 'awaySquadSelection' : 'homeSquadSelection';
        const opponentAlreadySubmitted = !!selectedMatch[opponentSquadKey];

        const updatedMatch = persistSquad(startingXI, benchPlayers, formation, captainId, true);
        setSubmitSuccess(true);

        const homeName = getSchoolName(selectedMatch.homeTeamId, selectedMatch);
        const awayName = getSchoolName(selectedMatch.awayTeamId, selectedMatch);

        // Dispatch instant alert to Super-Administrator for roster verification
        try {
            sendSuperAdminSquadSubmissionAlert(updatedMatch || selectedMatch, schoolName, isHome ? awayName : homeName);
        } catch (adminAlertErr) {
            console.warn('Super-Admin squad notification notice:', adminAlertErr);
        }

        const isSandbox = selectedMatch?.isSandboxMatch === true || selectedMatch?.isUclMatch === true || selectedMatch?.tournamentId === 'UCL' || String(selectedMatch?.tournament || '').includes('Champions League');

        if (opponentAlreadySubmitted) {
            setNotificationInfo({
                bothReady: true,
                refereeEmail: getRefereeContactSettings().refereeEmail,
                homeName,
                awayName,
                isSandbox
            });
        } else {
            setNotificationInfo({
                bothReady: false,
                refereeEmail: getRefereeContactSettings().refereeEmail,
                homeName,
                awayName,
                isSandbox
            });
        }

        setTimeout(() => {
            setSubmitSuccess(false);
        }, 6000);
    };

    const handleReopenSquad = () => {
        if (!selectedMatch) return;
        const squadKey = isHome ? 'homeSquadSelection' : 'awaySquadSelection';
        const existingSquad = selectedMatch[squadKey] || {};
        const updatedSquad = {
            ...existingSquad,
            formation: existingSquad.formation || formation || '4-3-3',
            startingXI: existingSquad.startingXI || startingXI,
            benchPlayers: existingSquad.benchPlayers || benchPlayers,
            captainId: existingSquad.captainId || captainId,
            submittedAt: null,
            confirmedAt: null,
            validationStatus: 'draft',
            lastModified: Date.now()
        };
        const updatedMatch = {
            ...selectedMatch,
            [squadKey]: updatedSquad,
            updatedAt: Date.now()
        };
        onUpdateMatch(updatedMatch);
        try {
            const draftKey = `fs_squad_draft_${selectedMatch.id}_${schoolId}`;
            localStorage.setItem(draftKey, JSON.stringify(updatedSquad));
        } catch {}
        setSubmitSuccess(false);
        setNotificationInfo(null);
    };

    const handleSendCoachSelfReminder = async () => {
        if (!selectedMatch) return;
        const opponentId = isHome ? selectedMatch.awayTeamId : selectedMatch.homeTeamId;
        const opponentName = getSchoolName(opponentId, selectedMatch);
        try {
            const res = await sendCoachSquadReminderNotification(
                selectedMatch,
                schoolName,
                '', // defaults to coach contact
                `Head Coach (${schoolName})`,
                opponentName
            );
            if (res?.bypassed) {
                setReminderSentToast(`✓ Squad submission reminder simulated (Gmail dispatch silenced in Sandbox Mode).`);
            } else {
                setReminderSentToast(`✓ Squad submission reminder delivered to Coach email!`);
            }
            setTimeout(() => setReminderSentToast(null), 5000);
        } catch (e) {
            console.warn('Failed to send coach reminder:', e);
        }
    };

    // Submit Pre-Match Warm-Up Emergency Lineup Amendment to Match Commissioner
    const handleSubmitWarmupAmendment = () => {
        if (!selectedMatch || !warmupInjuredPlayerId || !warmupReplacementPlayerId) return;

        const injuredP = getPlayerById(warmupInjuredPlayerId);
        const replacementP = getPlayerById(warmupReplacementPlayerId);

        const amendment = {
            id: `warmup-${Date.now()}`,
            matchId: selectedMatch.id,
            teamId: schoolId,
            teamName: schoolName,
            isHome,
            playerOffId: warmupInjuredPlayerId,
            playerOffName: injuredP?.name || 'Injured Player',
            playerOffJersey: injuredP?.jerseyNumber != null ? injuredP.jerseyNumber : '—',
            playerOnId: warmupReplacementPlayerId,
            playerOnName: replacementP?.name || 'Replacement Player',
            playerOnJersey: replacementP?.jerseyNumber != null ? replacementP.jerseyNumber : '—',
            injuryReason: warmupInjuryReason.trim() || 'Injury sustained during pre-match warm-up drills',
            requestedAt: new Date().toISOString(),
            status: 'pending_commissioner', // 'pending_commissioner' | 'approved' | 'rejected'
            isSubstitution: false // Explicitly NOT an in-game match substitution
        };

        const existingAmendments = selectedMatch.warmupAmendments || [];
        const updatedMatch = {
            ...selectedMatch,
            warmupAmendments: [...existingAmendments, amendment],
            updatedAt: Date.now()
        };

        if (onUpdateMatch) onUpdateMatch(updatedMatch);

        setShowWarmupModal(false);
        setWarmupInjuredPlayerId('');
        setWarmupReplacementPlayerId('');
        setWarmupInjuryReason('');

        setWarmupSuccessToast(`🚨 Warm-up injury amendment submitted for #${replacementP?.jerseyNumber} ${replacementP?.name} to replace injured starter #${injuredP?.jerseyNumber} ${injuredP?.name}. Awaiting Match Commissioner approval (0 match substitutions charged).`);
        setTimeout(() => setWarmupSuccessToast(null), 6000);
    };

    const alreadySubmitted = useMemo(() => {
        if (!selectedMatch) return false;
        const key = isHome ? 'homeSquadSelection' : 'awaySquadSelection';
        return !!(selectedMatch[key]?.confirmedAt || selectedMatch[key]?.submittedAt);
    }, [selectedMatch, isHome]);

    const pitchSlots = useMemo(() => {
        const layout = FORMATION_LAYOUTS[formation];
        return layout ? layout.slots : [];
    }, [formation]);

    const activeSlotRole = useMemo(() => {
        if (activeSlotIndex === null) return '';
        return pitchSlots[activeSlotIndex]?.label || '';
    }, [activeSlotIndex, pitchSlots]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', minHeight: 0 }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>Matchday Squad Selection</h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Configure formation, click pitch positions to select players, and fill your bench.</span>
            </div>

            {/* Referee Email & Kick-off Notification Banner */}
            {notificationInfo && (
                <div style={{
                    padding: '12px 18px', borderRadius: '12px',
                    background: notificationInfo.bothReady ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.12))' : 'rgba(99,102,241,0.12)',
                    border: `1px solid ${notificationInfo.bothReady ? '#22c55e' : '#6366f1'}`,
                    color: notificationInfo.bothReady ? '#4ade80' : '#a5b4fc',
                    fontSize: '12.5px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div>
                            <div>
                                {notificationInfo.bothReady
                                    ? (notificationInfo.isSandbox
                                        ? `Both squads submitted! Match is ready for kick-off. (⭐ UCL Sandbox: External Gmail alerts silenced · Instant test session active)`
                                        : `Both squads submitted! Match is ready for blow-off. Official notification & team sheets dispatched to Referee via Gmail (${notificationInfo.refereeEmail}).`)
                                    : (notificationInfo.isSandbox
                                        ? `Your squad is submitted. Waiting for opponent squad submission before match is kick-off ready.`
                                        : `Your squad is submitted. Waiting for opponent squad submission before referee kick-off alert is dispatched.`)
                                }
                            </div>
                            <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                                {notificationInfo.bothReady 
                                    ? (notificationInfo.isSandbox ? `Match Commissioner or Referee can start match without generating external email traffic.` : `Referee assigned can blow the whistle from the Referee Dashboard.`)
                                    : `Referee will be alerted automatically as soon as the opposing coach submits.`}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setNotificationInfo(null)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#ffffff', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {myMatches.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '12px' }}>
                        No matches found for {schoolName}. Fixtures are automatically populated from the Prime Minister's Cup schedule.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: selectedMatch ? '260px 1fr' : '1fr', gap: '16px', flex: 1, minHeight: 0 }}>
                    
                    {/* Fixture list */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 18px', borderBottom: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>Team Fixtures</h3>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {myMatches.map(m => {
                                const cleanId = String(schoolId || '').toLowerCase().replace('-team-pmc', '');
                                const cleanName = String(schoolName || '').toLowerCase().trim();
                                const isMatchHome = String(m.homeTeamId || '').toLowerCase().includes(cleanId) ||
                                                    String(m.homeTeam || '').toLowerCase().includes(cleanName);
                                const squadKey = isMatchHome ? 'homeSquadSelection' : 'awaySquadSelection';
                                const submitted = !!(m[squadKey]?.confirmedAt || m[squadKey]?.submittedAt);
                                const isFinished = m.status === 'completed' || m.status === 'refereed';
                                return (
                                    <div key={m.id} onClick={() => handleSelectMatch(m.id)} style={{
                                        padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                                        background: selectedMatchId === m.id ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.01)',
                                        border: selectedMatchId === m.id ? '1px solid rgba(37,99,235,0.3)' : 'var(--border)',
                                        display: 'flex', flexDirection: 'column', gap: '4px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                                            <span style={{ color: 'var(--primary-light)', fontWeight: '700' }}>{m.ageGroup || 'PMC'} • {m.matchday || m.round}</span>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                {m.status === 'live' && <span style={{ color: '#4ade80', fontWeight: '800', background: 'rgba(74,222,128,0.15)', padding: '1px 6px', borderRadius: '8px' }}>LIVE</span>}
                                                {isFinished && <span style={{ color: '#94a3b8', fontWeight: '700', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '8px' }}>FINISHED</span>}
                                                {submitted && !isFinished && m.status !== 'live' && <span style={{ color: 'var(--success)', fontWeight: '700' }}>SENT</span>}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                            {getSchoolName(m.homeTeamId, m)} vs {getSchoolName(m.awayTeamId, m)}
                                        </div>
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.venue}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Squad builder */}
                    {selectedMatch && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                            
                            {/* Match header */}
                            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        {getSchoolName(selectedMatch.homeTeamId, selectedMatch)} vs {getSchoolName(selectedMatch.awayTeamId, selectedMatch)}
                                    </h3>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{selectedMatch.ageGroup || 'PMC'} • {selectedMatch.matchday || selectedMatch.round} • {selectedMatch.venue}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {/* View Official Team Sheet Button */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveCountdownMatch(selectedMatch)}
                                        title="Official Team Lineup & Roster Sheet"
                                        style={{
                                            padding: '7px 12px', borderRadius: '10px', fontSize: '11.5px', fontWeight: '700',
                                            background: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.3)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        📋 Official Team Sheet
                                    </button>

                                    {/* View Matchday Countdown Protocol Button */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveCountdownScheduleMatch(selectedMatch)}
                                        title="Operational Matchday Countdown Protocol & Timetable"
                                        style={{
                                            padding: '7px 12px', borderRadius: '10px', fontSize: '11.5px', fontWeight: '700',
                                            background: 'rgba(255,199,38,0.15)', color: '#FFC726', border: '1px solid rgba(255,199,38,0.3)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        ⏱️ Countdown Sheet
                                    </button>

                                    {selectedMatch.status === 'live' ? (
                                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(74,222,128,0.3)' }}>
                                            LIVE ({selectedMatch.homeScore} - {selectedMatch.awayScore})
                                        </span>
                                    ) : (selectedMatch.status === 'completed' || selectedMatch.status === 'refereed') ? (
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: '20px', border: 'var(--border)' }}>
                                            Match Completed ({selectedMatch.homeScore} - {selectedMatch.awayScore})
                                        </span>
                                    ) : alreadySubmitted ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(16,185,129,0.25)' }}>Squad Submitted</span>
                                            <button
                                                type="button"
                                                onClick={() => setShowWarmupModal(true)}
                                                style={{
                                                    padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: '800',
                                                    background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1.5px solid rgba(239, 68, 68, 0.4)',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)'
                                                }}
                                                title="Emergency pre-kickoff switch if a player is injured during warm-ups"
                                            >
                                                <span>🚨</span>
                                                <span>Warm-Up Injury Switch</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleReopenSquad}
                                                style={{
                                                    padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: '800',
                                                    background: 'rgba(255,199,38,0.15)', color: '#FFC726', border: '1px solid rgba(255,199,38,0.4)',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                }}
                                                title="Reopen pitch to make changes and submit again"
                                            >
                                                <span>✏️</span>
                                                <span>Edit / Reopen Squad</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={handleSendCoachSelfReminder}
                                                style={{
                                                    padding: '8px 14px', borderRadius: '10px', fontSize: '11.5px', fontWeight: '700',
                                                    background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                                }}
                                                title="Send an email reminder to submit this squad before kickoff"
                                            >
                                                Send Reminder
                                            </button>
                                            <button
                                                type="button"
                                                onClick={clearAllStarters}
                                                disabled={selectedStartingXIIds.length === 0}
                                                style={{
                                                    padding: '8px 14px', borderRadius: '10px', fontSize: '11.5px', fontWeight: '700',
                                                    background: selectedStartingXIIds.length > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.03)',
                                                    color: selectedStartingXIIds.length > 0 ? '#fca5a5' : 'var(--text-muted)',
                                                    border: selectedStartingXIIds.length > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : 'var(--border)',
                                                    cursor: selectedStartingXIIds.length > 0 ? 'pointer' : 'not-allowed',
                                                    display: 'flex', alignItems: 'center', gap: '5px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Clear all assigned starting XI players for this match"
                                            >
                                                <span>✕</span>
                                                <span>Clear Pitch ({selectedStartingXIIds.length}/11)</span>
                                            </button>
                                            <button onClick={handleSubmitSquad} disabled={selectedStartingXIIds.length !== 11} style={{
                                                padding: '8px 22px', borderRadius: '10px', fontSize: '12px', fontWeight: '800',
                                                background: selectedStartingXIIds.length === 11 ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'rgba(255,255,255,0.06)',
                                                color: selectedStartingXIIds.length === 11 ? '#ffffff' : 'var(--text-muted)',
                                                border: selectedStartingXIIds.length === 11 ? 'none' : 'var(--border)',
                                                cursor: selectedStartingXIIds.length === 11 ? 'pointer' : 'not-allowed',
                                                boxShadow: selectedStartingXIIds.length === 11 ? '0 4px 14px rgba(37,99,235,0.4)' : 'none',
                                                transition: 'all 0.15s ease'
                                            }}>
                                                Submit Squad ({formation})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Warm-Up Toast Notification */}
                            {warmupSuccessToast && (
                                <div style={{
                                    padding: '12px 18px', borderRadius: '12px',
                                    background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
                                    color: '#fca5a5', fontSize: '12.5px', fontWeight: '700',
                                    display: 'flex', alignItems: 'center', gap: '10px'
                                }}>
                                    <span>🚨</span>
                                    <span>{warmupSuccessToast}</span>
                                </div>
                            )}

                            {/* Warm-Up Injury Amendments Status Banner */}
                            {(() => {
                                const amendments = (selectedMatch.warmupAmendments || []).filter(a => a.teamId === schoolId || (isHome ? a.isHome : !a.isHome));
                                const pendingAmendment = amendments.find(a => a.status === 'pending_commissioner');
                                const approvedAmendments = amendments.filter(a => a.status === 'approved');

                                return (
                                    <>
                                        {pendingAmendment && (
                                            <div style={{
                                                padding: '12px 18px', borderRadius: '12px',
                                                background: 'rgba(245, 158, 11, 0.14)', border: '1.5px solid rgba(245, 158, 11, 0.45)',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                                                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.15)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '20px' }}>🟡</span>
                                                    <div>
                                                        <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>Warm-Up Injury Amendment Pending Match Commissioner Approval</span>
                                                        </div>
                                                        <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '2px' }}>
                                                            <strong>#{pendingAmendment.playerOnJersey} {pendingAmendment.playerOnName}</strong> to replace injured starter <strong>#{pendingAmendment.playerOffJersey} {pendingAmendment.playerOffName}</strong> ({pendingAmendment.injuryReason}).
                                                            <span style={{ color: '#93c5fd', marginLeft: '8px', fontWeight: '700' }}>ℹ️ Pre-kickoff switch: 0 match substitutions charged.</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '10px', fontWeight: '900', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.25)', padding: '4px 10px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                                    AWAITING COMMISSIONER
                                                </span>
                                            </div>
                                        )}
                                        {approvedAmendments.map(am => (
                                            <div key={am.id} style={{
                                                padding: '10px 16px', borderRadius: '12px',
                                                background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '16px', color: '#4ade80' }}>✓</span>
                                                    <div style={{ fontSize: '12px', color: '#ffffff' }}>
                                                        <strong style={{ color: '#4ade80' }}>Match Commissioner Approved Warm-Up Replacement:</strong> #{am.playerOnJersey} {am.playerOnName} entered the Starting XI for #{am.playerOffJersey} {am.playerOffName}.
                                                        <span style={{ color: '#a5b4fc', marginLeft: '6px', fontSize: '11px' }}>(0 match substitutions charged)</span>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '10px', fontWeight: '900', color: '#4ade80', background: 'rgba(34, 197, 94, 0.2)', padding: '3px 8px', borderRadius: '6px' }}>
                                                    APPROVED BY COMMISSIONER
                                                </span>
                                            </div>
                                        ))}
                                    </>
                                );
                            })()}

                            {/* Coach Reminder Toast Notification */}
                            {reminderSentToast && (
                                <div style={{
                                    padding: '10px 16px', borderRadius: '10px',
                                    background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
                                    color: '#4ade80', fontSize: '12px', fontWeight: '700',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}>
                                    {reminderSentToast}
                                </div>
                            )}

                            {/* Formation selector & Quick CSV Upload Bar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginRight: '4px' }}>Formation:</span>
                                    {Object.keys(FORMATION_LAYOUTS).map(f => (
                                        <button key={f} disabled={alreadySubmitted} onClick={() => {
                                            setFormation(f);
                                            const emptyXI = Array(11).fill(null);
                                            setStartingXI(emptyXI);
                                            persistSquad(emptyXI, benchPlayers, f, captainId);
                                        }} style={{
                                            padding: '5px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '700',
                                            background: formation === f ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.03)',
                                            color: formation === f ? 'var(--primary-light)' : 'var(--text-secondary)',
                                            border: formation === f ? '1px solid rgba(37,99,235,0.35)' : 'var(--border)',
                                            cursor: alreadySubmitted ? 'default' : 'pointer', transition: 'all 0.15s',
                                            opacity: alreadySubmitted ? 0.6 : 1
                                        }}>
                                            {f}
                                        </button>
                                    ))}
                                </div>

                                {!alreadySubmitted && (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => downloadPlayerCsvTemplate()}
                                            title="Download editable CSV roster template with Squad Numbers and Player IDs"
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            📄 CSV Template
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowSquadUploadModal(true)}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '8px',
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                                color: '#fff',
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)'
                                            }}
                                        >
                                            📥 Upload Squad CSV
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Layout containing Pitch (fixed/contained aspect ratio) & Side Panel */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr 340px', 
                                gap: '20px',
                                alignItems: 'start'
                            }}>
                                
                                {/* ═══ PITCH VISUALIZATION ═══ */}
                                <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ padding: '10px 14px', borderBottom: 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Formation: {formation}</span>
                                        <span style={{ fontSize: '11px', color: selectedStartingXIIds.length === 11 ? 'var(--success)' : 'var(--warning)', fontWeight: '700' }}>
                                            {selectedStartingXIIds.length}/11 assigned
                                        </span>
                                    </div>
                                    
                                    <div style={{
                                        position: 'relative',
                                        width: '100%',
                                        height: '520px',
                                        background: 'linear-gradient(180deg, #165c29 0%, #1c6d32 15%, #165c29 30%, #1c6d32 45%, #165c29 60%, #1c6d32 75%, #165c29 90%, #1c6d32 100%)',
                                        borderRadius: '0 0 12px 12px',
                                        overflow: 'hidden',
                                    }}>
                                        {/* Pitch markings */}
                                        <div style={{ position: 'absolute', inset: '3%', border: '2px solid rgba(255,255,255,0.25)', borderRadius: '4px' }} />
                                        <div style={{ position: 'absolute', left: '3%', right: '3%', top: '50%', height: '2px', background: 'rgba(255,255,255,0.2)' }} />
                                        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '22%', height: '16%', transform: 'translate(-50%, -50%)', border: '2px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
                                        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '6px', height: '6px', transform: 'translate(-50%, -50%)', background: 'rgba(255,255,255,0.4)', borderRadius: '50%' }} />
                                        <div style={{ position: 'absolute', left: '22%', right: '22%', top: '3%', height: '14%', border: '2px solid rgba(255,255,255,0.2)', borderTop: 'none' }} />
                                        <div style={{ position: 'absolute', left: '22%', right: '22%', bottom: '3%', height: '14%', border: '2px solid rgba(255,255,255,0.2)', borderBottom: 'none' }} />

                                        {/* Player slots on Pitch */}
                                        {pitchSlots.map((slot, idx) => {
                                            const playerId = startingXI[idx];
                                            const player = getPlayerById(playerId);
                                            const roleColor = player ? (ROLE_COLORS[slot.role] || '#6366f1') : 'rgba(255,255,255,0.08)';
                                            const isEditingThisSlot = activeSlotIndex === idx;

                                            return (
                                                <div 
                                                    key={idx} 
                                                    onClick={() => !alreadySubmitted && setActiveSlotIndex(idx)}
                                                    style={{
                                                        position: 'absolute',
                                                        left: `${slot.x}%`,
                                                        top: `${slot.y}%`,
                                                        transform: 'translate(-50%, -50%)',
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                                                        zIndex: 2,
                                                        cursor: alreadySubmitted ? 'default' : 'pointer',
                                                    }}
                                                >
                                                    {/* Football Kit SVG Jersey Graphic */}
                                                    {player ? (
                                                        <JerseyIcon 
                                                            number={player.jerseyNumber != null ? player.jerseyNumber : (idx + 1)} 
                                                            color={roleColor} 
                                                            size={isEditingThisSlot ? 62 : 54}
                                                            style={{
                                                                transform: isEditingThisSlot ? 'scale(1.15)' : 'scale(1)',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: '42px',
                                                            height: '42px',
                                                            borderRadius: '50%',
                                                            background: 'rgba(0,0,0,0.4)',
                                                            border: '2px dashed rgba(255,255,255,0.4)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '16px', fontWeight: '800', color: 'rgba(255,255,255,0.7)'
                                                        }}>
                                                            +
                                                        </div>
                                                    )}
                                                    {/* Name Tag Pill with Captain (C) Indicator & Profile Drawer Trigger */}
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                        background: player ? 'rgba(15,23,42,0.95)' : 'rgba(0,0,0,0.6)',
                                                        padding: '3px 9px',
                                                        borderRadius: '14px',
                                                        fontSize: '10.5px',
                                                        fontWeight: '800',
                                                        color: player ? '#ffffff' : 'rgba(255,255,255,0.7)',
                                                        whiteSpace: 'nowrap',
                                                        maxWidth: '120px',
                                                        border: (player && String(player.id) === String(captainId)) ? '1.5px solid #FFC726' : (player ? '1px solid rgba(255,255,255,0.25)' : '1px dashed rgba(255,255,255,0.25)'),
                                                        boxShadow: (player && String(player.id) === String(captainId)) ? '0 0 10px rgba(255,199,38,0.5)' : '0 3px 8px rgba(0,0,0,0.5)'
                                                    }}>
                                                        {/* Captain Armband Badge */}
                                                        {player && String(player.id) === String(captainId) && (
                                                            <span
                                                                title="Team Captain"
                                                                style={{
                                                                    background: '#FFC726',
                                                                    color: '#000000',
                                                                    borderRadius: '50%',
                                                                    width: '15px',
                                                                    height: '15px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: '900',
                                                                    fontSize: '9.5px',
                                                                    lineHeight: 1,
                                                                    boxShadow: '0 0 6px rgba(255,199,38,0.8)',
                                                                    flexShrink: 0
                                                                }}
                                                            >
                                                                C
                                                            </span>
                                                        )}

                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {player ? (player.name ? (player.name.split(' ').slice(-1)[0] || player.name) : (player.lastName || 'Player')) : slot.label}
                                                        </span>

                                                        {/* Set/Unset Captain Quick Action */}
                                                        {player && !alreadySubmitted && (
                                                            <button
                                                                type="button"
                                                                title={String(player.id) === String(captainId) ? 'Current Captain (Click to unset)' : 'Nominate as Team Captain'}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newCap = String(player.id) === String(captainId) ? null : player.id;
                                                                    setCaptainId(newCap);
                                                                    persistSquad(startingXI, benchPlayers, formation, newCap);
                                                                }}
                                                                style={{
                                                                    background: String(player.id) === String(captainId) ? '#FFC726' : 'rgba(255,255,255,0.1)',
                                                                    border: String(player.id) === String(captainId) ? 'none' : '1px solid rgba(255,255,255,0.3)',
                                                                    borderRadius: '50%',
                                                                    width: '16px',
                                                                    height: '16px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '9px',
                                                                    fontWeight: '900',
                                                                    color: String(player.id) === String(captainId) ? '#000' : 'rgba(255,255,255,0.8)',
                                                                    cursor: 'pointer',
                                                                    padding: 0,
                                                                    marginLeft: '1px'
                                                                }}
                                                            >
                                                                C
                                                            </button>
                                                        )}

                                                        {/* Profile Icon Trigger Button */}
                                                        {player && (
                                                            <button
                                                                type="button"
                                                                title={`View ${player.name || 'Player'}'s Permanent Stats Profile`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (onStudentClick) {
                                                                        onStudentClick(player);
                                                                    } else {
                                                                        setPreviewStudent(player);
                                                                    }
                                                                }}
                                                                style={{
                                                                    background: 'rgba(99, 102, 241, 0.4)',
                                                                    border: '1px solid rgba(165, 180, 252, 0.6)',
                                                                    borderRadius: '50%',
                                                                    width: '16px',
                                                                    height: '16px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '9px',
                                                                    color: '#ffffff',
                                                                    cursor: 'pointer',
                                                                    padding: 0,
                                                                    marginLeft: '1px',
                                                                    transition: 'transform 0.15s ease'
                                                                }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.25)'; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                                            >
                                                                👤
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* ═══ INTERACTIVE POSITION SELECTION POP-UP OVERLAY ═══ */}
                                        {activeSlotIndex !== null && (
                                            <div style={{
                                                position: 'absolute',
                                                inset: 0,
                                                background: 'rgba(10, 25, 15, 0.92)',
                                                zIndex: 10,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                padding: '16px',
                                                color: '#fff',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div>
                                                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: 'var(--primary-light)' }}>
                                                            Assign {activeSlotRole} Position
                                                        </h4>
                                                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Select player or clear slot</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => { setActiveSlotIndex(null); setSearchQuery(''); }}
                                                        style={{ background: 'none', border: 'none', color: '#ff6b6b', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>

                                                {/* Search Box */}
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    placeholder="Search player name or number..."
                                                    style={{
                                                        padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
                                                        background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '12px', outline: 'none',
                                                        marginBottom: '10px'
                                                    }}
                                                />

                                                {/* Available Selection List */}
                                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                                                    {startingXI[activeSlotIndex] && (
                                                        <button 
                                                            onClick={() => clearSlot(activeSlotIndex)}
                                                            style={{
                                                                padding: '8px', borderRadius: '6px', border: '1px solid rgba(255, 107, 107, 0.3)',
                                                                background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', fontSize: '11px',
                                                                fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                            }}
                                                        >
                                                            ✕ Remove Assigned Player from this Position
                                                        </button>
                                                    )}

                                                    {filteredAvailablePlayers.length === 0 ? (
                                                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', padding: '12px', textAlign: 'center' }}>
                                                            No matches. Make sure player is not in another slot or on the bench.
                                                        </span>
                                                    ) : (
                                                        filteredAvailablePlayers.map(p => (
                                                            <div 
                                                                key={p.id} 
                                                                onClick={() => assignPlayerToSlot(p.id)}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyItems: 'space-between',
                                                                    padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)',
                                                                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background 0.15s'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                                    <span style={{
                                                                        width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        fontSize: '9px', fontWeight: '800', color: '#fff', border: '1px solid rgba(255,255,255,0.15)'
                                                                    }}>
                                                                        {p.jerseyNumber != null ? p.jerseyNumber : '—'}
                                                                    </span>
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#fff' }}>
                                                                            {p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()}
                                                                        </span>
                                                                        <span style={{ fontSize: '9px', color: '#a5b4fc', fontFamily: 'monospace', fontWeight: '700' }}>
                                                                            Player ID: {p.playerId || `PID-2026-${String(p.id).padStart(5, '0')}`} {p.position ? `• ${p.position}` : ''}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: '10px', color: 'var(--primary-light)', fontWeight: '700' }}>Select</span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ═══ SIDE PANEL: SQUAD SUMMARY & BENCH SELECTION ═══ */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    
                                    {/* Team Captain Selection Panel */}
                                    <div className="glass-panel" style={{ padding: '12px', background: 'rgba(255, 199, 38, 0.04)', border: '1px solid rgba(255, 199, 38, 0.25)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#FFC726', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ background: '#FFC726', color: '#000', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '11px' }}>C</span>
                                                Team Captain
                                            </span>
                                            {captainId && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCaptainId(null);
                                                        persistSquad(startingXI, benchPlayers, formation, null);
                                                    }}
                                                    disabled={alreadySubmitted}
                                                    style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '10px', cursor: 'pointer', fontWeight: '700' }}
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        
                                        <select
                                            value={captainId || ''}
                                            disabled={alreadySubmitted}
                                            onChange={e => {
                                                const newCap = e.target.value || null;
                                                setCaptainId(newCap);
                                                persistSquad(startingXI, benchPlayers, formation, newCap);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: 'rgba(15, 23, 42, 0.8)',
                                                color: captainId ? '#FFC726' : 'var(--text-muted)',
                                                border: '1px solid rgba(255, 199, 38, 0.4)',
                                                fontSize: '12px',
                                                fontWeight: '700',
                                                outline: 'none',
                                                cursor: alreadySubmitted ? 'default' : 'pointer'
                                            }}
                                        >
                                            <option value="">-- Select Team Captain --</option>
                                            <optgroup label="Starting XI">
                                                {selectedStartingXIIds.map(pid => {
                                                    const p = getPlayerById(pid);
                                                    if (!p) return null;
                                                    return (
                                                        <option key={p.id} value={p.id}>
                                                            #{p.jerseyNumber != null ? p.jerseyNumber : '—'} {p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()} ({p.position || 'Starter'})
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                            {benchPlayers.length > 0 && (
                                                <optgroup label="Bench">
                                                    {benchPlayers.map(pid => {
                                                        const p = getPlayerById(pid);
                                                        if (!p) return null;
                                                        return (
                                                            <option key={p.id} value={p.id}>
                                                                #{p.jerseyNumber != null ? p.jerseyNumber : '—'} {p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()} (Bench)
                                                            </option>
                                                        );
                                                    })}
                                                </optgroup>
                                            )}
                                        </select>
                                    </div>

                                    {/* Bench Management Panel */}
                                    <div className="glass-panel" style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)' }}>Substitute Bench</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {benchPlayers.length > 0 && !alreadySubmitted && (
                                                    <button
                                                        type="button"
                                                        onClick={clearAllBench}
                                                        style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '10px', cursor: 'pointer', fontWeight: '700' }}
                                                        title="Remove all bench substitutes"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>{benchPlayers.length}/{MAX_BENCH} max</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto', marginBottom: '8px' }}>
                                            {benchPlayers.length === 0 ? (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '6px', textAlign: 'center' }}>No substitutes selected</span>
                                            ) : benchPlayers.map(pid => {
                                                const p = getPlayerById(pid);
                                                return (
                                                    <div 
                                                        key={pid} 
                                                        onClick={() => !alreadySubmitted && removeFromBench(pid)} 
                                                        title={alreadySubmitted ? '' : 'Click to remove'} 
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px',
                                                            background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)',
                                                            cursor: alreadySubmitted ? 'default' : 'pointer'
                                                        }}
                                                    >
                                                        <JerseyIcon number={p?.jerseyNumber != null ? p.jerseyNumber : '—'} color="#f59e0b" size={24} />
                                                        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {p ? (p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()) : `#${pid}`}
                                                        </span>
                                                        {!alreadySubmitted && <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>✕</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Bench Available Player Pool Selector */}
                                    <div className="glass-panel" style={{ padding: '12px', maxHeight: '290px', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexShrink: 0 }}>
                                            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-primary)' }}>Select Bench Players</span>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{availablePlayers.length} unassigned</span>
                                        </div>
                                        
                                        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            {availablePlayers.length === 0 ? (
                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center' }}>
                                                    All players have been assigned.
                                                </span>
                                            ) : availablePlayers.map(p => (
                                                <div key={p.id} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '5px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                                        <JerseyIcon number={p.jerseyNumber != null ? p.jerseyNumber : '—'} color="#3b82f6" size={24} />
                                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                            <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()}
                                                            </span>
                                                            <span style={{ fontSize: '9px', color: '#a5b4fc', fontFamily: 'monospace', fontWeight: '700' }}>
                                                                {p.playerId || `PID-2026-${String(p.id).padStart(5, '0')}`} {p.jerseyNumber != null ? `• #${p.jerseyNumber}` : ''}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => addToBench(p.id)} 
                                                        disabled={benchPlayers.length >= MAX_BENCH || alreadySubmitted} 
                                                        style={{
                                                            padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '800',
                                                            background: (benchPlayers.length >= MAX_BENCH || alreadySubmitted) ? 'rgba(255,255,255,0.02)' : 'rgba(245,158,11,0.15)',
                                                            color: (benchPlayers.length >= MAX_BENCH || alreadySubmitted) ? 'var(--text-muted)' : 'var(--warning)',
                                                            border: 'none', cursor: (benchPlayers.length >= MAX_BENCH || alreadySubmitted) ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        + Bench
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </div>

                            {/* Submit bar */}
                            {submitSuccess && (
                                <div style={{
                                    padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--success)', fontSize: '12px', fontWeight: '600', textAlign: 'center'
                                }}>
                                    ✓ Squad submitted! The statistician will see your Starting XI and Bench for this match.
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                                {alreadySubmitted ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShowWarmupModal(true)}
                                            style={{
                                                padding: '10px 22px', borderRadius: '24px', fontSize: '13px', fontWeight: '800',
                                                background: 'rgba(239, 68, 68, 0.15)', color: '#f87171',
                                                border: '1.5px solid rgba(239, 68, 68, 0.45)', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.25)'
                                            }}
                                            title="Emergency pre-kickoff switch if a player is injured during warm-ups"
                                        >
                                            <span>🚨</span>
                                            <span>Warm-Up Injury Switch</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleReopenSquad}
                                            style={{
                                                padding: '10px 24px', borderRadius: '24px', fontSize: '13px', fontWeight: '800',
                                                background: 'rgba(255, 199, 38, 0.15)', color: '#FFC726',
                                                border: '1px solid rgba(255, 199, 38, 0.4)', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                                            }}
                                            title="Reopen pitch to make modifications to starting XI or bench"
                                        >
                                            <span>✏️</span>
                                            <span>Edit / Resubmit Squad</span>
                                        </button>
                                        <div style={{
                                            padding: '10px 20px', borderRadius: '24px', fontSize: '13px', fontWeight: '700',
                                            background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)'
                                        }}>
                                            ✓ Squad Submitted
                                        </div>
                                    </>
                                ) : (
                                    <button onClick={handleSubmitSquad} disabled={selectedStartingXIIds.length !== 11} style={{
                                        padding: '10px 28px', borderRadius: '24px', fontSize: '13px', fontWeight: '800',
                                        background: selectedStartingXIIds.length === 11 ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                        color: selectedStartingXIIds.length === 11 ? '#ffffff' : 'var(--text-muted)',
                                        border: 'none', cursor: selectedStartingXIIds.length === 11 ? 'pointer' : 'not-allowed',
                                        boxShadow: selectedStartingXIIds.length === 11 ? '0 4px 14px rgba(37,99,235,0.3)' : 'none',
                                        transition: 'all 0.2s'
                                    }}>
                                        Submit Matchday Squad ({formation})
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {previewStudent && (
                <StudentProfileDrawer 
                    student={previewStudent} 
                    onClose={() => setPreviewStudent(null)} 
                />
            )}

            {/* Official Team Sheet Modal for Coaches */}
            {activeCountdownMatch && (
                <CountdownSheetModal
                    match={activeCountdownMatch}
                    allPlayers={allPlayers}
                    schools={schools}
                    userRole="coach"
                    onClose={() => setActiveCountdownMatch(null)}
                    onUpdateMatch={(updatedMatch) => {
                        if (onUpdateMatch) onUpdateMatch(updatedMatch);
                        setActiveCountdownMatch(updatedMatch);
                    }}
                    onApplyCorrection={(matchId, correctionData) => {
                        const squadKey = correctionData.teamSide === 'home' ? 'homeSquadSelection' : 'awaySquadSelection';
                        const updatedMatch = {
                            ...activeCountdownMatch,
                            [squadKey]: correctionData.updatedSquad || activeCountdownMatch[squadKey],
                            preKickoffCorrections: [
                                ...(activeCountdownMatch.preKickoffCorrections || []),
                                correctionData
                            ],
                            updatedAt: Date.now()
                        };
                        onUpdateMatch(updatedMatch);
                        setActiveCountdownMatch(updatedMatch);
                    }}
                />
            )}

            {/* Official Matchday Countdown Sheet Modal for Coaches */}
            {activeCountdownScheduleMatch && (
                <MatchdayCountdownSheetModal
                    match={activeCountdownScheduleMatch}
                    userRole="coach"
                    onClose={() => setActiveCountdownScheduleMatch(null)}
                    onUpdateMatch={(updatedMatch) => {
                        if (onUpdateMatch) onUpdateMatch(updatedMatch);
                        setActiveCountdownScheduleMatch(updatedMatch);
                    }}
                />
            )}

            {showSquadUploadModal && (
                <UploadPlayerRosterModal
                    isOpen={showSquadUploadModal}
                    onClose={() => setShowSquadUploadModal(false)}
                    onImportPlayers={(imported) => {
                        if (onImportPlayers) onImportPlayers(imported);
                        setShowSquadUploadModal(false);
                    }}
                    existingPlayers={allPlayers}
                    targetSchoolId={schoolId}
                    targetTeamId={myTeamIds[0] || (selectedMatch ? (isHome ? selectedMatch.homeTeamId : selectedMatch.awayTeamId) : '')}
                    targetYear="2025/2026"
                    teamName={schoolName || 'My School Squad'}
                    isPmc={true}
                />
            )}

            {/* Pre-Match Warm-Up Emergency Injury Amendment Modal */}
            {showWarmupModal && (
                <div
                    onClick={() => setShowWarmupModal(false)}
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 99999, padding: '20px', pointerEvents: 'auto'
                    }}
                >
                    <div
                        className="glass-panel"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '560px', width: '100%', padding: '28px', borderRadius: '20px',
                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                            border: '1.5px solid rgba(239, 68, 68, 0.45)',
                            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
                            display: 'flex', flexDirection: 'column', gap: '18px',
                            position: 'relative', zIndex: 100000, pointerEvents: 'auto'
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '20px' }}>🚨</span>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#ffffff' }}>
                                        Pre-Match Warm-Up Injury Amendment
                                    </h3>
                                </div>
                                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    Replace a starting player injured during warm-ups prior to match kickoff.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowWarmupModal(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Competition Regulation Alert */}
                        <div style={{
                            padding: '12px 14px', borderRadius: '10px',
                            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
                            fontSize: '11.5px', color: '#bfdbfe', lineHeight: 1.5
                        }}>
                            ⚖️ <strong>Competition Regulation:</strong> An emergency replacement made during pre-match warm-ups prior to kickoff does <strong>not</strong> count as one of your allocated in-game substitutions (0/5 used). This amendment is routed directly to the <strong>Match Commissioner</strong> desk for approval before match commencement.
                        </div>

                        {/* Selection Inputs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#f87171', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    ↓ 1. Injured Starting Player (Coming Off)
                                </label>
                                <select
                                    value={warmupInjuredPlayerId}
                                    onChange={e => setWarmupInjuredPlayerId(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        background: 'rgba(0, 0, 0, 0.5)', color: '#ffffff', border: '1.5px solid rgba(239, 68, 68, 0.4)',
                                        fontSize: '13px', fontWeight: '700', outline: 'none', cursor: 'pointer'
                                    }}
                                >
                                    <option value="">-- Select starter injured during warm-ups --</option>
                                    {selectedStartingXIIds.map(pid => {
                                        const p = getPlayerById(pid);
                                        return (
                                            <option key={pid} value={pid} style={{ background: '#0f172a' }}>
                                                #{p?.jerseyNumber != null ? p.jerseyNumber : '—'} {p?.name} ({p?.position || 'Starter'})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#4ade80', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    ↑ 2. Replacement Player (Promoted to Starting XI)
                                </label>
                                <select
                                    value={warmupReplacementPlayerId}
                                    onChange={e => setWarmupReplacementPlayerId(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        background: 'rgba(0, 0, 0, 0.5)', color: '#ffffff', border: '1.5px solid rgba(34, 197, 94, 0.4)',
                                        fontSize: '13px', fontWeight: '700', outline: 'none', cursor: 'pointer'
                                    }}
                                >
                                    <option value="">-- Select replacement player from bench / roster --</option>
                                    <optgroup label="Named Substitutes (Bench)" style={{ background: '#0f172a' }}>
                                        {benchPlayers.map(pid => {
                                            const p = getPlayerById(pid);
                                            return (
                                                <option key={pid} value={pid} style={{ background: '#0f172a' }}>
                                                    #{p?.jerseyNumber != null ? p.jerseyNumber : '—'} {p?.name} ({p?.position || 'Substitute'})
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                    <optgroup label="Eligible Squad Players" style={{ background: '#0f172a' }}>
                                        {availablePlayers.filter(p => !benchPlayers.includes(p.id)).map(p => (
                                            <option key={p.id} value={p.id} style={{ background: '#0f172a' }}>
                                                #{p.jerseyNumber != null ? p.jerseyNumber : '—'} {p.name} ({p.position || 'Roster'})
                                            </option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                    Warm-Up Injury Medical / Tactical Note:
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Shaquon Richards sustained a hamstring pull during warm-up sprint drills. Noah Bishop promoted to Starting XI."
                                    value={warmupInjuryReason}
                                    onChange={e => setWarmupInjuryReason(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                                        background: 'rgba(0, 0, 0, 0.4)', color: '#ffffff', border: '1px solid var(--border)',
                                        fontSize: '12px', outline: 'none', resize: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
                            <button
                                type="button"
                                onClick={() => setShowWarmupModal(false)}
                                style={{
                                    padding: '10px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: '700',
                                    background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!warmupInjuredPlayerId || !warmupReplacementPlayerId}
                                onClick={handleSubmitWarmupAmendment}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px', fontSize: '12px', fontWeight: '900',
                                    background: (warmupInjuredPlayerId && warmupReplacementPlayerId) ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(255, 255, 255, 0.08)',
                                    color: (warmupInjuredPlayerId && warmupReplacementPlayerId) ? '#ffffff' : 'var(--text-muted)',
                                    border: 'none', cursor: (warmupInjuredPlayerId && warmupReplacementPlayerId) ? 'pointer' : 'not-allowed',
                                    boxShadow: (warmupInjuredPlayerId && warmupReplacementPlayerId) ? '0 4px 14px rgba(239, 68, 68, 0.4)' : 'none'
                                }}
                            >
                                Submit Warm-Up Amendment to Commissioner
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
