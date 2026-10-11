import { useState, useMemo, useEffect } from 'react';
import LiveMatch from '../match/LiveMatch';
import EditMatchEventModal from '../match/EditMatchEventModal';
import {
    getRefereeContactSettings,
    saveRefereeContactSettings,
    sendDataLoggerMatchReadyNotification,
    playDataLoggerAlertChime,
    triggerDeviceNotification
} from '../../services/refereeNotificationService';
import { getAnalystAccounts } from '../../data/analystAccounts';
import { PMC_MATCHES, PMC_STUDENTS } from '../../utils/pmcDataLoader';
import { resolvePlayer, resolvePlayerName, createPlayerLookupMap } from '../../utils/playerResolver';
import {
    editMatchEventState,
    overturnMatchEventState,
    recalculateMatchScores
} from '../../utils/matchEngine';

function resolveTeamRosterIds(match, side, allPlayers, year) {
    if (!match) return [];
    const explicitRoster = side === 'home' ? match.homePlayers : match.awayPlayers;
    if (Array.isArray(explicitRoster) && explicitRoster.length > 0) {
        return explicitRoster;
    }
    const targetTeamName = (side === 'home' ? match.homeTeam : match.awayTeam) || '';
    const targetTeamId = (side === 'home' ? match.homeTeamId : match.awayTeamId) || '';
    const cleanId = (targetTeamId || '').replace(/-team-(pmc|ucl|boys|girls|u\d+)/gi, '').toLowerCase();
    const nameLower = targetTeamName.toLowerCase();
    const pool = (allPlayers && allPlayers.length > 0) ? allPlayers : PMC_STUDENTS;

    const roster = pool.filter(s => {
        const sSchool = (s.schoolId || s.clubId || '').toLowerCase();
        const sTeam = (s.teamAssignments?.[year || match.year || '2026-2027'] || '').toLowerCase();
        return (
            (cleanId && sSchool === cleanId) ||
            (targetTeamId && sSchool === targetTeamId.toLowerCase()) ||
            (targetTeamId && sTeam === targetTeamId.toLowerCase()) ||
            (cleanId && sTeam.includes(cleanId)) ||
            (nameLower && s.schoolName?.toLowerCase().includes(nameLower)) ||
            (nameLower && s.clubName?.toLowerCase().includes(nameLower))
        );
    }).map(s => s.id);

    return roster;
}

export default function StatisticianDashboard({
    matches = [],
    schools = [],
    allPlayers = [],
    year = '2026-2027',
    currentAnalyst = null,
    initialDirectMatchId = null,
    onClearDirectMatchId = () => {},
    selectedTournament = 'PMC',
    onSelectTournament,
    onUpdateMatch,
    onEndMatch,
    onOpenQuickTest,
    onLogout
}) {
    const [selectedMatchId, setSelectedMatchId] = useState(() => initialDirectMatchId || null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTab, setFilterTab] = useState('all'); // 'all' | 'assigned'
    const [loggerToast, setLoggerToast] = useState(null);
    const [editingEvent, setEditingEvent] = useState(null);
    const [postMatchEditToast, setPostMatchEditToast] = useState(null);

    const activeAnalyst = useMemo(() => {
        return currentAnalyst || getAnalystAccounts()[0];
    }, [currentAnalyst]);

    const isMasterLogger = useMemo(() => {
        return activeAnalyst?.isMasterLogger === true ||
               activeAnalyst?.username === 'johnathan' ||
               activeAnalyst?.username === 'jonathan' ||
               activeAnalyst?.id === 'analyst_johnathan' ||
               activeAnalyst?.id === 'analyst_jonathan' ||
               activeAnalyst?.username === 'noah' ||
               activeAnalyst?.id === 'analyst_noah';
    }, [activeAnalyst]);

    const dataLoggerEmail = activeAnalyst?.email || 'statistician.pmcup@gmail.com';

    // Auto-select match if arriving via deep link (initialDirectMatchId)
    useEffect(() => {
        if (initialDirectMatchId) {
            setSelectedMatchId(initialDirectMatchId);
            onClearDirectMatchId();
        }
    }, [initialDirectMatchId, onClearDirectMatchId]);

    const getSchoolObj = (schoolId) => {
        if (!schoolId) return null;
        return schools?.find(s => 
            s.id === schoolId || 
            s.rawId === schoolId ||
            (typeof schoolId === 'string' && (
                s.id === schoolId.replace('-team-PMC', '') || 
                s.id === schoolId.split('_')[0] ||
                s.name?.toLowerCase() === schoolId.toLowerCase()
            ))
        ) || null;
    };

    const getTeamName = (teamOrSchoolId, matchTeamProp) => {
        if (matchTeamProp && matchTeamProp !== 'Team') return matchTeamProp;
        if (!teamOrSchoolId) return 'Team';
        const sc = getSchoolObj(teamOrSchoolId);
        if (sc?.name) return sc.name;
        if (typeof teamOrSchoolId === 'string') {
            const clean = teamOrSchoolId
                .replace('-team-PMC', '')
                .replace('pmc-club-', 'Club ')
                .replace(/_/g, ' ');
            return clean;
        }
        return 'Team';
    };

    // Master Match Pool with PMC fallback
    const activeMatchPool = useMemo(() => {
        if (matches && matches.length > 0) return matches;
        return PMC_MATCHES || [];
    }, [matches]);

    // Keep live selected match synchronized with latest matches state
    const selectedMatch = useMemo(() => {
        if (!selectedMatchId) return null;
        return activeMatchPool.find(m => m.id === selectedMatchId) || null;
    }, [activeMatchPool, selectedMatchId]);

    const playerLookupMap = useMemo(() => {
        return createPlayerLookupMap(allPlayers, selectedMatch);
    }, [allPlayers, selectedMatch]);

    const handleSendTestLoggerAlert = async () => {
        try {
            playDataLoggerAlertChime();
            triggerDeviceNotification(`Live Data Capture Alert: ${activeAnalyst?.name}`, {
                body: `Test signal delivered to ${dataLoggerEmail}. Real-time event capture alerts online!`,
                tag: 'logger-test'
            });
            await sendDataLoggerMatchReadyNotification(
                { id: 'TEST-LOGGER', venue: activeAnalyst?.venue || 'National Stadium', matchday: 'Matchday 1', homeSquadSelection: { formation: '4-3-3' }, awaySquadSelection: { formation: '4-2-3-1' } },
                'UWI Blackbirds',
                'Weymouth Wales',
                allPlayers,
                dataLoggerEmail
            );
            setLoggerToast(`Alert signal & deep link sent to ${dataLoggerEmail}!`);
            setTimeout(() => setLoggerToast(null), 4000);
        } catch (e) {
            console.warn('Logger test alert warning:', e);
        }
    };

    // Filter matches by search query (team name or venue)
    const filteredMatches = useMemo(() => {
        let list = activeMatchPool;

        if (filterTab === 'assigned' && activeAnalyst) {
            const assignedIds = activeAnalyst.assignedMatchIds || [];
            const venueKeyword = activeAnalyst.venue ? activeAnalyst.venue.toLowerCase().split(' ')[0] : '';
            list = list.filter(m => {
                if (assignedIds.includes(m.id)) return true;
                if (venueKeyword && m.venue && m.venue.toLowerCase().includes(venueKeyword)) return true;
                return false;
            });
            // If no matches directly matched assigned venue, show all matches so analyst is never stuck
            if (list.length === 0) {
                list = activeMatchPool;
            }
        }

        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(m => {
            const homeName = getSchoolObj(m.homeTeamId)?.name || m.homeTeam || '';
            const awayName = getSchoolObj(m.awayTeamId)?.name || m.awayTeam || '';
            const venue = m.venue || '';
            return homeName.toLowerCase().includes(q) || awayName.toLowerCase().includes(q) || venue.toLowerCase().includes(q);
        });
    }, [activeMatchPool, schools, searchQuery, filterTab, activeAnalyst]);

    // Categorize matches
    const liveMatches = useMemo(() => filteredMatches.filter(m => m.status === 'live'), [filteredMatches]);
    const upcomingMatches = useMemo(() => filteredMatches.filter(m => m.status === 'upcoming' || m.status === 'scheduled'), [filteredMatches]);
    const completedMatches = useMemo(() => filteredMatches.filter(m => m.status === 'completed' || m.status === 'refereed'), [filteredMatches]);

    // When an analyst clicks a match
    const handleSelectMatch = (match) => {
        setSelectedMatchId(match.id);
    };

    // Force Start Match (Field Override if referee whistled on pitch)
    const handleForceStartLiveCapture = (match) => {
        const now = Date.now();
        const updated = {
            ...match,
            status: 'live',
            currentHalf: '1H',
            matchTime: '00:00',
            homeScore: match.homeScore || 0,
            awayScore: match.awayScore || 0,
            timeline: match.timeline || [],
            updatedAt: now
        };
        if (onUpdateMatch) onUpdateMatch(updated);
        setSelectedMatchId(match.id);
    };

    // ── Operator Post-Match Event Correction Handlers ──
    const handleSavePostMatchEvent = (eventId, updatedFields) => {
        if (!selectedMatch) return;
        const now = Date.now();
        const outcome = editMatchEventState({
            playerStats: selectedMatch.playerStats || selectedMatch.liveState?.playerStats || {},
            timeline: selectedMatch.timeline || selectedMatch.liveState?.timeline || [],
            tombstoneEventIds: selectedMatch.tombstoneEventIds || [],
            eventId,
            updatedFields,
            now,
            seq: (selectedMatch.version || 0) + 1,
            editedBy: 'operator'
        });

        if (!outcome.edited) return;

        const { homeScore, awayScore } = recalculateMatchScores(selectedMatch, outcome.playerStats, outcome.timeline);

        const updatedMatch = {
            ...selectedMatch,
            playerStats: outcome.playerStats,
            timeline: outcome.timeline,
            tombstoneEventIds: outcome.tombstoneEventIds,
            homeScore,
            awayScore,
            updatedAt: now,
            version: (selectedMatch.version || 0) + 1
        };

        if (updatedMatch.liveState) {
            updatedMatch.liveState = {
                ...updatedMatch.liveState,
                playerStats: outcome.playerStats,
                timeline: outcome.timeline,
                homeScore,
                awayScore,
                updatedAt: now
            };
        }

        if (onUpdateMatch) {
            onUpdateMatch(updatedMatch);
        }

        setEditingEvent(null);
        setPostMatchEditToast('Event updated & match scores recalculated!');
        setTimeout(() => setPostMatchEditToast(null), 3500);
    };

    const handleOverturnPostMatchEvent = (eventId, overturnReason) => {
        if (!selectedMatch) return;
        const now = Date.now();
        const outcome = overturnMatchEventState({
            playerStats: selectedMatch.playerStats || selectedMatch.liveState?.playerStats || {},
            timeline: selectedMatch.timeline || selectedMatch.liveState?.timeline || [],
            tombstoneEventIds: selectedMatch.tombstoneEventIds || [],
            eventId,
            overturnReason,
            overturnedBy: 'operator',
            now,
            seq: (selectedMatch.version || 0) + 1,
            removeCompletely: false
        });

        if (!outcome.overturned) return;

        const { homeScore, awayScore } = recalculateMatchScores(selectedMatch, outcome.playerStats, outcome.timeline);

        const updatedMatch = {
            ...selectedMatch,
            playerStats: outcome.playerStats,
            timeline: outcome.timeline,
            tombstoneEventIds: outcome.tombstoneEventIds,
            homeScore,
            awayScore,
            updatedAt: now,
            version: (selectedMatch.version || 0) + 1
        };

        if (updatedMatch.liveState) {
            updatedMatch.liveState = {
                ...updatedMatch.liveState,
                playerStats: outcome.playerStats,
                timeline: outcome.timeline,
                homeScore,
                awayScore,
                updatedAt: now
            };
        }

        if (onUpdateMatch) {
            onUpdateMatch(updatedMatch);
        }

        setEditingEvent(null);
        setPostMatchEditToast('Referee call overturned & stats reverted!');
        setTimeout(() => setPostMatchEditToast(null), 3500);
    };

    // ── Selected Match View (Active Live Match, Post-Match Concluded Station, OR Pre-Kickoff Waiting Room) ──
    if (selectedMatch) {
        const isMatchCompleted = selectedMatch.status === 'completed' || selectedMatch.status === 'refereed' || selectedMatch.status === 'approved' || selectedMatch.isFinished === true;
        const isMatchLive = selectedMatch.status === 'live' && !isMatchCompleted;
        const homeSchool = getSchoolObj(selectedMatch.homeTeamId);
        const awaySchool = getSchoolObj(selectedMatch.awayTeamId);
        const homeName = getTeamName(selectedMatch.homeTeamId, selectedMatch.homeTeam);
        const awayName = getTeamName(selectedMatch.awayTeamId, selectedMatch.awayTeam);
        const homeRoster = resolveTeamRosterIds(selectedMatch, 'home', allPlayers, year);
        const awayRoster = resolveTeamRosterIds(selectedMatch, 'away', allPlayers, year);

        const homeXI = (selectedMatch.homeSquadSelection?.startingXI && selectedMatch.homeSquadSelection.startingXI.filter(Boolean).length > 0)
            ? selectedMatch.homeSquadSelection.startingXI.filter(Boolean)
            : homeRoster.slice(0, 11);
        const homeBench = (selectedMatch.homeSquadSelection?.benchPlayers && selectedMatch.homeSquadSelection.benchPlayers.filter(Boolean).length > 0)
            ? selectedMatch.homeSquadSelection.benchPlayers.filter(Boolean)
            : homeRoster.slice(11);

        const awayXI = (selectedMatch.awaySquadSelection?.startingXI && selectedMatch.awaySquadSelection.startingXI.filter(Boolean).length > 0)
            ? selectedMatch.awaySquadSelection.startingXI.filter(Boolean)
            : awayRoster.slice(0, 11);
        const awayBench = (selectedMatch.awaySquadSelection?.benchPlayers && selectedMatch.awaySquadSelection.benchPlayers.filter(Boolean).length > 0)
            ? selectedMatch.awaySquadSelection.benchPlayers.filter(Boolean)
            : awayRoster.slice(11);

        const homeFormation = selectedMatch.homeSquadSelection?.formation || '4-3-3';
        const awayFormation = selectedMatch.awaySquadSelection?.formation || '4-3-3';
        const timelineEvents = selectedMatch.timeline || [];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                {/* Top Navigation Bar */}
                <div style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '12px 20px', background: 'rgba(15, 23, 42, 0.9)', borderBottom: '1px solid rgba(255,255,255,0.1)',
                    marginBottom: '12px', borderRadius: '12px'
                }}>
                    <button
                        onClick={() => setSelectedMatchId(null)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 16px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.08)', color: '#ffffff',
                            border: '1px solid rgba(255,255,255,0.15)', fontSize: '13px', fontWeight: '700',
                            cursor: 'pointer'
                        }}
                    >
                        ← Back to Match Fixtures
                    </button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {isMatchLive ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '5px 14px', borderRadius: '20px', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }}></span>
                                    LIVE DATA CAPTURE ACTIVE
                                </span>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(99,102,241,0.3)' }}>
                                    🛡️ Official Source: Super-Admin Validated Squads
                                </span>
                            </div>
                        ) : isMatchCompleted ? (
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', padding: '5px 14px', borderRadius: '20px', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                MATCH CONCLUDED · FULL TIME
                            </span>
                        ) : (
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#fbbf24', background: 'rgba(245,158,11,0.15)', padding: '5px 14px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                WAITING FOR REFEREE KICK-OFF
                            </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ fontSize: '14px' }}>{activeAnalyst.avatar}</span>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8' }}>{activeAnalyst.name}</span>
                        </div>

                        {onLogout && (
                            <button
                                onClick={onLogout}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px',
                                    background: 'rgba(244,63,94,0.15)', color: '#f43f5e',
                                    border: '1px solid rgba(244,63,94,0.3)', fontSize: '12px', fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Log Out
                            </button>
                        )}
                    </div>
                </div>

                {/* Condition 1: If Match is LIVE -> Render Live Data Capture Console */}
                {isMatchLive ? (
                    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        <LiveMatch
                            matchData={selectedMatch}
                            match={selectedMatch}
                            schools={schools}
                            allStudents={allPlayers}
                            allPlayers={allPlayers}
                            year={year}
                            currentAnalyst={activeAnalyst}
                            onCancel={() => setSelectedMatchId(null)}
                            onUpdateMatch={(updated) => {
                                if (onUpdateMatch) onUpdateMatch(updated);
                            }}
                            onEndMatch={(finalData) => {
                                if (onUpdateMatch) onUpdateMatch(finalData);
                                if (onEndMatch) onEndMatch(finalData);
                            }}
                        />
                    </div>
                ) : isMatchCompleted ? (
                    /* Condition 2: If Match is COMPLETED / REFEREED -> Render Post-Match Summary & Notification Station */
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
                        {/* Match Concluded Hero Notification */}
                        <div className="glass-panel" style={{
                            padding: '28px', borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,27,75,0.5))',
                            border: '1px solid rgba(165,180,252,0.3)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px'
                        }}>
                            <div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                    Match Concluded · Whistled Full Time by Referee
                                </span>
                                
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', margin: '14px 0', flexWrap: 'wrap' }}>
                                    <div style={{ textAlign: 'right', minWidth: '150px' }}>
                                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>{homeName}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Home</div>
                                    </div>
                                    <div style={{
                                        fontSize: '32px', fontWeight: '900', color: '#ffffff',
                                        background: 'rgba(255,255,255,0.08)', padding: '8px 24px', borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.15)', letterSpacing: '3px'
                                    }}>
                                        {selectedMatch.homeScore ?? 0} - {selectedMatch.awayScore ?? 0}
                                    </div>
                                    <div style={{ textAlign: 'left', minWidth: '150px' }}>
                                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>{awayName}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Away</div>
                                    </div>
                                </div>

                                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', maxWidth: '620px', margin: '0 auto', lineHeight: 1.6 }}>
                                    The referee has concluded this match and disabled live event recording. All logged stats, shots, and timeline entries are safely preserved in the tournament records.
                                </p>
                            </div>

                            {/* Status & Meta Badges */}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.08)', fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>
                                    Venue: {selectedMatch.venue || activeAnalyst.venue || 'National Stadium'}
                                </span>
                                <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.08)', fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>
                                    Events Logged: {timelineEvents.length}
                                </span>
                                <span style={{
                                    padding: '6px 14px', borderRadius: '20px',
                                    background: selectedMatch.status === 'approved' ? 'rgba(34,197,94,0.15)' : selectedMatch.status === 'refereed' ? 'rgba(56,189,248,0.15)' : 'rgba(245,158,11,0.15)',
                                    border: `1px solid ${selectedMatch.status === 'approved' ? 'rgba(34,197,94,0.3)' : selectedMatch.status === 'refereed' ? 'rgba(56,189,248,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                    fontSize: '12px', fontWeight: '700',
                                    color: selectedMatch.status === 'approved' ? '#4ade80' : selectedMatch.status === 'refereed' ? '#38bdf8' : '#fbbf24'
                                }}>
                                    {selectedMatch.status === 'approved'
                                        ? 'Status: Verified & Locked by Commissioner'
                                        : selectedMatch.status === 'refereed'
                                        ? 'Status: Referee Signed · Awaiting Commissioner Audit'
                                        : 'Status: Completed · Awaiting Referee Sign-Off'}
                                </span>
                            </div>

                            <div style={{ marginTop: '8px' }}>
                                <button
                                    onClick={() => setSelectedMatchId(null)}
                                    style={{
                                        padding: '10px 22px', borderRadius: '10px',
                                        background: 'rgba(255,255,255,0.1)', color: '#ffffff',
                                        border: '1px solid rgba(255,255,255,0.2)', fontSize: '13px', fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ← Return to Match Fixtures Queue
                                </button>
                            </div>
                        </div>

                        {/* Logged Timeline Events Recap */}
                        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    Live Match Event Ledger ({timelineEvents.length} Events)
                                </h3>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Recorded by Data Logger
                                </span>
                            </div>

                            {timelineEvents.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                    No live timeline events were logged for this fixture.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                                    {timelineEvents.map((evt, idx) => (
                                        <div key={evt.id || idx} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '8px 12px', borderRadius: '8px',
                                            background: evt.overturned ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255,255,255,0.03)',
                                            border: evt.overturned ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(255,255,255,0.05)',
                                            fontSize: '12px', opacity: evt.overturned ? 0.65 : 1
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontWeight: '800', color: '#38bdf8', width: '32px' }}>
                                                    {evt.minute ? `${evt.minute}'` : `${evt.time || '-'}`}
                                                </span>
                                                <span style={{ fontWeight: '700', color: 'var(--text-primary)', textDecoration: evt.overturned ? 'line-through' : 'none' }}>
                                                    {evt.type || evt.event || 'Event'}
                                                </span>
                                                {evt.playerName && (
                                                    <span style={{ color: 'var(--text-secondary)', textDecoration: evt.overturned ? 'line-through' : 'none' }}>
                                                        — {evt.playerName}
                                                    </span>
                                                )}
                                                {evt.overturned && (
                                                    <span style={{
                                                        fontSize: '10px', fontWeight: '800', color: '#fbbf24',
                                                        background: 'rgba(245, 158, 11, 0.2)', padding: '2px 6px', borderRadius: '4px',
                                                        border: '1px solid rgba(245, 158, 11, 0.3)'
                                                    }}>
                                                        OVERTURNED: {evt.overturnReason || 'Ref Call Change'}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {evt.teamSide ? evt.teamSide.toUpperCase() : ''}
                                                </span>
                                                <button
                                                    title="Edit event details or overturn call"
                                                    onClick={() => setEditingEvent(evt)}
                                                    style={{
                                                        padding: '4px 10px', borderRadius: '6px',
                                                        background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8',
                                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                                        fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}
                                                >
                                                    <span>✏️</span> Edit / Overturn
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Verified Team Sheets Preview */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                            {/* Home Squad */}
                            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '4px solid #22c55e' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {homeSchool?.logo && <img src={homeSchool.logo} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />}
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{homeName}</h3>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                                        Formation: {homeFormation}
                                    </span>
                                </div>

                                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Starting XI ({homeXI.length} Players):
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {homeXI.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '8px' }}>No starters registered in lineup.</div>
                                    ) : (
                                        homeXI.map((pId, idx) => {
                                            const p = resolvePlayer(pId, allPlayers, playerLookupMap, selectedMatch?.homeTeamId);
                                            const name = resolvePlayerName(p || pId, allPlayers, playerLookupMap, '', selectedMatch?.homeTeamId);
                                            const rawNum = parseInt(String(pId).replace(/\D/g, ''), 10);
                                            const jersey = p?.jerseyNumber || (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 1 : idx + 1);
                                            return (
                                                <div key={pId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{idx + 1}. {name}</span>
                                                    <span style={{ fontWeight: '700', color: '#4ade80' }}>#{jersey}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' }}>
                                    Substitutes Bench ({homeBench.length} Players):
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                                    {homeBench.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '6px' }}>No substitutes registered.</div>
                                    ) : (
                                        homeBench.map((pId, idx) => {
                                            const p = resolvePlayer(pId, allPlayers, playerLookupMap, selectedMatch?.homeTeamId);
                                            const name = resolvePlayerName(p || pId, allPlayers, playerLookupMap, '', selectedMatch?.homeTeamId);
                                            const rawNum = parseInt(String(pId).replace(/\D/g, ''), 10);
                                            const jersey = p?.jerseyNumber || (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 12 : idx + 12);
                                            return (
                                                <div key={pId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{idx + 12}. {name}</span>
                                                    <span style={{ fontWeight: '700', color: 'rgba(74, 222, 128, 0.7)' }}>#{jersey}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Away Squad */}
                            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '4px solid #38bdf8' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {awaySchool?.logo && <img src={awaySchool.logo} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />}
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{awayName}</h3>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                                        Formation: {awayFormation}
                                    </span>
                                </div>

                                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Starting XI ({awayXI.length} Players):
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {awayXI.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '8px' }}>No starters registered in lineup.</div>
                                    ) : (
                                        awayXI.map((pId, idx) => {
                                            const p = resolvePlayer(pId, allPlayers, playerLookupMap, selectedMatch?.awayTeamId);
                                            const name = resolvePlayerName(p || pId, allPlayers, playerLookupMap, '', selectedMatch?.awayTeamId);
                                            const rawNum = parseInt(String(pId).replace(/\D/g, ''), 10);
                                            const jersey = p?.jerseyNumber || (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 1 : idx + 1);
                                            return (
                                                <div key={pId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{idx + 1}. {name}</span>
                                                    <span style={{ fontWeight: '700', color: '#38bdf8' }}>#{jersey}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' }}>
                                    Substitutes Bench ({awayBench.length} Players):
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                                    {awayBench.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '6px' }}>No substitutes registered.</div>
                                    ) : (
                                        awayBench.map((pId, idx) => {
                                            const p = resolvePlayer(pId, allPlayers, playerLookupMap, selectedMatch?.awayTeamId);
                                            const name = resolvePlayerName(p || pId, allPlayers, playerLookupMap, '', selectedMatch?.awayTeamId);
                                            const rawNum = parseInt(String(pId).replace(/\D/g, ''), 10);
                                            const jersey = p?.jerseyNumber || (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 12 : idx + 12);
                                            return (
                                                <div key={pId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{idx + 12}. {name}</span>
                                                    <span style={{ fontWeight: '700', color: 'rgba(56, 189, 248, 0.7)' }}>#{jersey}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Condition 3: If Match is NOT LIVE & NOT COMPLETED (i.e. UPCOMING) -> Render Pre-Kickoff Waiting Room */
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
                        {/* Waiting Room Hero Banner */}
                        <div className="glass-panel" style={{
                            padding: '28px', borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,58,138,0.4))',
                            border: '1px solid rgba(56,189,248,0.3)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px'
                        }}>
                            <div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    Match Live Readiness Room · Deep Link Station
                                </span>
                                <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#ffffff', margin: '6px 0' }}>
                                    {homeName} vs {awayName}
                                </h1>
                                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', maxWidth: '580px', margin: '0 auto' }}>
                                    Both teams have submitted their Starting XIs. The Match Referee has been notified with the team sheets. As soon as the referee blows the whistle to start the match on their device, this capture console will automatically activate.
                                </p>
                            </div>

                            {/* Match Meta Badges */}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.08)', fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>
                                    Venue: {selectedMatch.venue || activeAnalyst.venue || 'National Stadium'}
                                </span>
                                <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.08)', fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>
                                    Kickoff: {selectedMatch.time || selectedMatch.kickoff || '18:00'}
                                </span>
                                <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', fontSize: '12px', fontWeight: '700', color: '#38bdf8' }}>
                                    Assigned Analyst: {activeAnalyst.name} ({activeAnalyst.email})
                                </span>
                            </div>

                            {/* Live Pulse Indicator */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 20px', borderRadius: '30px',
                                background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 10px #fbbf24' }}></span>
                                <span style={{ fontSize: '12.5px', color: '#fbbf24', fontWeight: '700' }}>
                                    Stationed pitchside · Live sync listening for referee whistle...
                                </span>
                            </div>

                            {/* Match Start Action - Exclusively Controlled by Jonathan (Master Logger) */}
                            <div style={{ marginTop: '8px' }}>
                                {isMasterLogger ? (
                                    <button
                                        onClick={() => handleForceStartLiveCapture(selectedMatch)}
                                        style={{
                                            padding: '12px 24px', borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#ffffff',
                                            border: 'none', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                                            boxShadow: '0 4px 18px rgba(34, 197, 94, 0.4)',
                                            display: 'flex', alignItems: 'center', gap: '8px'
                                        }}
                                    >
                                        👑 Lead Match Controller · Initiate Match Kick-off &amp; Capture
                                    </button>
                                ) : (
                                    <div style={{
                                        padding: '10px 18px', borderRadius: '10px',
                                        background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                                        color: '#38bdf8', fontSize: '12.5px', fontWeight: '700',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}>
                                        <span>🔒</span> Official Kick-off &amp; Clock Controlled by Lead Match Controller (Jonathan Cumberbatch)
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Verified Team Sheets Preview */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                            {/* Home Squad */}
                            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '4px solid #22c55e' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {homeSchool?.logo && <img src={homeSchool.logo} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />}
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{homeName}</h3>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                                        Formation: {homeFormation}
                                    </span>
                                </div>

                                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Confirmed Starting XI ({homeXI.length} Players):
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                                    {homeXI.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '8px' }}>No players registered in lineup yet.</div>
                                    ) : (
                                        homeXI.map((pId, idx) => {
                                            const p = resolvePlayer(pId, allPlayers, playerLookupMap, selectedMatch?.homeTeamId);
                                            const name = resolvePlayerName(p || pId, allPlayers, playerLookupMap, '', selectedMatch?.homeTeamId);
                                            const rawNum = parseInt(String(pId).replace(/\D/g, ''), 10);
                                            const jersey = p?.jerseyNumber || (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 1 : idx + 1);
                                            return (
                                                <div key={pId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{idx + 1}. {name}</span>
                                                    <span style={{ fontWeight: '700', color: '#4ade80' }}>#{jersey}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Away Squad */}
                            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '4px solid #38bdf8' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {awaySchool?.logo && <img src={awaySchool.logo} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />}
                                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{awayName}</h3>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                                        Formation: {awayFormation}
                                    </span>
                                </div>

                                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Confirmed Starting XI ({awayXI.length} Players):
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                                    {awayXI.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '8px' }}>No players registered in lineup yet.</div>
                                    ) : (
                                        awayXI.map((pId, idx) => {
                                            const p = resolvePlayer(pId, allPlayers, playerLookupMap, selectedMatch?.awayTeamId);
                                            const name = resolvePlayerName(p || pId, allPlayers, playerLookupMap, '', selectedMatch?.awayTeamId);
                                            const rawNum = parseInt(String(pId).replace(/\D/g, ''), 10);
                                            const jersey = p?.jerseyNumber || (Number.isFinite(rawNum) && rawNum > 0 ? (rawNum % 22) + 1 : idx + 1);
                                            return (
                                                <div key={pId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{idx + 1}. {name}</span>
                                                    <span style={{ fontWeight: '700', color: '#38bdf8' }}>#{jersey}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Operator Post-Match Edit / Overturn Modal */}
                {editingEvent && (
                    <EditMatchEventModal
                        isOpen={!!editingEvent}
                        event={editingEvent}
                        match={selectedMatch}
                        allPlayers={allPlayers}
                        userRole="operator"
                        onSave={handleSavePostMatchEvent}
                        onOverturn={handleOverturnPostMatchEvent}
                        onClose={() => setEditingEvent(null)}
                    />
                )}

                {/* Post-match toast notification */}
                {postMatchEditToast && (
                    <div style={{
                        position: 'fixed', bottom: '24px', right: '24px', zIndex: 10001,
                        background: 'rgba(16, 185, 129, 0.95)', color: '#ffffff',
                        padding: '12px 20px', borderRadius: '10px', fontWeight: '800', fontSize: '13px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <span>✓</span> {postMatchEditToast}
                    </div>
                )}
            </div>
        );
    }

    // ── Main Statistician Match Dashboard ─────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', height: '100%', padding: '4px' }}>
            {/* Header Banner */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.85))' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '32px' }}>{activeAnalyst.avatar}</span>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h1 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                                    {activeAnalyst.name}
                                </h1>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.3)' }}>
                                    {activeAnalyst.venue}
                                </span>
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                Field Live Data Analyst · Logged in as <strong style={{ color: '#a5b4fc' }}>{dataLoggerEmail}</strong>
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                style={{
                                    padding: '10px 20px', borderRadius: '10px',
                                    background: 'rgba(244,63,94,0.15)', color: '#f43f5e',
                                    border: '1px solid rgba(244,63,94,0.3)', fontSize: '13px', fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Switch Account / Log Out
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Tabs & Search Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {onSelectTournament && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <button
                                    type="button"
                                    onClick={() => onSelectTournament('PMC')}
                                    style={{
                                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                        background: selectedTournament === 'PMC' ? '#FFC726' : 'transparent',
                                        color: selectedTournament === 'PMC' ? '#00267F' : 'rgba(255,255,255,0.7)',
                                        border: 'none', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                >
                                    🏆 PMC Cup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSelectTournament('NSSL')}
                                    style={{
                                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                        background: selectedTournament === 'NSSL' ? 'rgba(56,189,248,0.2)' : 'transparent',
                                        color: selectedTournament === 'NSSL' ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                                        border: selectedTournament === 'NSSL' ? '1px solid rgba(56,189,248,0.4)' : '1px solid transparent',
                                        cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                >
                                    🧪 Schools League
                                </button>
                            </div>

                            {selectedTournament === 'NSSL' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#38bdf8', background: 'rgba(56,189,248,0.12)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(56,189,248,0.25)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }}></span>
                                        Testing Sandbox · Firewalled
                                    </span>
                                    {onOpenQuickTest && (
                                        <button
                                            type="button"
                                            onClick={onOpenQuickTest}
                                            style={{
                                                padding: '6px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '800',
                                                background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#ffffff',
                                                border: '1px solid rgba(56,189,248,0.4)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                            }}
                                        >
                                            + Add Test Fixture
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <button
                            type="button"
                            onClick={() => setFilterTab('all')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                background: filterTab === 'all' ? 'rgba(255,255,255,0.15)' : 'transparent',
                                color: filterTab === 'all' ? '#ffffff' : 'rgba(255,255,255,0.7)',
                                border: 'none', cursor: 'pointer'
                            }}
                        >
                            All Tournament Fixtures ({activeMatchPool.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('assigned')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '800',
                                background: filterTab === 'assigned' ? 'rgba(56,189,248,0.25)' : 'transparent',
                                color: filterTab === 'assigned' ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                                border: filterTab === 'assigned' ? '1px solid rgba(56,189,248,0.4)' : 'none',
                                cursor: 'pointer'
                            }}
                        >
                            My Assigned Venue
                        </button>
                    </div>

                    <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by club, school, or venue..."
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                background: 'rgba(3, 7, 18, 0.65)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#ffffff',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* Email Dispatch Notification Status Bar */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
                    padding: '10px 16px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Notification Destination: </span>
                        <strong style={{ color: '#a5b4fc' }}>{dataLoggerEmail}</strong>
                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '2px 6px', borderRadius: '8px' }}>
                            ● FormSubmit Deep-Link Relay Online
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {loggerToast && (
                            <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '700' }}>
                                {loggerToast}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleSendTestLoggerAlert}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#ffffff',
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            Test My Deep-Link Alert
                        </button>
                    </div>
                </div>
            </div>

            {/* Match Listings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' }}>
                
                {/* 1. Live Matches Section */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }}></span>
                        <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                            Active Matches In Progress ({liveMatches.length})
                        </h2>
                    </div>

                    {liveMatches.length === 0 ? (
                        <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                            No active matches currently in progress. Select an upcoming match below to enter the live waiting room.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                            {liveMatches.map(m => {
                                const homeSchool = getSchoolObj(m.homeTeamId);
                                const awaySchool = getSchoolObj(m.awayTeamId);
                                return (
                                    <div key={m.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(34,197,94,0.04)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '4px 10px', borderRadius: '20px' }}>
                                                LIVE NOW · {m.venue || 'Kensington Oval'}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                                                {m.group || m.division || 'Group Stage'}
                                            </span>
                                        </div>

                                        {/* Teams & Score */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                                {homeSchool?.logo && <img src={homeSchool.logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />}
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{getTeamName(m.homeTeamId, m.homeTeam)}</span>
                                            </div>

                                            <div style={{ padding: '6px 16px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', fontSize: '18px', fontWeight: '800', color: '#4ade80' }}>
                                                {m.homeScore ?? 0} - {m.awayScore ?? 0}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{getTeamName(m.awayTeamId, m.awayTeam)}</span>
                                                {awaySchool?.logo && <img src={awaySchool.logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleSelectMatch(m)}
                                            style={{
                                                width: '100%', padding: '12px', borderRadius: '10px',
                                                background: '#22c55e', color: '#ffffff', border: 'none',
                                                fontWeight: '800', fontSize: '13px', cursor: 'pointer',
                                                boxShadow: '0 4px 16px rgba(34, 197, 94, 0.3)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                            }}
                                        >
                                            Enter Live Data Capture Console
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. Registered Scheduled Fixtures */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                            Upcoming Match Fixtures ({upcomingMatches.length})
                        </h2>
                    </div>

                    {upcomingMatches.length === 0 ? (
                        <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                            No upcoming scheduled matches found in this view.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                            {upcomingMatches.map(m => {
                                const homeSchool = getSchoolObj(m.homeTeamId);
                                const awaySchool = getSchoolObj(m.awayTeamId);
                                const homeSquadReady = !!m.homeSquadSelection;
                                const awaySquadReady = !!m.awaySquadSelection;
                                const bothReady = homeSquadReady && awaySquadReady;

                                return (
                                    <div key={m.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#60a5fa', background: 'rgba(96,165,250,0.12)', padding: '4px 10px', borderRadius: '20px' }}>
                                                Scheduled · {m.kickoff || m.time || '18:00'}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                                                {m.venue || 'Turf Location'}
                                            </span>
                                        </div>

                                        {/* Teams */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                                {homeSchool?.logo && <img src={homeSchool.logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />}
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{getTeamName(m.homeTeamId, m.homeTeam)}</span>
                                            </div>

                                            <div style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                                                VS
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{getTeamName(m.awayTeamId, m.awayTeam)}</span>
                                                {awaySchool?.logo && <img src={awaySchool.logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />}
                                            </div>
                                        </div>

                                        {/* Squad Readiness Badges */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: homeSquadReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: homeSquadReady ? 'var(--success)' : 'var(--warning)', border: `1px solid ${homeSquadReady ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                                {homeSquadReady ? 'Ready' : 'Pending'} Home Squad
                                            </span>
                                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: awaySquadReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: awaySquadReady ? 'var(--success)' : 'var(--warning)', border: `1px solid ${awaySquadReady ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                                {awaySquadReady ? 'Ready' : 'Pending'} Away Squad
                                            </span>
                                            {bothReady && (
                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '3px 10px', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.3)' }}>
                                                    SQUADS SUBMITTED
                                                </span>
                                            )}
                                        </div>

                                        {bothReady ? (
                                            <button
                                                onClick={() => handleSelectMatch(m)}
                                                style={{
                                                    padding: '11px 16px', borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff',
                                                    border: 'none', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer',
                                                    boxShadow: '0 4px 14px rgba(14,165,233,0.35)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                Open Live Match Readiness Room
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleSelectMatch(m)}
                                                style={{
                                                    padding: '10px 16px', borderRadius: '8px',
                                                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                                }}
                                            >
                                                Preview Fixture &amp; Lineups
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 3. Completed Matches Section */}
                {completedMatches.length > 0 && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                                Completed Matches ({completedMatches.length})
                            </h2>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                            {completedMatches.map(m => {
                                const homeSchool = getSchoolObj(m.homeTeamId);
                                const awaySchool = getSchoolObj(m.awayTeamId);
                                return (
                                    <div key={m.id} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.85 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {homeSchool?.logo && <img src={homeSchool.logo} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />}
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{getTeamName(m.homeTeamId, m.homeTeam)}</span>
                                            <span style={{ fontSize: '14px', fontWeight: '800', color: '#4ade80' }}>{m.homeScore ?? 0} - {m.awayScore ?? 0}</span>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{getTeamName(m.awayTeamId, m.awayTeam)}</span>
                                            {awaySchool?.logo && <img src={awaySchool.logo} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />}
                                        </div>
                                        <button
                                            onClick={() => setSelectedMatchId(m.id)}
                                            style={{
                                                padding: '6px 12px', borderRadius: '6px',
                                                background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                                border: '1px solid rgba(255,255,255,0.1)', fontSize: '12px', fontWeight: '700',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            View Match Summary
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
