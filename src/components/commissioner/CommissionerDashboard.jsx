import { useState, useMemo } from 'react';
import LeagueTable from '../LeagueTable';
import KnockoutBrackets from '../KnockoutBrackets';
import CountdownSheetModal from '../match/CountdownSheetModal';
import MatchdayCountdownSheetModal from '../match/MatchdayCountdownSheetModal';
import JerseyIcon from '../JerseyIcon';
import { exportPMCMatchPacket, pushMatchToPMC } from '../../utils/pmcSyncEngine';
import { resolvePlayer, resolvePlayerName } from '../../utils/playerResolver';

const DEFAULT_VENUES = [
    { id: 'Wildey Turf', name: 'Wildey Turf Ground' },
    { id: 'Harrison College', name: 'Harrison College Ground' },
    { id: 'Combermere Ground', name: 'Combermere Playing Field' },
    { id: 'Weymouth Playing Field', name: 'Weymouth Turf' }
];

const DEFAULT_OFFICIALS = [
    { id: 'ref-1', name: 'Gavin Corbin', role: 'Referee' },
    { id: 'ref-2', name: 'Kristian Gilkes', role: 'Referee' },
    { id: 'ref-3', name: 'Adrian Skeete', role: 'Referee' },
    { id: 'ref-4', name: 'Mark Forde', role: 'Referee' },
    { id: 'ref-5', name: 'Sherwin Johnson', role: 'Referee' },
    { id: 'comm-1', name: 'Aundrea', role: 'Match Operator' },
    { id: 'comm-2', name: 'Wren', role: 'Senior Match Coordinator' }
];

export default function CommissionerDashboard({ 
    matches = [], 
    schools = [], 
    allTeams = [], 
    allStudents = [], 
    onUpdateMatch, 
    onAddMatches, 
    readOnly = false,
    selectedTournament = 'PMC',
    onSelectTournament,
    currentOfficial = null,
    selectedYear = '2026-2027',
    onSelectSchool,
    onOpenQuickTest,
    onLogout
}) {
    const isPMC = selectedTournament === 'PMC';
    const [mainTab, setMainTab] = useState(() => isPMC ? 'live_feed' : 'approvals'); // 'live_feed' | 'approvals' | 'operations' | 'scheduling' | 'standings' | 'knockouts'
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeCountdownMatch, setActiveCountdownMatch] = useState(null);
    const [activeCountdownScheduleMatch, setActiveCountdownScheduleMatch] = useState(null);

    // Reactively bind selectedMatch and activeCountdownMatch to the live matches prop
    const activeSelectedMatch = useMemo(() => {
        if (!selectedMatch) return null;
        return (matches || []).find(m => m.id === selectedMatch.id) || selectedMatch;
    }, [matches, selectedMatch]);

    const currentActiveCountdownMatch = useMemo(() => {
        if (!activeCountdownMatch) return null;
        return (matches || []).find(m => m.id === activeCountdownMatch.id) || activeCountdownMatch;
    }, [matches, activeCountdownMatch]);

    // Live Feed & Timeline States
    const [activeMatchId, setActiveMatchId] = useState(() => {
        const live = (matches || []).find(m => m.status === 'live');
        if (live) return live.id;
        return matches?.[0]?.id || null;
    });

    const activeMatch = useMemo(() => {
        return (matches || []).find(m => m.id === activeMatchId) || matches?.[0] || null;
    }, [matches, activeMatchId]);

    const [timelineFilter, setTimelineFilter] = useState('all'); // 'all' | 'goal_shot' | 'card_foul' | 'sub' | 'setpiece'
    const [timelineTeamFilter, setTimelineTeamFilter] = useState('all'); // 'all' | 'home' | 'away'
    const [timelineSortOrder, setTimelineSortOrder] = useState('newest'); // 'newest' | 'chronological'
    
    // Commissioner Approval Form States
    const [incidentRating, setIncidentRating] = useState('1'); // 1 = peaceful, 5 = severe incidents
    const [generalRemarks, setGeneralRemarks] = useState('');
    const [commissionerSignature, setCommissionerSignature] = useState(() => currentOfficial?.name || '');
    const [approvalSuccess, setApprovalSuccess] = useState(false);

    // Matchday Operations & Substitutions States
    const [subMinuteOverrides, setSubMinuteOverrides] = useState({});
    const [opSuccessToast, setOpSuccessToast] = useState(null);

    // Match Scheduling Tab States
    const [schedulingMode, setSchedulingMode] = useState('generator'); // 'generator' | 'manual'
    const [selectedDivision, setSelectedDivision] = useState('U14');
    const [matchdayTerm, setMatchdayTerm] = useState('Matchday 1');
    const [selectedVenue, setSelectedVenue] = useState(DEFAULT_VENUES[0].id);
    const [generationSuccess, setGenerationSuccess] = useState(false);

    // Manual Scheduler States
    const [manualHomeTeamId, setManualHomeTeamId] = useState('');
    const [manualAwayTeamId, setManualAwayTeamId] = useState('');
    const [manualDate, setManualDate] = useState('2026-07-15');
    const [manualReferee, setManualReferee] = useState(DEFAULT_OFFICIALS[0].name);
    const [manualCommissioner, setManualCommissioner] = useState(DEFAULT_OFFICIALS[DEFAULT_OFFICIALS.length - 1].name);
    const [manualGender, setManualGender] = useState('Boy');
    const [manualSuccess, setManualSuccess] = useState(false);

    // Get matches waiting for Commissioner Approval (refereed or unapproved completed matches)
    const pendingApprovalMatches = useMemo(() => {
        return (matches || []).filter(m => m.status === 'refereed' || (m.status === 'completed' && !m.commissionerReport));
    }, [matches]);

    // Get currently scheduled matches (upcoming)
    const upcomingScheduledMatches = useMemo(() => {
        return matches.filter(m => m.status === 'scheduled');
    }, [matches]);

    // Matchday Operations: Pending Pre-Match Warm-Up Injury Amendments
    const pendingWarmupAmendments = useMemo(() => {
        const list = [];
        (matches || []).forEach(match => {
            (match.warmupAmendments || []).forEach(amendment => {
                if (amendment.status === 'pending_commissioner' || amendment.status === 'pending') {
                    list.push({ ...amendment, match });
                }
            });
        });
        return list;
    }, [matches]);

    const historicalWarmupAmendments = useMemo(() => {
        const list = [];
        (matches || []).forEach(match => {
            (match.warmupAmendments || []).forEach(amendment => {
                if (amendment.status === 'approved' || amendment.status === 'rejected') {
                    list.push({ ...amendment, match });
                }
            });
        });
        return list;
    }, [matches]);

    // Matchday Operations: Pending In-Match Substitution Requests
    const pendingSubstitutions = useMemo(() => {
        const list = [];
        (matches || []).forEach(match => {
            (match.substitutionRequests || []).forEach(req => {
                if (req.status === 'pending') {
                    list.push({ ...req, match });
                }
            });
        });
        return list;
    }, [matches]);

    const historicalSubstitutions = useMemo(() => {
        const list = [];
        (matches || []).forEach(match => {
            (match.substitutionRequests || []).forEach(req => {
                if (req.status === 'approved' || req.status === 'rejected') {
                    list.push({ ...req, match });
                }
            });
        });
        return list;
    }, [matches]);

    const totalPendingOps = pendingWarmupAmendments.length + pendingSubstitutions.length;

    // Commissioner Approval Handler for Pre-Match Warm-Up Injury Switch
    const handleApproveWarmupAmendment = (match, amendmentId) => {
        const amendment = (match.warmupAmendments || []).find(a => a.id === amendmentId);
        if (!amendment) return;

        const isHomeTeam = amendment.isHome ?? (
            amendment.teamId === match.homeTeamId ||
            String(match.homeTeamId || '').toLowerCase().includes(String(amendment.teamId || '').toLowerCase().replace('-team-pmc', ''))
        );

        const squadKey = isHomeTeam ? 'homeSquadSelection' : 'awaySquadSelection';
        const currentSquad = match[squadKey] || { startingXI: [], benchPlayers: [] };

        const startingXI = Array.isArray(currentSquad.startingXI) ? [...currentSquad.startingXI] : [];
        let benchPlayers = Array.isArray(currentSquad.benchPlayers) ? [...currentSquad.benchPlayers] : [];

        // Replace playerOffId with playerOnId in Starting XI
        const offIdx = startingXI.findIndex(id => String(id) === String(amendment.playerOffId));
        if (offIdx !== -1) {
            startingXI[offIdx] = amendment.playerOnId;
        } else if (startingXI.length < 11) {
            startingXI.push(amendment.playerOnId);
        }

        // Remove playerOnId from bench, add playerOffId to bench/reserve
        benchPlayers = benchPlayers.filter(id => String(id) !== String(amendment.playerOnId));
        if (!benchPlayers.some(id => String(id) === String(amendment.playerOffId))) {
            benchPlayers.push(amendment.playerOffId);
        }

        // Update amendment status
        const updatedWarmupAmendments = (match.warmupAmendments || []).map(a => 
            a.id === amendmentId 
                ? { 
                    ...a, 
                    status: 'approved', 
                    approvedAt: new Date().toISOString(), 
                    approvedBy: isPMC ? 'Match Coordinator' : 'Match Commissioner' 
                  } 
                : a
        );

        const updatedMatch = {
            ...match,
            [squadKey]: {
                ...currentSquad,
                startingXI,
                benchPlayers
            },
            warmupAmendments: updatedWarmupAmendments
        };

        if (onUpdateMatch) onUpdateMatch(updatedMatch);

        setOpSuccessToast(`Approved Warm-Up Injury Switch: #${amendment.playerOnJersey} ${amendment.playerOnName} promoted to Starting XI for injured #${amendment.playerOffJersey} ${amendment.playerOffName}. 0 match substitutions registered.`);
        setTimeout(() => setOpSuccessToast(null), 5000);
    };

    const handleRejectWarmupAmendment = (match, amendmentId) => {
        const amendment = (match.warmupAmendments || []).find(a => a.id === amendmentId);
        const updatedWarmupAmendments = (match.warmupAmendments || []).map(a => 
            a.id === amendmentId 
                ? { 
                    ...a, 
                    status: 'rejected', 
                    rejectedAt: new Date().toISOString(), 
                    rejectedBy: isPMC ? 'Match Coordinator' : 'Match Commissioner' 
                  } 
                : a
        );

        if (onUpdateMatch) {
            onUpdateMatch({
                ...match,
                warmupAmendments: updatedWarmupAmendments
            });
        }

        setOpSuccessToast(`Declined warm-up amendment for ${amendment?.teamName || 'Team'}`);
        setTimeout(() => setOpSuccessToast(null), 4000);
    };

    // Commissioner Approval Handler for In-Match Substitutions
    const handleApproveSubstitution = (match, reqId, directMin) => {
        const req = (match.substitutionRequests || []).find(r => r.id === reqId);
        if (!req) return;

        const overrideMin = directMin !== undefined ? directMin : subMinuteOverrides[reqId];
        const minuteVal = (overrideMin !== undefined && overrideMin !== '') 
            ? parseInt(overrideMin, 10) 
            : (req.minute || match.matchClock || (match.currentHalf === '2H' ? 60 : 25));

        const updatedRequests = (match.substitutionRequests || []).map(r => 
            r.id === reqId 
                ? { 
                    ...r, 
                    status: 'approved', 
                    approvedAt: new Date().toISOString(), 
                    approvedBy: isPMC ? 'Match Coordinator' : 'Match Commissioner', 
                    minute: minuteVal 
                  } 
                : r
        );

        const isMatchHome = req.teamSide === 'home' || req.teamId === match.homeTeamId || String(match.homeTeamId || '').toLowerCase().includes(String(req.teamId || '').toLowerCase().replace('-team-pmc', ''));

        const squadKey = isMatchHome ? 'homeSquadSelection' : 'awaySquadSelection';
        const currentSquad = match[squadKey] || {
            startingXI: (isMatchHome ? match.homePlayers : match.awayPlayers || []).slice(0, 11),
            benchPlayers: (isMatchHome ? match.homePlayers : match.awayPlayers || []).slice(11)
        };

        const newXI = (currentSquad.startingXI || []).map(pid => pid === req.playerOff ? req.playerOn : pid);
        const newBench = [...(currentSquad.benchPlayers || []).filter(pid => pid !== req.playerOn && pid !== req.playerOff), req.playerOff];

        const offPlayer = (allStudents || []).find(p => p.id === req.playerOff);
        const onPlayer = (allStudents || []).find(p => p.id === req.playerOn);
        const offName = offPlayer?.name || resolvePlayerName(req.playerOff, allStudents);
        const onName = onPlayer?.name || resolvePlayerName(req.playerOn, allStudents);

        const subTimelineEvent = {
            id: `sub-evt-${Date.now()}`,
            type: 'substitution',
            minute: minuteVal,
            period: minuteVal <= 45 ? '1H' : '2H',
            team: isMatchHome ? 'home' : 'away',
            teamId: req.teamId,
            playerOffId: req.playerOff,
            playerOffName: offName,
            playerOnId: req.playerOn,
            playerOnName: onName,
            timestamp: Date.now()
        };

        const newEvent = {
            id: `event-${Date.now()}`,
            type: 'substitution',
            teamId: req.teamId,
            playerOff: req.playerOff,
            playerOn: req.playerOn,
            playerOffName: offName,
            playerOnName: onName,
            timestamp: Date.now(),
            minute: minuteVal
        };

        const updatedMatch = {
            ...match,
            substitutionRequests: updatedRequests,
            events: [...(match.events || []), newEvent],
            timeline: [...(match.timeline || []), subTimelineEvent],
            [squadKey]: {
                ...currentSquad,
                startingXI: newXI,
                benchPlayers: newBench
            }
        };

        if (onUpdateMatch) onUpdateMatch(updatedMatch);

        setOpSuccessToast(`Confirmed In-Match Substitution at ${minuteVal}': ${onName} ON for ${offName} OFF`);
        setTimeout(() => setOpSuccessToast(null), 5000);
    };

    const handleRejectSubstitution = (match, reqId) => {
        const updatedRequests = (match.substitutionRequests || []).map(r => 
            r.id === reqId 
                ? { 
                    ...r, 
                    status: 'rejected', 
                    rejectedAt: new Date().toISOString(), 
                    rejectedBy: isPMC ? 'Match Coordinator' : 'Match Commissioner' 
                  } 
                : r
        );

        if (onUpdateMatch) {
            onUpdateMatch({
                ...match,
                substitutionRequests: updatedRequests
            });
        }

        setOpSuccessToast(`Declined substitution request.`);
        setTimeout(() => setOpSuccessToast(null), 4000);
    };

    // Compute Discrepancies
    const discrepancies = useMemo(() => {
        if (!activeSelectedMatch) return [];
        const issues = [];
        const statTimeline = activeSelectedMatch.timeline || [];
        const refTimeline = activeSelectedMatch.refereeLiveState?.timeline || [];

        const isGoalEvent = (e) => String(e?.type || '').toLowerCase().trim() === 'goal';
        const isYellowEvent = (e) => {
            const t = String(e?.type || '').toLowerCase().replace(/[\s_-]/g, '');
            return t === 'yellowcard' || t === 'yellow';
        };
        const isRedEvent = (e) => {
            const t = String(e?.type || '').toLowerCase().replace(/[\s_-]/g, '');
            return t === 'redcard' || t === 'red';
        };

        const statGoals = statTimeline.filter(isGoalEvent);
        const refGoals = refTimeline.filter(isGoalEvent);
        if (statGoals.length !== refGoals.length && refGoals.length > 0) {
            issues.push(`Goal count mismatch: Statistician logged ${statGoals.length}, Referee logged ${refGoals.length}.`);
        } else if (statGoals.length > 0 && refGoals.length > 0) {
            const statScorers = statGoals.map(g => String(g.playerId || '')).sort().join(',');
            const refScorers = refGoals.map(g => String(g.playerId || '')).sort().join(',');
            if (statScorers !== refScorers) {
                issues.push(`Goal scorers mismatch between Statistician and Referee logs.`);
            }
        }

        const statYellow = statTimeline.filter(isYellowEvent);
        const refYellow = refTimeline.filter(isYellowEvent);
        if (statYellow.length !== refYellow.length && refYellow.length > 0) {
            issues.push(`Yellow Card count mismatch: Statistician logged ${statYellow.length}, Referee logged ${refYellow.length}.`);
        }

        const statRed = statTimeline.filter(isRedEvent);
        const refRed = refTimeline.filter(isRedEvent);
        if (statRed.length !== refRed.length && refRed.length > 0) {
            issues.push(`Red Card count mismatch: Statistician logged ${statRed.length}, Referee logged ${refRed.length}.`);
        }

        return issues;
    }, [activeSelectedMatch]);

    const getSchoolName = (schoolId, matchObj) => {
        if (!schoolId && !matchObj) return 'Unknown Team';
        const sc = (schools || []).find(s => s.id === schoolId || s.rawId === schoolId);
        if (sc) return sc.name;
        if (matchObj) {
            if (matchObj.homeTeamId === schoolId && matchObj.homeTeam) return matchObj.homeTeam;
            if (matchObj.awayTeamId === schoolId && matchObj.awayTeam) return matchObj.awayTeam;
        }
        return schoolId || 'Unknown Team';
    };

    const handleSelectMatch = (match) => {
        setSelectedMatch(match);
        setIncidentRating('1');
        setGeneralRemarks('');
        setCommissionerSignature('');
        setApprovalSuccess(false);
        setIsExpanded(false);
    };

    // Auto round-robin fixture generator
    const handleGenerateFixtures = () => {
        // Find teams matching target division
        const divisionTeams = allTeams.filter(t => t.name === selectedDivision);

        if (divisionTeams.length < 2) {
            alert(`Not enough teams in division ${selectedDivision} to generate fixtures! Need at least 2.`);
            return;
        }

        const referees = DEFAULT_OFFICIALS.filter(o => o.role === 'Referee');
        const commissioners = DEFAULT_OFFICIALS.filter(o => o.role === 'Commissioner');

        const newFixtures = [];
        let matchIndex = 1;
        for (let i = 0; i < divisionTeams.length; i++) {
            for (let j = i + 1; j < divisionTeams.length; j++) {
                const home = divisionTeams[i];
                const away = divisionTeams[j];

                const ref = referees[(i + j) % referees.length].name;
                const comm = commissioners[(i + j) % commissioners.length].name;

                newFixtures.push({
                    id: `scheduled-${Date.now()}-${matchIndex++}`,
                    homeTeamId: home.id,
                    awayTeamId: away.id,
                    ageGroup: selectedDivision,
                    matchday: matchdayTerm,
                    venue: selectedVenue,
                    referee: ref,
                    commissioner: comm,
                    status: 'scheduled',
                    homeScore: 0,
                    awayScore: 0,
                    playerStats: {},
                    timeline: [],
                    date: new Date(Date.now() + 86400000 * matchIndex).toISOString(), // future dates
                });
            }
        }

        onAddMatches(newFixtures);
        setGenerationSuccess(true);
        setTimeout(() => setGenerationSuccess(false), 3000);
    };

    // Manual single match setup
    const handleManualSchedule = (e) => {
        e.preventDefault();
        if (!manualHomeTeamId || !manualAwayTeamId || manualHomeTeamId === manualAwayTeamId) {
            alert('Please select two different teams!');
            return;
        }

        const matchId = `scheduled-manual-${Date.now()}`;
        const newMatch = {
            id: matchId,
            homeTeamId: manualHomeTeamId,
            awayTeamId: manualAwayTeamId,
            ageGroup: selectedDivision,
            matchday: matchdayTerm,
            venue: selectedVenue,
            referee: manualReferee,
            commissioner: manualCommissioner,
            status: 'scheduled',
            homeScore: 0,
            awayScore: 0,
            playerStats: {},
            timeline: [],
            date: new Date(manualDate).toISOString(),
        };

        onAddMatches([newMatch]);
        setManualSuccess(true);
        // Reset selections
        setManualHomeTeamId('');
        setManualAwayTeamId('');
        setTimeout(() => setManualSuccess(false), 3000);
    };

    const handleApproveMatch = async (e) => {
        e.preventDefault();
        if (!commissionerSignature.trim()) return;

        const updatedMatch = {
            ...activeSelectedMatch,
            status: 'approved',
            commissionerReport: {
                incidentRating: parseInt(incidentRating),
                generalRemarks,
                commissionerSignature,
                approvedAt: new Date().toISOString()
            }
        };

        onUpdateMatch(updatedMatch);

        // Export to Prime Minister's Cup Portal
        const pmcPacket = exportPMCMatchPacket(updatedMatch, allStudents, allTeams, schools);
        if (pmcPacket) {
            await pushMatchToPMC(pmcPacket);
        }

        setApprovalSuccess(true);
        setSelectedMatch(null); // return to list view
        setIsExpanded(false);
        setTimeout(() => setApprovalSuccess(false), 3000);
    };

    // filter teams for custom scheduling selection
    const manualHomeTeamOptions = useMemo(() => {
        return allTeams.filter(t => t.name === selectedDivision && t.id !== manualAwayTeamId);
    }, [allTeams, selectedDivision, manualAwayTeamId]);

    const manualAwayTeamOptions = useMemo(() => {
        return allTeams.filter(t => t.name === selectedDivision && t.id !== manualHomeTeamId);
    }, [allTeams, selectedDivision, manualHomeTeamId]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minHeight: '100%' }}>
            
            {/* Top Identity Header */}
            <div className="glass-panel" style={{
                padding: '16px 22px', borderRadius: '12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '14px',
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
                border: '1px solid rgba(255,255,255,0.08)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '10px',
                        background: isPMC ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', color: '#ffffff'
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        </svg>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                                fontSize: '10px', fontWeight: '800', letterSpacing: '0.08em',
                                textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px',
                                background: isPMC ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                color: isPMC ? '#fca5a5' : '#38bdf8',
                                border: isPMC ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                            }}>
                                {isPMC ? "Prime Minister's Cup · Official Match Control" : "National Schools League · Testing Sandbox"}
                            </span>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                fontSize: '11px', fontWeight: '700', color: isPMC ? '#4ade80' : '#38bdf8'
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isPMC ? '#22c55e' : '#38bdf8', boxShadow: isPMC ? '0 0 6px #22c55e' : '0 0 6px #38bdf8' }} />
                                {isPMC ? 'Real-Time Cloud Sync Active (Production)' : '🧪 Testing Sandbox (Firewalled from Cloud API)'}
                            </span>
                        </div>
                        <h2 style={{ margin: '3px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#ffffff' }}>
                            {isPMC ? 'Match Coordinator & Operator Desk' : 'Match Commissioner Sandbox Operations'}
                        </h2>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    {onSelectTournament && (
                        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <button
                                type="button"
                                onClick={() => onSelectTournament('PMC')}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800',
                                    background: isPMC ? '#FFC726' : 'transparent',
                                    color: isPMC ? '#00267F' : 'rgba(255,255,255,0.6)',
                                    border: 'none', cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                🏆 PMC Cup
                            </button>
                            <button
                                type="button"
                                onClick={() => onSelectTournament('NSSL')}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800',
                                    background: !isPMC ? 'rgba(56,189,248,0.2)' : 'transparent',
                                    color: !isPMC ? '#38bdf8' : 'rgba(255,255,255,0.6)',
                                    border: !isPMC ? '1px solid rgba(56,189,248,0.4)' : 'none',
                                    cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                🧪 Schools League
                            </button>
                        </div>
                    )}

                    {!isPMC && onOpenQuickTest && (
                        <button
                            type="button"
                            onClick={onOpenQuickTest}
                            style={{
                                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#ffffff',
                                border: '1px solid rgba(56,189,248,0.4)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                boxShadow: '0 2px 8px rgba(2,132,199,0.3)'
                            }}
                        >
                            + Add Test Fixture
                        </button>
                    )}

                    {currentOfficial && (
                        <div style={{
                            padding: '6px 14px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
                        }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>
                                {currentOfficial.name}
                            </span>
                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                {currentOfficial.title || currentOfficial.role || 'Senior Match Coordinator'} · {currentOfficial.assignedVenue || 'Friendship, St. Michael'}
                            </span>
                        </div>
                    )}
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            style={{
                                padding: '8px 16px', borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#f87171', fontSize: '12px', fontWeight: '700',
                                cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <span>Exit Control Desk</span>
                            <span>➔</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tab switch bar */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: 'var(--border)', paddingBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {isPMC && (
                    <button
                        onClick={() => setMainTab('live_feed')}
                        style={{
                            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '800',
                            background: mainTab === 'live_feed' ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
                            color: mainTab === 'live_feed' ? '#f87171' : 'var(--text-secondary)',
                            border: mainTab === 'live_feed' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
                            cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                        <span>Live Match Feed &amp; Timeline</span>
                        {totalPendingOps > 0 && (
                            <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: '800' }}>
                                {totalPendingOps}
                            </span>
                        )}
                    </button>
                )}

                <button
                    onClick={() => setMainTab('operations')}
                    style={{
                        padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                        background: mainTab === 'operations' ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
                        color: mainTab === 'operations' ? '#f87171' : 'var(--text-secondary)',
                        border: mainTab === 'operations' ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <span>Touchline Subs &amp; Operations</span>
                    {totalPendingOps > 0 && (
                        <span style={{
                            background: '#ef4444', color: '#ffffff',
                            borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: '800'
                        }}>
                            {totalPendingOps}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setMainTab('approvals')}
                    style={{
                        padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                        background: mainTab === 'approvals' ? 'rgba(37,99,235,0.18)' : 'transparent',
                        color: mainTab === 'approvals' ? 'var(--primary-light)' : 'var(--text-secondary)',
                        border: mainTab === 'approvals' ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <span>{isPMC ? 'Match Verification & Sign-Off' : 'Match Approvals & Verification'}</span>
                    {pendingApprovalMatches.length > 0 && (
                        <span style={{
                            background: 'var(--primary)', color: '#ffffff',
                            borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: '800'
                        }}>
                            {pendingApprovalMatches.length}
                        </span>
                    )}
                </button>

                {!isPMC && (
                    <button
                        onClick={() => setMainTab('scheduling')}
                        style={{
                            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                            background: mainTab === 'scheduling' ? 'rgba(37,99,235,0.18)' : 'transparent',
                            color: mainTab === 'scheduling' ? 'var(--primary-light)' : 'var(--text-secondary)',
                            border: mainTab === 'scheduling' ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                            cursor: 'pointer', transition: 'all 0.2s', outline: 'none'
                        }}
                    >
                        Match Setup &amp; Scheduling
                    </button>
                )}

                <button
                    onClick={() => setMainTab('standings')}
                    style={{
                        padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                        background: mainTab === 'standings' ? 'rgba(37,99,235,0.18)' : 'transparent',
                        color: mainTab === 'standings' ? 'var(--primary-light)' : 'var(--text-secondary)',
                        border: mainTab === 'standings' ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.2s', outline: 'none'
                    }}
                >
                    {isPMC ? 'PMC Standings' : 'League Standings'}
                </button>

                {!isPMC && (
                    <button
                        onClick={() => setMainTab('knockouts')}
                        style={{
                            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                            background: mainTab === 'knockouts' ? 'rgba(37,99,235,0.18)' : 'transparent',
                            color: mainTab === 'knockouts' ? 'var(--primary-light)' : 'var(--text-secondary)',
                            border: mainTab === 'knockouts' ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                            cursor: 'pointer', transition: 'all 0.2s', outline: 'none'
                        }}
                    >
                        Knockout Setup
                    </button>
                )}

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => {
                            const target = activeMatch || (matches || []).find(m => m.status === 'upcoming' || m.status === 'scheduled' || m.homeSquadSelection) || (matches || [])[0];
                            setActiveCountdownMatch(target);
                        }}
                        title="View Official Starting XI, Substitutes & Verified Roster Sign-Off"
                        style={{
                            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800',
                            background: 'rgba(37, 99, 235, 0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(37, 99, 235, 0.35)',
                            cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        📋 Official Team Sheet
                    </button>
                    <button
                        onClick={() => {
                            const target = activeMatch || (matches || []).find(m => m.status === 'upcoming' || m.status === 'scheduled' || m.homeSquadSelection) || (matches || [])[0];
                            setActiveCountdownScheduleMatch(target);
                        }}
                        title="View & Edit Operational Countdown Protocol & Timetable"
                        style={{
                            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800',
                            background: 'rgba(255, 199, 38, 0.15)',
                            color: '#FFC726',
                            border: '1px solid rgba(255, 199, 38, 0.35)',
                            cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        ⏱️ Matchday Countdown Sheet
                    </button>
                </div>
            </div>

            {/* TAB CONTENT: Live Feed & Timeline */}
            {mainTab === 'live_feed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                    {/* Fixture Selector Strip */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        flexShrink: 0,
                        width: '100%'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{
                                    fontSize: '11.5px',
                                    fontWeight: '800',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: '#cbd5e1'
                                }}>
                                    {isPMC ? "Select Match to Monitor & Coordinate (Matchday 1 Opening)" : "Select Match Fixture"}
                                </span>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    color: '#e2e8f0',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255, 255, 255, 0.12)'
                                }}>
                                    {(matches || []).length} Match{((matches || []).length === 1 ? '' : 'es')}
                                </span>
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                Click card to load live pitch feeds &amp; substitution actions
                            </span>
                        </div>

                        {/* Scrollable match cards row */}
                        <div style={{
                            display: 'flex',
                            gap: '14px',
                            overflowX: 'auto',
                            padding: '2px 2px 10px 2px',
                            scrollbarWidth: 'thin',
                            flexShrink: 0,
                            minHeight: '110px'
                        }}>
                            {(matches || []).map(m => {
                                const isSelected = (activeMatch?.id === m.id);
                                const isLive = m.status === 'live';
                                const isRef = m.status === 'refereed';
                                const isApproved = m.status === 'approved';
                                const hasPendingSub = (m.substitutionRequests || []).some(r => r.status === 'pending');
                                const hasPendingWarmup = (m.warmupAmendments || []).some(a => a.status === 'pending' || a.status === 'pending_commissioner');
                                const homeN = m.homeTeam || getSchoolName(m.homeTeamId, m);
                                const awayN = m.awayTeam || getSchoolName(m.awayTeamId, m);

                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setActiveMatchId(m.id)}
                                        style={{
                                            padding: '14px 18px',
                                            borderRadius: '12px',
                                            minWidth: '310px',
                                            maxWidth: '360px',
                                            minHeight: '100px',
                                            flexShrink: 0,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            background: isSelected 
                                                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(30, 41, 59, 0.95) 100%)' 
                                                : 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.8) 100%)',
                                            border: isSelected 
                                                ? '2px solid #ef4444' 
                                                : '1.5px solid rgba(255, 255, 255, 0.16)',
                                            boxShadow: isSelected 
                                                ? '0 6px 20px rgba(239, 68, 68, 0.35), 0 0 0 1px rgba(239, 68, 68, 0.5)' 
                                                : '0 4px 14px rgba(0, 0, 0, 0.35)',
                                            position: 'relative',
                                            outline: 'none'
                                        }}
                                    >
                                        {/* Top Row: Matchday info + Status Pill */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                color: isSelected ? '#fca5a5' : '#cbd5e1',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em'
                                            }}>
                                                {m.matchday || 'PMC Matchday 1'} {m.group ? `· Grp ${m.group}` : ''}
                                            </span>

                                            {isLive ? (
                                                <span style={{
                                                    fontSize: '10.5px',
                                                    fontWeight: '900',
                                                    color: '#ffffff',
                                                    background: '#ef4444',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.7)'
                                                }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffffff' }} />
                                                    LIVE {m.currentHalf || '1H'} {m.matchTime || (m.matchClock ? m.matchClock + "'" : '')}
                                                </span>
                                            ) : isRef ? (
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: '800',
                                                    color: '#d8b4fe',
                                                    background: 'rgba(168, 85, 247, 0.25)',
                                                    border: '1px solid rgba(168, 85, 247, 0.4)',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px'
                                                }}>
                                                    FT (Awaiting Sign-off)
                                                </span>
                                            ) : isApproved ? (
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: '800',
                                                    color: '#4ade80',
                                                    background: 'rgba(34, 197, 94, 0.2)',
                                                    border: '1px solid rgba(34, 197, 94, 0.35)',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px'
                                                }}>
                                                    Certified
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: '800',
                                                    color: '#38bdf8',
                                                    background: 'rgba(56, 189, 248, 0.15)',
                                                    border: '1px solid rgba(56, 189, 248, 0.3)',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <span>{m.time || '19:00'}</span>
                                                </span>
                                            )}
                                        </div>

                                        {/* Middle Row: Clubs & Score */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '800',
                                                    color: '#ffffff',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {homeN}
                                                </div>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '800',
                                                    color: '#ffffff',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {awayN}
                                                </div>
                                            </div>

                                            {/* Score Box */}
                                            <div style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(0, 0, 0, 0.65)',
                                                border: isSelected ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.14)',
                                                borderRadius: '8px',
                                                padding: '4px 12px',
                                                minWidth: '54px',
                                                flexShrink: 0
                                            }}>
                                                <span style={{
                                                    fontSize: '16px',
                                                    fontWeight: '900',
                                                    color: isLive ? '#4ade80' : '#ffffff',
                                                    letterSpacing: '2px'
                                                }}>
                                                    {m.homeScore ?? 0} : {m.awayScore ?? 0}
                                                </span>
                                                <span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                    {isLive ? 'Score' : (isRef || isApproved ? 'Final' : 'K/O')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Bottom Row: Venue & Pending Action Alerts */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '6px' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                color: '#94a3b8',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                <span>{m.venue || 'Friendship, St. Michael'}</span>
                                            </span>

                                            {(hasPendingSub || hasPendingWarmup) ? (
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: '800',
                                                    color: '#f59e0b',
                                                    background: 'rgba(245, 158, 11, 0.2)',
                                                    border: '1px solid rgba(245, 158, 11, 0.4)',
                                                    padding: '2px 7px',
                                                    borderRadius: '6px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    flexShrink: 0
                                                }}>
                                                    <span>Action Required ({ (hasPendingSub ? 1 : 0) + (hasPendingWarmup ? 1 : 0) })</span>
                                                </span>
                                            ) : isSelected ? (
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: '800',
                                                    color: '#fca5a5',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    <span>●</span> Active Feed
                                                </span>
                                            ) : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Active Match Scoreboard Card */}
                    {activeMatch && (
                        <div className="glass-panel" style={{
                            padding: '22px 28px', borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.7))',
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', flexDirection: 'column', gap: '16px'
                        }}>
                            {/* Meta Top Row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '11px', fontWeight: '800', color: '#38bdf8',
                                        background: 'rgba(56, 189, 248, 0.15)', padding: '3px 10px', borderRadius: '6px'
                                    }}>
                                        {activeMatch.ageGroup === 'PMC' ? "Prime Minister's Cup 2026" : `${activeMatch.ageGroup || 'NSSL'} Division`}
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {activeMatch.venue || 'Friendship, St. Michael'} · {activeMatch.date || 'Mon 07 Sep 2026'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Referee: <strong style={{ color: '#ffffff' }}>{activeMatch.referee || 'Michael Beckles'}</strong>
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Coordinator: <strong style={{ color: '#ffffff' }}>{activeMatch.commissioner || currentOfficial?.name || 'Wren'}</strong>
                                    </span>
                                </div>
                            </div>

                            {/* Scoreboard Main Row */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                                alignItems: 'center', gap: '20px', padding: '10px 0'
                            }}>
                                {/* Home Club */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>
                                            {activeMatch.homeTeam || getSchoolName(activeMatch.homeTeamId, activeMatch)}
                                        </h2>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#4ade80' }}>HOME CLUB</span>
                                    </div>
                                </div>

                                {/* Score & Clock Badge */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        fontSize: '36px', fontWeight: '900', letterSpacing: '2px',
                                        color: '#ffffff', background: 'rgba(0,0,0,0.4)',
                                        padding: '4px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        {activeMatch.homeScore ?? 0} : {activeMatch.awayScore ?? 0}
                                    </div>
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        fontSize: '11.5px', fontWeight: '800',
                                        color: activeMatch.status === 'live' ? '#ef4444' : (activeMatch.status === 'refereed' ? '#a855f7' : '#94a3b8'),
                                        background: activeMatch.status === 'live' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                                        padding: '3px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)'
                                    }}>
                                        {activeMatch.status === 'live' && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />}
                                        {activeMatch.status === 'live' 
                                            ? `LIVE ${activeMatch.currentHalf || '1H'} ${activeMatch.matchTime || (activeMatch.matchClock ? activeMatch.matchClock + "'" : '')}`
                                            : (activeMatch.status === 'refereed' ? 'FULL TIME (Awaiting Coordinator Sign-off)' : (activeMatch.status === 'approved' ? 'RESULT APPROVED' : `SCHEDULED ${activeMatch.time || '19:00'}`))
                                        }
                                    </div>
                                </div>

                                {/* Away Club */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '14px' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>
                                            {activeMatch.awayTeam || getSchoolName(activeMatch.awayTeamId, activeMatch)}
                                        </h2>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#818cf8' }}>AWAY CLUB</span>
                                    </div>
                                </div>
                            </div>

                            {/* Possession Bar */}
                            {(() => {
                                const poss = activeMatch.possession || activeMatch.liveState?.possession || { homePct: 50, awayPct: 50 };
                                const homePct = poss.homePct ?? 50;
                                const awayPct = poss.awayPct ?? 50;
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>
                                            <span style={{ color: '#4ade80' }}>Possession: {homePct}%</span>
                                            <span style={{ color: '#818cf8' }}>Possession: {awayPct}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                            <div style={{ width: `${homePct}%`, background: '#22c55e', transition: 'width 0.3s ease' }} />
                                            <div style={{ width: `${awayPct}%`, background: '#6366f1', transition: 'width 0.3s ease' }} />
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* In-Feed Pending Substitution Alerts */}
                    {activeMatch && (activeMatch.substitutionRequests || []).filter(r => r.status === 'pending').map(req => {
                        const isMatchHome = req.teamSide === 'home' || req.teamId === activeMatch.homeTeamId || String(activeMatch.homeTeamId || '').toLowerCase().includes(String(req.teamId || '').toLowerCase().replace('-team-pmc', ''));
                        const teamName = isMatchHome 
                            ? (activeMatch.homeTeam || getSchoolName(activeMatch.homeTeamId, activeMatch))
                            : (activeMatch.awayTeam || getSchoolName(activeMatch.awayTeamId, activeMatch));
                        const offP = resolvePlayer(req.playerOff, allStudents);
                        const onP = resolvePlayer(req.playerOn, allStudents);
                        const offName = offP?.name || resolvePlayerName(req.playerOff, allStudents);
                        const onName = onP?.name || resolvePlayerName(req.playerOn, allStudents);
                        const offJersey = offP?.jerseyNumber != null ? `#${offP.jerseyNumber} ` : '';
                        const onJersey = onP?.jerseyNumber != null ? `#${onP.jerseyNumber} ` : '';
                        const defaultMin = req.minute || activeMatch.matchClock || (activeMatch.currentHalf === '2H' ? 60 : 25);
                        const currentMin = subMinuteOverrides[req.id] !== undefined ? subMinuteOverrides[req.id] : defaultMin;

                        return (
                            <div key={req.id} style={{
                                padding: '16px 20px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(185, 28, 28, 0.12))',
                                border: '1.5px solid rgba(239, 68, 68, 0.5)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px',
                                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.2)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '38px', height: '38px', borderRadius: '8px',
                                        background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#ffffff'
                                    }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="17 1 21 5 17 9" />
                                            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                            <polyline points="7 23 3 19 7 15" />
                                            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Pending Touchline Substitution Request
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>· {teamName}</span>
                                        </div>
                                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
                                            <span style={{ color: '#4ade80' }}>IN: {onJersey}{onName}</span>
                                            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.4)' }}>⇄</span>
                                            <span style={{ color: '#f87171' }}>OUT: {offJersey}{offName}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Minute:</label>
                                        <input
                                            type="number"
                                            value={currentMin}
                                            onChange={e => setSubMinuteOverrides(prev => ({ ...prev, [req.id]: e.target.value }))}
                                            style={{
                                                width: '56px', padding: '6px 8px', borderRadius: '6px',
                                                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                                                color: '#ffffff', fontSize: '12px', fontWeight: '700', textAlign: 'center'
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleApproveSubstitution(activeMatch, req.id, currentMin)}
                                        style={{
                                            padding: '8px 18px', borderRadius: '8px',
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#ffffff',
                                            border: 'none', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.35)', transition: 'all 0.15s'
                                        }}
                                    >
                                        Approve &amp; Swap Lineup
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRejectSubstitution(activeMatch, req.id)}
                                        style={{
                                            padding: '8px 14px', borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.08)', color: '#fca5a5',
                                            border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '12px', fontWeight: '700',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Decline
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* In-Feed Pending Warm-Up Injury Alerts */}
                    {activeMatch && (activeMatch.warmupAmendments || []).filter(a => a.status === 'pending' || a.status === 'pending_commissioner').map(amendment => (
                        <div key={amendment.id} style={{
                            padding: '16px 20px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1))',
                            border: '1.5px solid rgba(245, 158, 11, 0.4)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
                        }}>
                            <div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#fbbf24', textTransform: 'uppercase' }}>
                                    Pre-Match Warm-Up Injury Amendment
                                </span>
                                <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
                                    {amendment.teamName || getSchoolName(amendment.teamId, activeMatch)}: #{amendment.playerOnJersey} {amendment.playerOnName} promoted to Starting XI for injured #{amendment.playerOffJersey} {amendment.playerOffName}
                                </div>
                                {amendment.injuryReason && (
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                                        Reason: {amendment.injuryReason} (0 match subs charged)
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => handleApproveWarmupAmendment(activeMatch, amendment.id)}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#ffffff',
                                        border: 'none', fontSize: '12px', fontWeight: '800', cursor: 'pointer'
                                    }}
                                >
                                    Authorize Starter Switch
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleRejectWarmupAmendment(activeMatch, amendment.id)}
                                    style={{
                                        padding: '8px 12px', borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.08)', color: '#fca5a5',
                                        border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '12px', fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Concluded Match Ready for Sign-Off Notice */}
                    {activeMatch && (activeMatch.status === 'refereed' || (activeMatch.status === 'completed' && !activeMatch.commissionerReport)) && (
                        <div style={{
                            padding: '16px 20px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(79, 70, 229, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
                        }}>
                            <div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#a5b4fc', textTransform: 'uppercase' }}>
                                    Official Match Sign-Off Required
                                </span>
                                <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                                    The Referee has concluded this fixture ({activeMatch.homeScore} - {activeMatch.awayScore}). Review match statistics, incidents, and sign off on the official match report.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    handleSelectMatch(activeMatch);
                                    setMainTab('approvals');
                                }}
                                style={{
                                    padding: '9px 18px', borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#ffffff',
                                    border: 'none', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span>Proceed to Official Sign-Off</span>
                                <span>➔</span>
                            </button>
                        </div>
                    )}

                    {/* Live Timeline Stream Section */}
                    {activeMatch && (
                        <div className="glass-panel" style={{
                            padding: '20px 24px', borderRadius: '16px',
                            display: 'flex', flexDirection: 'column', gap: '16px'
                        }}>
                            {/* Filter Bar */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                flexWrap: 'wrap', gap: '12px', borderBottom: 'var(--border)', paddingBottom: '14px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>
                                        Live Match Timeline &amp; Event Ledger
                                    </h3>
                                    <span style={{
                                        fontSize: '11px', fontWeight: '800', color: '#4ade80',
                                        background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: '12px',
                                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                                    }}>
                                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e' }} />
                                        {(activeMatch.timeline || []).length} Events Logged
                                    </span>
                                </div>

                                {/* Category Filters */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'all', label: 'All Events' },
                                        { id: 'goal_shot', label: 'Goals & Shots' },
                                        { id: 'card_foul', label: 'Cards & Fouls' },
                                        { id: 'sub', label: 'Substitutions' },
                                        { id: 'setpiece', label: 'Set Pieces' }
                                    ].map(cat => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setTimelineFilter(cat.id)}
                                            style={{
                                                padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                                                background: timelineFilter === cat.id ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.04)',
                                                color: timelineFilter === cat.id ? '#fca5a5' : 'var(--text-secondary)',
                                                border: timelineFilter === cat.id ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Team Filters & Sort */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                            Both Clubs
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTimelineTeamFilter('home')}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                                background: timelineTeamFilter === 'home' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                                                color: timelineTeamFilter === 'home' ? '#4ade80' : 'var(--text-muted)',
                                                border: '1px solid rgba(34, 197, 94, 0.3)', cursor: 'pointer'
                                            }}
                                        >
                                            Home
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTimelineTeamFilter('away')}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                                background: timelineTeamFilter === 'away' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                                color: timelineTeamFilter === 'away' ? '#a5b4fc' : 'var(--text-muted)',
                                                border: '1px solid rgba(99, 102, 241, 0.3)', cursor: 'pointer'
                                            }}
                                        >
                                            Away
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setTimelineSortOrder(prev => prev === 'newest' ? 'chronological' : 'newest')}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                                            border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer'
                                        }}
                                    >
                                        {timelineSortOrder === 'newest' ? 'Newest First' : '1\' - 90\''}
                                    </button>
                                </div>
                            </div>

                            {/* Render Filtered Timeline Events */}
                            {(() => {
                                const allEvents = activeMatch.timeline || [];
                                const homePlayersList = activeMatch.homePlayers || [];
                                const awayPlayersList = activeMatch.awayPlayers || [];

                                let filtered = allEvents.filter(ev => {
                                    // Category filter
                                    if (timelineFilter === 'goal_shot') {
                                        const t = String(ev.type || '').toLowerCase();
                                        if (!t.includes('goal') && !t.includes('shot') && t !== 'gksave') return false;
                                    } else if (timelineFilter === 'card_foul') {
                                        const t = String(ev.type || '').toLowerCase();
                                        if (!t.includes('card') && !t.includes('foul')) return false;
                                    } else if (timelineFilter === 'sub') {
                                        const t = String(ev.type || '').toLowerCase();
                                        if (!t.includes('sub')) return false;
                                    } else if (timelineFilter === 'setpiece') {
                                        const t = String(ev.type || '').toLowerCase();
                                        if (t !== 'corner' && t !== 'penalty' && t !== 'offside') return false;
                                    }

                                    // Team filter
                                    const isHomeEvt = ev.team === 'home' || ev.teamSide === 'home' || (ev.playerId && homePlayersList.includes(ev.playerId));
                                    const isAwayEvt = ev.team === 'away' || ev.teamSide === 'away' || (ev.playerId && awayPlayersList.includes(ev.playerId));
                                    if (timelineTeamFilter === 'home' && !isHomeEvt) return false;
                                    if (timelineTeamFilter === 'away' && !isAwayEvt) return false;

                                    return true;
                                });

                                if (timelineSortOrder === 'newest') {
                                    filtered = filtered.slice().reverse();
                                }

                                if (filtered.length === 0) {
                                    return (
                                        <div style={{
                                            padding: '40px 20px', textAlign: 'center',
                                            background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                                            border: '1px dashed rgba(255,255,255,0.08)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                                        }}>
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                                                <path d="M4.93 19.07A10 10 0 0 1 19.07 4.93" />
                                                <path d="M7.76 16.24a6 6 0 0 1 8.48-8.48" />
                                                <circle cx="12" cy="12" r="2" />
                                            </svg>
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                                                {allEvents.length === 0 
                                                    ? 'Waiting for pitch-side data capturer to log match events...'
                                                    : 'No events match the selected category or team filter.'
                                                }
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                All goals, shots, cards, fouls, and substitutions logged in the field console will appear here in real time.
                                            </span>
                                        </div>
                                    );
                                }

                                return (
                                    <div style={{
                                        display: 'flex', flexDirection: 'column', gap: '10px',
                                        maxHeight: '520px', overflowY: 'auto', paddingRight: '4px'
                                    }}>
                                        {filtered.map((ev, idx) => {
                                            const isHome = ev.team === 'home' || ev.teamSide === 'home' || (ev.playerId && homePlayersList.includes(ev.playerId));
                                            const clubName = isHome 
                                                ? (activeMatch.homeTeam || getSchoolName(activeMatch.homeTeamId, activeMatch))
                                                : (activeMatch.awayTeam || getSchoolName(activeMatch.awayTeamId, activeMatch));
                                            
                                            // Event styling & configuration
                                            let iconNode = (
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                            );
                                            let badgeTitle = 'Play Event';
                                            let accentClr = '#6366f1';
                                            let bgTint = 'rgba(99, 102, 241, 0.06)';
                                            const type = String(ev.type || '').toLowerCase();

                                            if (type === 'goal') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                                                );
                                                badgeTitle = ev.goalType === 'own-goal' ? 'Own Goal' : (ev.goalType === 'penalty' ? 'Penalty Goal' : 'Goal Scored');
                                                accentClr = '#22c55e';
                                                bgTint = 'rgba(34, 197, 94, 0.08)';
                                            } else if (type === 'shotontarget') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                                                );
                                                badgeTitle = 'Shot on Target';
                                                accentClr = '#14b8a6';
                                                bgTint = 'rgba(20, 184, 166, 0.06)';
                                            } else if (type === 'shotmissed') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                );
                                                badgeTitle = 'Shot Off-Target';
                                                accentClr = '#64748b';
                                                bgTint = 'rgba(100, 116, 139, 0.06)';
                                            } else if (type === 'gksave') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                                );
                                                badgeTitle = 'Goalkeeper Save';
                                                accentClr = '#06b6d4';
                                                bgTint = 'rgba(6, 182, 212, 0.06)';
                                            } else if (type === 'yellowcard') {
                                                iconNode = (
                                                    <span style={{ display: 'inline-block', width: '12px', height: '16px', borderRadius: '2px', background: '#f59e0b', boxShadow: '0 1px 4px rgba(245,158,11,0.4)' }} />
                                                );
                                                badgeTitle = 'Yellow Card Caution';
                                                accentClr = '#f59e0b';
                                                bgTint = 'rgba(245, 158, 11, 0.08)';
                                            } else if (type === 'redcard') {
                                                iconNode = (
                                                    <span style={{ display: 'inline-block', width: '12px', height: '16px', borderRadius: '2px', background: '#ef4444', boxShadow: '0 1px 4px rgba(239,68,68,0.4)' }} />
                                                );
                                                badgeTitle = 'Red Card Send-Off';
                                                accentClr = '#ef4444';
                                                bgTint = 'rgba(239, 68, 68, 0.1)';
                                            } else if (type.includes('sub')) {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                                );
                                                badgeTitle = 'Substitution Approved & Executed';
                                                accentClr = '#a855f7';
                                                bgTint = 'rgba(168, 85, 247, 0.08)';
                                            } else if (type === 'foul') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                                );
                                                badgeTitle = 'Foul Committed';
                                                accentClr = '#ea580c';
                                                bgTint = 'rgba(234, 88, 12, 0.06)';
                                            } else if (type === 'corner') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                                                );
                                                badgeTitle = 'Corner Kick';
                                                accentClr = '#3b82f6';
                                                bgTint = 'rgba(59, 130, 246, 0.06)';
                                            } else if (type === 'penalty') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                                                );
                                                badgeTitle = 'Penalty Kick Awarded';
                                                accentClr = '#8b5cf6';
                                                bgTint = 'rgba(139, 92, 246, 0.08)';
                                            } else if (type === 'offside') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                                                );
                                                badgeTitle = 'Offside Call';
                                                accentClr = '#64748b';
                                                bgTint = 'rgba(100, 116, 139, 0.06)';
                                            } else if (type === 'possession') {
                                                iconNode = (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isHome ? '#22c55e' : '#6366f1'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                );
                                                badgeTitle = 'Possession Shift';
                                                accentClr = isHome ? '#22c55e' : '#6366f1';
                                                bgTint = 'rgba(255, 255, 255, 0.02)';
                                            }

                                            // Player names
                                            const pName = resolvePlayerName(ev.playerId || ev.playerName, allStudents);
                                            const assistName = ev.assistingPlayerName || (ev.assistPlayerId ? resolvePlayerName(ev.assistPlayerId, allStudents) : null);
                                            const onPlayerName = ev.playerOnName || (ev.playerOnId ? resolvePlayerName(ev.playerOnId, allStudents) : (ev.playerOn ? resolvePlayerName(ev.playerOn, allStudents) : null));
                                            const offPlayerName = ev.playerOffName || (ev.playerOffId ? resolvePlayerName(ev.playerOffId, allStudents) : (ev.playerOff ? resolvePlayerName(ev.playerOff, allStudents) : null));

                                            const minDisplay = ev.minute != null 
                                                ? `${ev.minute}'` 
                                                : (ev.elapsed ? `${Math.floor(ev.elapsed / 60) + 1}'` : "—'");

                                            return (
                                                <div
                                                    key={ev.id || idx}
                                                    style={{
                                                        padding: '12px 16px', borderRadius: '10px',
                                                        background: bgTint,
                                                        borderLeft: `4px solid ${accentClr}`,
                                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                                        borderRight: '1px solid rgba(255,255,255,0.06)',
                                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        gap: '14px', transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {/* Left: Minute & Icon & Type */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            minWidth: '42px', textAlign: 'center',
                                                            fontSize: '12px', fontWeight: '900', color: accentClr,
                                                            background: 'rgba(0,0,0,0.35)', padding: '4px 6px', borderRadius: '6px'
                                                        }}>
                                                            {minDisplay}
                                                        </div>
                                                        <div style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>
                                                            {iconNode}
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#ffffff' }}>
                                                                    {badgeTitle}
                                                                </span>
                                                                {ev.period && (
                                                                    <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>
                                                                        {ev.period}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
                                                                {type.includes('sub') ? (
                                                                    <span>
                                                                        <strong style={{ color: '#4ade80' }}>IN: {onPlayerName || 'Player On'}</strong> for <strong style={{ color: '#f87171' }}>OUT: {offPlayerName || 'Player Off'}</strong>
                                                                    </span>
                                                                ) : type === 'goal' ? (
                                                                    <span>
                                                                        <strong>{pName}</strong>
                                                                        {assistName && <span style={{ color: 'var(--text-muted)' }}> (Assist: {assistName})</span>}
                                                                    </span>
                                                                ) : (
                                                                    <span><strong>{pName || ev.teamName || 'Play event'}</strong></span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Right: Team Tag */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                        <span style={{
                                                            fontSize: '11px', fontWeight: '800',
                                                            color: isHome ? '#4ade80' : '#818cf8',
                                                            background: isHome ? 'rgba(34, 197, 94, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                                            padding: '2px 8px', borderRadius: '4px'
                                                        }}>
                                                            {clubName}
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                            {isHome ? 'Home Club' : 'Away Club'}
                                                        </span>
                                                    </div>
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

            {/* TAB CONTENT: Approvals */}
            {mainTab === 'approvals' && (
                <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
                    {/* Left side: Pending list */}
                    <div className="glass-panel" style={{ width: '380px', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>Pending Match Approvals</h3>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Authorize scores to update standings and player profiles</span>
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {approvalSuccess && (
                                <div style={{
                                    padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--success)', fontSize: '12px', fontWeight: '600', textAlign: 'center'
                                }}>
                                    Match approved! Standings updated.
                                </div>
                            )}

                            {pendingApprovalMatches.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                    No matches pending commissioner approval.
                                </div>
                            ) : (
                                pendingApprovalMatches.map(m => {
                                    const isSel = selectedMatch?.id === m.id;
                                    const homeName = m.homeTeam || getSchoolName(m.homeTeamId, m);
                                    const awayName = m.awayTeam || getSchoolName(m.awayTeamId, m);
                                    return (
                                        <div
                                            key={m.id}
                                            onClick={() => handleSelectMatch(m)}
                                            style={{
                                                padding: '14px 16px', borderRadius: '12px',
                                                background: isSel 
                                                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(30, 41, 59, 0.95) 100%)' 
                                                    : 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.75) 100%)',
                                                border: isSel ? '1.5px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.12)',
                                                boxShadow: isSel ? '0 4px 16px rgba(99, 102, 241, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
                                                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.15s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: isSel ? '#a5b4fc' : '#94a3b8', fontWeight: '800' }}>
                                                <span>{m.ageGroup === 'PMC' ? "Prime Minister's Cup" : `${m.ageGroup} Division`}</span>
                                                <span>{m.matchday || 'PMC Matchday'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13.5px', fontWeight: '800', color: '#ffffff' }}>
                                                <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{homeName}</span>
                                                <span style={{ background: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '900', color: '#4ade80' }}>
                                                    {m.homeScore ?? 0} - {m.awayScore ?? 0}
                                                </span>
                                                <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{awayName}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                                                <span>{m.venue || 'Friendship, St. Michael'}</span>
                                                <span style={{ color: '#fbbf24', fontWeight: '700' }}>Awaiting Review</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right side: Detailed approval pane */}
                    <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                        {activeSelectedMatch ? (
                            <form onSubmit={handleApproveMatch} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                                <div style={{ padding: '20px 24px', borderBottom: 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>Match Commissioner Verification Panel</h3>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {getSchoolName(activeSelectedMatch.homeTeamId)} vs {getSchoolName(activeSelectedMatch.awayTeamId)}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setIsExpanded(true)}
                                            style={{
                                                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                                                background: 'rgba(99,102,241,0.15)', color: 'var(--primary-light)',
                                                border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.25)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                                        >
                                            Expand Panel
                                        </button>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary-light)', background: 'rgba(37,99,235,0.1)', padding: '4px 10px', borderRadius: '20px' }}>
                                            Pending Review
                                        </span>
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    
                                    {/* Discrepancy Analysis Banner */}
                                    {discrepancies.length === 0 ? (
                                        <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--success)' }}>Data Verified: No Discrepancies</span>
                                                <span style={{ fontSize: '12px', color: 'rgba(16, 185, 129, 0.8)' }}>The Referee's event log perfectly matches the Statistician's live data entry.</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--danger)' }}>Data Conflict Detected</span>
                                            </div>
                                            <ul style={{ margin: 0, paddingLeft: '28px', fontSize: '12px', color: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {discrepancies.map((issue, idx) => <li key={idx}>{issue}</li>)}
                                            </ul>
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        {/* Statistician stats */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Live Event Log (Statistician)</h4>
                                            <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Score:</span>
                                                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{activeSelectedMatch.homeScore} - {activeSelectedMatch.awayScore}</span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '8px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Logged scorers:</span>
                                                    {activeSelectedMatch.timeline?.length === 0 ? (
                                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No event logs.</span>
                                                    ) : (
                                                        activeSelectedMatch.timeline?.map((ev, i) => (
                                                            <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                                                                Min {ev.minute}: {ev.type} (Player ID: {ev.playerId})
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Referee Report */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Official Event Log (Referee)</h4>
                                            <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Referee logged events:</span>
                                                    {activeSelectedMatch.refereeLiveState?.timeline?.length === 0 ? (
                                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No event logs.</span>
                                                    ) : (
                                                        activeSelectedMatch.refereeLiveState?.timeline?.map((ev, i) => (
                                                            <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                                                                Min {ev.minute}: {ev.type} (Player ID: {ev.playerId})
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '8px', marginTop: '4px' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Pitch / Weather:</span>
                                                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{activeSelectedMatch.refereeReport?.pitchCondition} / {activeSelectedMatch.refereeReport?.weatherCondition}</span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Referee Summary:</span>
                                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                                                        "{activeSelectedMatch.refereeReport?.refereeSummary}"
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Referee Signature:</span>
                                                    <span style={{ fontWeight: '700', color: 'var(--primary-light)' }}>{activeSelectedMatch.refereeReport?.refereeSignature}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Commissioner approval fields */}
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Incident Assessment</label>
                                            <select
                                                value={incidentRating}
                                                onChange={e => setIncidentRating(e.target.value)}
                                                style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                            >
                                                <option value="1">1 - Safe / Peaceful</option>
                                                <option value="2">2 - Minor incidents</option>
                                                <option value="3">3 - Crowd warning issued</option>
                                                <option value="4">4 - High risk / Misconduct</option>
                                                <option value="5">5 - Critical issues / Interrupted</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Commissioner Summary Remarks</label>
                                            <textarea
                                                value={generalRemarks}
                                                onChange={e => setGeneralRemarks(e.target.value)}
                                                placeholder="Write final review notes..."
                                                required
                                                style={{ height: '70px', padding: '10px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', resize: 'none', outline: 'none' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Digital Authorization Signature</label>
                                            <input
                                                type="text"
                                                value={commissionerSignature}
                                                onChange={e => setCommissionerSignature(e.target.value)}
                                                placeholder="Type your official name to sign off..."
                                                required
                                                style={{ padding: '10px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold', outline: 'none' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: '16px 24px', borderTop: 'var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255,255,255,0.01)' }}>
                                    {readOnly ? (
                                        <span style={{
                                            padding: '10px 24px', borderRadius: '24px',
                                            background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8',
                                            border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: '800', fontSize: '13px',
                                            display: 'flex', alignItems: 'center', gap: '6px'
                                        }}>
                                            Read-Only Mode (Match Certification Restricted)
                                        </span>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={!commissionerSignature.trim() || !generalRemarks.trim()}
                                            style={{
                                                padding: '10px 32px', borderRadius: '24px', background: 'var(--success)', color: '#ffffff', border: 'none',
                                                fontWeight: '800', fontSize: '13px', cursor: 'pointer', opacity: (commissionerSignature.trim() && generalRemarks.trim()) ? 1 : 0.5,
                                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                                            }}
                                        >
                                            Authorize Score & Approve Standings
                                        </button>
                                    )}
                                </div>
                            </form>
                        ) : (
                            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                <span>Select a match from the refereed list to verify and approve.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: Matchday Operations & Substitutions */}
            {mainTab === 'operations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '30px' }}>
                    
                    {/* Header Banner & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span>Matchday Operations &amp; Touchline Desk</span>
                                {totalPendingOps > 0 && (
                                    <span style={{ fontSize: '12px', background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '12px', padding: '2px 10px', fontWeight: '800' }}>
                                        {totalPendingOps} Action{totalPendingOps > 1 ? 's' : ''} Pending
                                    </span>
                                )}
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                Official Match Commissioner desk for pre-match warm-up injury amendments and live touchline substitution approvals.
                            </p>
                        </div>
                    </div>

                    {/* Operational Success Toast */}
                    {opSuccessToast && (
                        <div style={{
                            padding: '12px 18px', borderRadius: '12px',
                            background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)',
                            color: '#34d399', fontSize: '13px', fontWeight: '700',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                        }}>
                            <span>{opSuccessToast}</span>
                            <button onClick={() => setOpSuccessToast(null)} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>
                        </div>
                    )}

                    {/* 2-Column Grid for Warm-Up Amendments & In-Match Substitutions */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
                        
                        {/* ── PANEL 1: Pre-Match Warm-Up Injury Amendments ── */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '22px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: 'var(--border)', paddingBottom: '14px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Pre-Match Warm-Up Injury Switch
                                    </h3>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Emergency starter replacement prior to kickoff (0 match substitutions charged)
                                    </span>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '800', background: pendingWarmupAmendments.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', color: pendingWarmupAmendments.length > 0 ? '#f87171' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px' }}>
                                    {pendingWarmupAmendments.length} Pending
                                </span>
                            </div>

                            {/* Competition Regulation Guidance Callout */}
                            <div style={{
                                padding: '10px 14px', borderRadius: '10px',
                                background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)',
                                fontSize: '11.5px', color: '#93c5fd', lineHeight: 1.5
                            }}>
                                <strong>Competition Rule (Warm-Up Injury):</strong> If a player in the submitted Starting XI suffers an injury during warm-ups prior to kickoff, the coach may replace them with an eligible bench player. <em>This action does not count towards the team's 5 match substitutions</em>. Once approved, the replacement officially starts.
                            </div>

                            {/* Pending Warm-Up Cards List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {pendingWarmupAmendments.length === 0 ? (
                                    <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                                        No pending warm-up injury amendments. All starting lineups are proceeding as submitted.
                                    </div>
                                ) : (
                                    pendingWarmupAmendments.map(item => (
                                        <div
                                            key={item.id}
                                            style={{
                                                padding: '16px', borderRadius: '14px',
                                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(30, 41, 59, 0.5) 100%)',
                                                border: '1.5px solid rgba(239, 68, 68, 0.35)',
                                                display: 'flex', flexDirection: 'column', gap: '12px',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                <span style={{ fontWeight: '800', color: 'var(--primary-light)' }}>
                                                    {item.match?.venue || 'Venue'} • {item.match?.matchday || 'Matchday'}
                                                </span>
                                                <span>Requested: {new Date(item.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>

                                            <div style={{ fontSize: '13px', fontWeight: '800', color: '#ffffff' }}>
                                                {item.teamName || getSchoolName(item.teamId, item.match)} ({item.isHome ? 'Home' : 'Away'})
                                            </div>

                                            {/* Side by side: Injured Starter -> Promoted Replacement */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'center' }}>
                                                {/* Injured Starter (Red) */}
                                                <div style={{
                                                    padding: '10px', borderRadius: '10px',
                                                    background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px'
                                                }}>
                                                    <span style={{ fontSize: '9.5px', fontWeight: '900', color: '#f87171', textTransform: 'uppercase' }}>
                                                        Injured Starter
                                                    </span>
                                                    <JerseyIcon number={item.playerOffJersey || '—'} color="#ef4444" size={34} />
                                                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
                                                        {item.playerOffName}
                                                    </div>
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Starter</span>
                                                </div>

                                                <div style={{ fontSize: '18px', color: '#38bdf8', fontWeight: '900' }}>
                                                    ⇄
                                                </div>

                                                {/* Promoted Replacement (Green) */}
                                                <div style={{
                                                    padding: '10px', borderRadius: '10px',
                                                    background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px'
                                                }}>
                                                    <span style={{ fontSize: '9.5px', fontWeight: '900', color: '#4ade80', textTransform: 'uppercase' }}>
                                                        Promoted to XI
                                                    </span>
                                                    <JerseyIcon number={item.playerOnJersey || '—'} color="#22c55e" size={34} />
                                                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
                                                        {item.playerOnName}
                                                    </div>
                                                    <span style={{ fontSize: '10px', color: '#86efac', fontWeight: '700' }}>0 Subs Charged</span>
                                                </div>
                                            </div>

                                            {/* Injury Reason */}
                                            <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #f87171' }}>
                                                <strong>Reported Reason:</strong> {item.injuryReason}
                                            </div>

                                            {/* Action Buttons */}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
                                                <button
                                                    type="button"
                                                    disabled={readOnly}
                                                    onClick={() => handleRejectWarmupAmendment(item.match, item.id)}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                                                        background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)',
                                                        border: '1px solid var(--border)', cursor: readOnly ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    Decline
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={readOnly}
                                                    onClick={() => handleApproveWarmupAmendment(item.match, item.id)}
                                                    style={{
                                                        padding: '8px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#ffffff',
                                                        border: 'none', cursor: readOnly ? 'not-allowed' : 'pointer',
                                                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.35)'
                                                    }}
                                                >
                                                    Approve Warm-Up Change
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Historical / Approved Warm-up switches */}
                            {historicalWarmupAmendments.length > 0 && (
                                <div style={{ borderTop: 'var(--border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Recent Warm-Up Amendments Log ({historicalWarmupAmendments.length})
                                    </span>
                                    {historicalWarmupAmendments.slice(-3).map(h => (
                                        <div key={h.id} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                                            <span>{h.teamName}: #{h.playerOnJersey} {h.playerOnName} for #{h.playerOffJersey} {h.playerOffName}</span>
                                            <span style={{ color: h.status === 'approved' ? '#4ade80' : '#f87171', fontWeight: '700' }}>
                                                {h.status === 'approved' ? 'Approved' : 'Rejected'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── PANEL 2: In-Match Substitution Control Desk ── */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '22px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: 'var(--border)', paddingBottom: '14px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        In-Match Substitution Control Desk
                                    </h3>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Live touchline substitution requests submitted from Coach / 4th Official devices
                                    </span>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '800', background: pendingSubstitutions.length > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', color: pendingSubstitutions.length > 0 ? '#60a5fa' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px' }}>
                                    {pendingSubstitutions.length} Pending
                                </span>
                            </div>

                            {/* Touchline Protocol Guidance Callout */}
                            <div style={{
                                padding: '10px 14px', borderRadius: '10px',
                                background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
                                fontSize: '11.5px', color: '#6ee7b7', lineHeight: 1.5
                            }}>
                                <strong>Substitution Protocol:</strong> Confirm the match minute and authorize the substitution. Approval automatically deducts from the team's 5-sub quota, appends the event to the official match timeline, and updates the live tactical pitch.
                            </div>

                            {/* Pending Substitutions List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {pendingSubstitutions.length === 0 ? (
                                    <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                                        No live substitution requests awaiting official confirmation.
                                    </div>
                                ) : (
                                    pendingSubstitutions.map(item => {
                                        const offPlayer = resolvePlayer(item.playerOff, allStudents);
                                        const onPlayer = resolvePlayer(item.playerOn, allStudents);
                                        const offName = resolvePlayerName(offPlayer || item.playerOff, allStudents);
                                        const onName = resolvePlayerName(onPlayer || item.playerOn, allStudents);
                                        const curMinute = subMinuteOverrides[item.id] !== undefined ? subMinuteOverrides[item.id] : (item.minute || item.match?.matchClock || 45);

                                        return (
                                            <div
                                                key={item.id}
                                                style={{
                                                    padding: '16px', borderRadius: '14px',
                                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(30, 41, 59, 0.5) 100%)',
                                                    border: '1.5px solid rgba(59, 130, 246, 0.35)',
                                                    display: 'flex', flexDirection: 'column', gap: '12px',
                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    <span style={{ fontWeight: '800', color: '#60a5fa' }}>
                                                        Match Status: {item.match?.status === 'live' ? 'LIVE' : 'Scheduled / In-Progress'}
                                                    </span>
                                                    <span>{new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>

                                                <div style={{ fontSize: '13px', fontWeight: '800', color: '#ffffff' }}>
                                                    {getSchoolName(item.teamId, item.match)}
                                                </div>

                                                {/* Side by side: Off -> On */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'center' }}>
                                                    <div style={{
                                                        padding: '10px', borderRadius: '10px',
                                                        background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px'
                                                    }}>
                                                        <span style={{ fontSize: '9.5px', fontWeight: '900', color: '#f87171', textTransform: 'uppercase' }}>
                                                            COMING OFF
                                                        </span>
                                                        <JerseyIcon number={offPlayer?.jerseyNumber != null ? offPlayer.jerseyNumber : '—'} color="#ef4444" size={34} />
                                                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
                                                            {offName}
                                                        </div>
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Starter</span>
                                                    </div>

                                                    <div style={{ fontSize: '18px', color: '#38bdf8', fontWeight: '900' }}>
                                                        ⇄
                                                    </div>

                                                    <div style={{
                                                        padding: '10px', borderRadius: '10px',
                                                        background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)',
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px'
                                                    }}>
                                                        <span style={{ fontSize: '9.5px', fontWeight: '900', color: '#4ade80', textTransform: 'uppercase' }}>
                                                            COMING ON
                                                        </span>
                                                        <JerseyIcon number={onPlayer?.jerseyNumber != null ? onPlayer.jerseyNumber : '—'} color="#22c55e" size={34} />
                                                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
                                                            {onName}
                                                        </div>
                                                        <span style={{ fontSize: '10px', color: '#86efac', fontWeight: '700' }}>Substitute</span>
                                                    </div>
                                                </div>

                                                {/* Tactical Note & Minute Setter */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '10px', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px' }}>
                                                        <strong>Note:</strong> {item.tacticalNote || 'Tactical change'}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '8px' }}>
                                                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>Minute:</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="120"
                                                            value={curMinute}
                                                            onChange={e => setSubMinuteOverrides({ ...subMinuteOverrides, [item.id]: e.target.value })}
                                                            style={{ width: '46px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.4)', color: '#fbbf24', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}
                                                        />
                                                        <span style={{ fontSize: '11px', color: '#fbbf24' }}>'</span>
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
                                                    <button
                                                        type="button"
                                                        disabled={readOnly}
                                                        onClick={() => handleRejectSubstitution(item.match, item.id)}
                                                        style={{
                                                            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                                                            background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)',
                                                            border: '1px solid var(--border)', cursor: readOnly ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        Decline
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={readOnly}
                                                        onClick={() => handleApproveSubstitution(item.match, item.id)}
                                                        style={{
                                                            padding: '8px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#ffffff',
                                                            border: 'none', cursor: readOnly ? 'not-allowed' : 'pointer',
                                                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
                                                        }}
                                                    >
                                                        Confirm &amp; Apply Substitution
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Historical / Completed substitutions */}
                            {historicalSubstitutions.length > 0 && (
                                <div style={{ borderTop: 'var(--border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Recent Substitutions Log ({historicalSubstitutions.length})
                                    </span>
                                    {historicalSubstitutions.slice(-3).map(h => (
                                        <div key={h.id} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                                            <span>{h.minute}' • {getSchoolName(h.teamId, h.match)} ({resolvePlayerName(h.playerOn, allStudents)} for {resolvePlayerName(h.playerOff, allStudents)})</span>
                                            <span style={{ color: h.status === 'approved' ? '#4ade80' : '#f87171', fontWeight: '700' }}>
                                                {h.status === 'approved' ? 'Authorized' : 'Rejected'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {/* TAB CONTENT: Scheduling */}
            {mainTab === 'scheduling' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', flex: 1, minHeight: 0 }}>
                    
                    {/* Setup / Schedulers Panel */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', gap: '6px', borderBottom: 'var(--border)', paddingBottom: '10px' }}>
                            <button
                                onClick={() => setSchedulingMode('generator')}
                                style={{
                                    padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '700',
                                    background: schedulingMode === 'generator' ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: schedulingMode === 'generator' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    border: 'none', cursor: 'pointer'
                                }}
                            >
                                Auto Round-Robin Generator
                            </button>
                            <button
                                onClick={() => setSchedulingMode('manual')}
                                style={{
                                    padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '700',
                                    background: schedulingMode === 'manual' ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: schedulingMode === 'manual' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    border: 'none', cursor: 'pointer'
                                }}
                            >
                                Manual Match Setup
                            </button>
                        </div>

                        {/* MODE: Generator */}
                        {schedulingMode === 'generator' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Target Division Group</label>
                                    <select
                                        value={selectedDivision}
                                        onChange={e => setSelectedDivision(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="U14">U14 Division</option>
                                        <option value="U16">U16 Division</option>
                                        <option value="U19">U19 Division</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Fixture Matchday Term</label>
                                    <select
                                        value={matchdayTerm}
                                        onChange={e => setMatchdayTerm(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="Matchday 1">Matchday 1</option>
                                        <option value="Matchday 2">Matchday 2</option>
                                        <option value="Matchday 3">Matchday 3</option>
                                        <option value="Matchday 4">Matchday 4</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Ground Venue</label>
                                    <select
                                        value={selectedVenue}
                                        onChange={e => setSelectedVenue(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        {DEFAULT_VENUES.map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {generationSuccess && (
                                    <div style={{
                                        padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--success)', fontSize: '12px', fontWeight: '600', textAlign: 'center'
                                    }}>
                                        Fixtures successfully generated and scheduled!
                                    </div>
                                )}

                                {readOnly ? (
                                    <div style={{
                                        padding: '10px', borderRadius: '24px', background: 'rgba(56, 189, 248, 0.1)',
                                        border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', fontSize: '12px',
                                        fontWeight: '700', textAlign: 'center', marginTop: '8px'
                                    }}>
                                        Observer Mode (Fixture Generation Restricted)
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleGenerateFixtures}
                                        style={{
                                            padding: '10px', borderRadius: '24px', background: 'var(--primary)', border: 'none',
                                            color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s',
                                            boxShadow: '0 4px 12px rgba(37,99,235,0.25)', marginTop: '8px'
                                        }}
                                    >
                                        Generate Round-Robin Fixtures
                                    </button>
                                )}
                            </div>
                        )}

                        {/* MODE: Manual Match scheduler */}
                        {schedulingMode === 'manual' && (
                            <form onSubmit={handleManualSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Division</label>
                                        <select
                                            value={selectedDivision}
                                            onChange={e => setSelectedDivision(e.target.value)}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="U14">U14</option>
                                            <option value="U16">U16</option>
                                            <option value="U19">U19</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Matchday</label>
                                        <select
                                            value={matchdayTerm}
                                            onChange={e => setMatchdayTerm(e.target.value)}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="Matchday 1">Matchday 1</option>
                                            <option value="Matchday 2">Matchday 2</option>
                                            <option value="Matchday 3">Matchday 3</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Home Team</label>
                                        <select
                                            value={manualHomeTeamId}
                                            onChange={e => setManualHomeTeamId(e.target.value)}
                                            required
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="">Select Home School...</option>
                                            {manualHomeTeamOptions.map(t => (
                                                <option key={t.id} value={t.id}>{getSchoolName(t.schoolId)} ({t.name})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Away Team</label>
                                        <select
                                            value={manualAwayTeamId}
                                            onChange={e => setManualAwayTeamId(e.target.value)}
                                            required
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="">Select Away School...</option>
                                            {manualAwayTeamOptions.map(t => (
                                                <option key={t.id} value={t.id}>{getSchoolName(t.schoolId)} ({t.name})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Match Date</label>
                                        <input
                                            type="date"
                                            value={manualDate}
                                            onChange={e => setManualDate(e.target.value)}
                                            required
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Match Ground Venue</label>
                                        <select
                                            value={selectedVenue}
                                            onChange={e => setSelectedVenue(e.target.value)}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            {DEFAULT_VENUES.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Assigned Referee</label>
                                        <select
                                            value={manualReferee}
                                            onChange={e => setManualReferee(e.target.value)}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            {DEFAULT_OFFICIALS.filter(o => o.role === 'Referee').map(o => (
                                                <option key={o.id} value={o.name}>{o.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Match Commissioner</label>
                                        <select
                                            value={manualCommissioner}
                                            onChange={e => setManualCommissioner(e.target.value)}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                        >
                                            {DEFAULT_OFFICIALS.filter(o => o.role === 'Commissioner').map(o => (
                                                <option key={o.id} value={o.name}>{o.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {manualSuccess && (
                                    <div style={{
                                        padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--success)', fontSize: '12px', fontWeight: '600', textAlign: 'center'
                                    }}>
                                        Match successfully scheduled!
                                    </div>
                                )}

                                {readOnly ? (
                                    <div style={{
                                        padding: '10px', borderRadius: '24px', background: 'rgba(56, 189, 248, 0.1)',
                                        border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', fontSize: '12px',
                                        fontWeight: '700', textAlign: 'center', marginTop: '8px'
                                    }}>
                                        Observer Mode (Match Scheduling Restricted)
                                    </div>
                                ) : (
                                    <button
                                        type="submit"
                                        style={{
                                            padding: '10px', borderRadius: '24px', background: 'var(--primary)', border: 'none',
                                            color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s',
                                            boxShadow: '0 4px 12px rgba(37,99,235,0.25)', marginTop: '8px'
                                        }}
                                    >
                                        Schedule Custom Fixture
                                    </button>
                                )}
                            </form>
                        )}
                    </div>

                    {/* Right side: List of scheduled/upcoming matches */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>Scheduled Fixtures</h3>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Currently scheduled and upcoming matches in the league</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {upcomingScheduledMatches.length === 0 ? (
                                <span style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px' }}>No matches currently scheduled. Use the generator or manual scheduler on the left to set up matches.</span>
                            ) : (
                                upcomingScheduledMatches.map(m => (
                                    <div
                                        key={m.id}
                                        style={{
                                            padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)',
                                            display: 'flex', flexDirection: 'column', gap: '4px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--primary-light)', fontWeight: '700' }}>
                                            <span>{m.ageGroup} Division ({m.matchday})</span>
                                            <span>{m.venue}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                            <span>{getSchoolName(m.homeTeamId).split(' ')[0]}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>vs</span>
                                            <span>{getSchoolName(m.awayTeamId).split(' ')[0]}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '4px' }}>
                                            <span>Ref: {m.referee}</span>
                                            <span>Comm: {m.commissioner}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            )}

            {/* TAB CONTENT: Standings */}
            {mainTab === 'standings' && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <LeagueTable matches={matches} schools={schools} onSelectSchool={onSelectSchool} selectedYear={selectedYear} />
                </div>
            )}

            {/* TAB CONTENT: Knockout */}
            {mainTab === 'knockouts' && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <KnockoutBrackets matches={matches} schools={schools} selectedTournament="PMC" />
                </div>
            )}

            {/* Fullscreen Expanded Verification Modal */}
            {isExpanded && activeSelectedMatch && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(3, 7, 18, 0.85)', backdropFilter: 'blur(8px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px'
                }}>
                    <div className="glass-panel" style={{
                        width: '100%', maxWidth: '1200px', height: '90vh',
                        display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <form onSubmit={handleApproveMatch} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                            {/* Modal Header */}
                            <div style={{ padding: '24px 30px', borderBottom: 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Match Verification &amp; Authorization Console
                                    </h2>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        {getSchoolName(activeSelectedMatch.homeTeamId)} vs {getSchoolName(activeSelectedMatch.awayTeamId)} · {activeSelectedMatch.matchday}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsExpanded(false)}
                                        style={{
                                            padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                                            background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-primary)',
                                            border: '1px solid rgba(255, 255, 255, 0.15)', cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                    >
                                        Close Expanded View
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '700' }}>Incident Assessment</label>
                                    <select
                                        value={incidentRating}
                                        onChange={e => setIncidentRating(e.target.value)}
                                        style={{ padding: '10px 14px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="1">1 - Safe / Peaceful</option>
                                        <option value="2">2 - Minor incidents</option>
                                        <option value="3">3 - Crowd warning issued</option>
                                        <option value="4">4 - High risk / Misconduct</option>
                                        <option value="5">5 - Critical issues / Interrupted</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '700' }}>Commissioner Summary Remarks</label>
                                    <textarea
                                        value={generalRemarks}
                                        onChange={e => setGeneralRemarks(e.target.value)}
                                        placeholder="Write detailed review notes and authorization remarks..."
                                        required
                                        style={{ height: '110px', padding: '12px 14px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)', fontSize: '14px', resize: 'none', outline: 'none', lineHeight: '1.5' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '700' }}>Digital Authorization Signature</label>
                                    <input
                                        type="text"
                                        value={commissionerSignature}
                                        onChange={e => setCommissionerSignature(e.target.value)}
                                        placeholder="Type your full official name to sign off..."
                                        required
                                        style={{ padding: '12px 14px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 'bold', outline: 'none' }}
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div style={{ padding: '20px 28px', borderTop: 'var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '14px', background: 'rgba(255,255,255,0.02)' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsExpanded(false)}
                                    style={{
                                        padding: '10px 24px', borderRadius: '24px', background: 'transparent',
                                        color: 'var(--text-muted)', border: 'var(--border)', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!commissionerSignature.trim() || !generalRemarks.trim()}
                                    style={{
                                        padding: '12px 36px', borderRadius: '24px', background: 'var(--success)', color: '#ffffff', border: 'none',
                                        fontWeight: '800', fontSize: '14px', cursor: 'pointer', opacity: (commissionerSignature.trim() && generalRemarks.trim()) ? 1 : 0.5,
                                        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
                                    }}
                                >
                                    Authorize Score &amp; Approve Standings
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Official Team Sheet Modal (Lineups & Rosters) */}
            {currentActiveCountdownMatch && (
                <CountdownSheetModal
                    match={currentActiveCountdownMatch}
                    allPlayers={allStudents}
                    schools={schools}
                    userRole="commissioner"
                    onClose={() => setActiveCountdownMatch(null)}
                    onUpdateMatch={(updatedMatch) => {
                        onUpdateMatch(updatedMatch);
                        setActiveCountdownMatch(updatedMatch);
                    }}
                    onApplyCorrection={(matchId, correctionData) => {
                        const squadKey = correctionData.teamSide === 'home' ? 'homeSquadSelection' : 'awaySquadSelection';
                        const currentSquad = currentActiveCountdownMatch[squadKey] || {};
                        const updatedSquad = {
                            ...(correctionData.updatedSquad || currentSquad),
                            lastModified: Date.now()
                        };
                        const updatedMatch = {
                            ...currentActiveCountdownMatch,
                            [squadKey]: updatedSquad,
                            preKickoffCorrections: [
                                ...(currentActiveCountdownMatch.preKickoffCorrections || []),
                                correctionData
                            ],
                            updatedAt: Date.now()
                        };
                        onUpdateMatch(updatedMatch);
                        setActiveCountdownMatch(updatedMatch);
                    }}
                />
            )}

            {/* Official Matchday Countdown Sheet Modal (Operational Protocol Table) */}
            {activeCountdownScheduleMatch && (
                <MatchdayCountdownSheetModal
                    match={activeCountdownScheduleMatch}
                    userRole="commissioner"
                    onClose={() => setActiveCountdownScheduleMatch(null)}
                    onUpdateMatch={(updatedMatch) => {
                        onUpdateMatch(updatedMatch);
                        setActiveCountdownScheduleMatch(updatedMatch);
                    }}
                />
            )}
        </div>
    );
}
