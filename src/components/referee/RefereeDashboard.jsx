import { useState, useMemo, useEffect } from 'react';
import LiveMatch from '../match/LiveMatch';
import CountdownSheetModal from '../match/CountdownSheetModal';
import MatchdayCountdownSheetModal from '../match/MatchdayCountdownSheetModal';
import EditMatchEventModal from '../match/EditMatchEventModal';
import {
    getRefereeContactSettings,
    saveRefereeContactSettings,
    sendTestRefereeNotification,
    requestRefereeNotificationPermission,
    playRefereeWhistleSound
} from '../../services/refereeNotificationService';
import { PMC_MATCHES } from '../../utils/pmcDataLoader';
import {
    editMatchEventState,
    overturnMatchEventState,
    recalculateMatchScores
} from '../../utils/matchEngine';

export default function RefereeDashboard({ 
    matches, 
    schools, 
    allPlayers, 
    year, 
    currentReferee = null, 
    selectedTournament = 'PMC',
    onSelectTournament,
    onUpdateMatch, 
    onOpenQuickTest,
    onLogout 
}) {
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'live'
    const [activeCountdownMatch, setActiveCountdownMatch] = useState(null);
    const [activeCountdownScheduleMatch, setActiveCountdownScheduleMatch] = useState(null);
    
    // Referee Form States
    const [misconductNotes, setMisconductNotes] = useState('');
    const [pitchCondition, setPitchCondition] = useState('Excellent');
    const [weatherCondition, setWeatherCondition] = useState('Sunny');
    const [refereeSummary, setRefereeSummary] = useState('');
    const [refereeSignature, setRefereeSignature] = useState(currentReferee?.name || '');
    const [reportSaved, setReportSaved] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [refereeCorrectionToast, setRefereeCorrectionToast] = useState(null);

    // Referee Post-Game Event Correction Handlers
    const handleSaveRefereeEvent = (eventId, updatedFields) => {
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
            editedBy: 'referee'
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

        setSelectedMatch(updatedMatch);
        if (onUpdateMatch) {
            onUpdateMatch(updatedMatch);
        }

        setEditingEvent(null);
        setRefereeCorrectionToast('Referee adjustment applied: scores and stats recalculated.');
        setTimeout(() => setRefereeCorrectionToast(null), 3500);
    };

    const handleOverturnRefereeEvent = (eventId, overturnReason) => {
        if (!selectedMatch) return;
        const now = Date.now();
        const outcome = overturnMatchEventState({
            playerStats: selectedMatch.playerStats || selectedMatch.liveState?.playerStats || {},
            timeline: selectedMatch.timeline || selectedMatch.liveState?.timeline || [],
            tombstoneEventIds: selectedMatch.tombstoneEventIds || [],
            eventId,
            overturnReason,
            overturnedBy: 'referee',
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

        const auditNote = `[Referee Review]: Overturned call (${overturnReason}).`;
        setRefereeSummary(prev => prev ? `${prev}\n${auditNote}` : auditNote);

        setSelectedMatch(updatedMatch);
        if (onUpdateMatch) {
            onUpdateMatch(updatedMatch);
        }

        setEditingEvent(null);
        setRefereeCorrectionToast(`Call overturned: ${overturnReason}`);
        setTimeout(() => setRefereeCorrectionToast(null), 3500);
    };

    // Referee Contact & Notification Settings State
    const [refereeSettings, setRefereeSettings] = useState(getRefereeContactSettings);
    const [emailInput, setEmailInput] = useState(() => currentReferee?.email || getRefereeContactSettings().refereeEmail || '');
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [pushPermission, setPushPermission] = useState('default');
    const [testAlertToast, setTestAlertToast] = useState(null);

    useEffect(() => {
        if ('Notification' in window) {
            setPushPermission(Notification.permission);
        }
    }, []);

    const handleSaveEmail = (e) => {
        e.preventDefault();
        const updated = saveRefereeContactSettings({ refereeEmail: emailInput });
        setRefereeSettings(updated);
        setIsEditingEmail(false);
    };

    const handleEnablePush = async () => {
        const res = await requestRefereeNotificationPermission();
        setPushPermission(res.status);
    };

    const handleSendTestAlert = async () => {
        const res = await sendTestRefereeNotification(emailInput);
        setTestAlertToast(`Test alert & whistle delivered to ${res.email}!`);
        setTimeout(() => setTestAlertToast(null), 4000);
    };

    const [searchQuery, setSearchQuery] = useState('');

    // Master Match Pool with PMC fallback
    const activeMatchPool = useMemo(() => {
        if (matches && matches.length > 0) return matches;
        return PMC_MATCHES || [];
    }, [matches]);

    // Get scheduled matches (Referee can kick these off)
    const scheduledMatches = useMemo(() => {
        return activeMatchPool.filter(m => m.status === 'upcoming' || m.status === 'scheduled');
    }, [activeMatchPool]);

    // Filter scheduled matches by search query
    const filteredScheduledMatches = useMemo(() => {
        if (!searchQuery.trim()) return scheduledMatches;
        const q = searchQuery.toLowerCase().trim();
        return scheduledMatches.filter(m => {
            const h = String(m.homeTeam || '').toLowerCase();
            const a = String(m.awayTeam || '').toLowerCase();
            const v = String(m.venue || '').toLowerCase();
            const r = String(m.round || m.matchday || '').toLowerCase();
            return h.includes(q) || a.includes(q) || v.includes(q) || r.includes(q);
        });
    }, [scheduledMatches, searchQuery]);

    // Get matches waiting for Referee Reports (completed matches)
    const pendingMatches = useMemo(() => {
        return activeMatchPool.filter(m => m.status === 'completed');
    }, [activeMatchPool]);

    // Get live matches
    const liveMatches = useMemo(() => {
        return activeMatchPool.filter(m => m.status === 'live');
    }, [activeMatchPool]);

    const getSchoolObj = (schoolId) => {
        if (!schoolId) return null;
        let sc = schools?.find(s => s.id === schoolId || s.rawId === schoolId);
        if (sc) return sc;
        if (typeof schoolId === 'string') {
            const baseId = schoolId.includes('-team-') ? schoolId.split('-team-')[0] : schoolId.split('_')[0];
            sc = schools?.find(s => s.id === baseId || s.rawId === baseId);
            if (sc) return sc;
            sc = schools?.find(s => s.name?.toLowerCase() === schoolId.toLowerCase());
            if (sc) return sc;
        }
        return null;
    };

    const getSchoolName = (schoolId, matchObj) => {
        if (!schoolId && !matchObj) return 'Unknown Team';
        
        if (matchObj) {
            if (matchObj.homeTeamId === schoolId && matchObj.homeTeam && typeof matchObj.homeTeam === 'string' && !matchObj.homeTeam.includes('-team-') && !matchObj.homeTeam.startsWith('s1-') && !matchObj.homeTeam.startsWith('s2-') && !matchObj.homeTeam.startsWith('s3-')) {
                return matchObj.homeTeam;
            }
            if (matchObj.awayTeamId === schoolId && matchObj.awayTeam && typeof matchObj.awayTeam === 'string' && !matchObj.awayTeam.includes('-team-') && !matchObj.awayTeam.startsWith('s1-') && !matchObj.awayTeam.startsWith('s2-') && !matchObj.awayTeam.startsWith('s3-')) {
                return matchObj.awayTeam;
            }
        }

        const sc = getSchoolObj(schoolId);
        if (sc?.name) {
            if (typeof schoolId === 'string' && schoolId.includes('-team-')) {
                const ageGroup = schoolId.split('-team-')[1];
                if (ageGroup && ageGroup !== 'PMC') {
                    return `${sc.name} (${ageGroup})`;
                }
            }
            return sc.name;
        }

        if (matchObj) {
            if (matchObj.homeTeamId === schoolId && matchObj.homeTeam) return matchObj.homeTeam;
            if (matchObj.awayTeamId === schoolId && matchObj.awayTeam) return matchObj.awayTeam;
        }

        if (typeof schoolId === 'string') {
            return schoolId
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

    const handleSelectMatch = (match) => {
        setSelectedMatch(match);
        
        if (match.status === 'live') {
            setViewMode('live');
        } else {
            setViewMode('list');
            setMisconductNotes(match.refereeReport?.misconductNotes || '');
            setPitchCondition(match.refereeReport?.pitchCondition || 'Excellent');
            setWeatherCondition(match.refereeReport?.weatherCondition || 'Sunny');
            setRefereeSummary(match.refereeReport?.refereeSummary || '');
            setRefereeSignature(match.refereeReport?.refereeSignature || '');
            setReportSaved(false);
        }
    };

    const handleKickOff = (match) => {
        const homeSquadReady = !!match.homeSquadSelection;
        const awaySquadReady = !!match.awaySquadSelection;

        if (!homeSquadReady || !awaySquadReady) {
            alert(`Cannot kick off — squads pending:\n${!homeSquadReady ? '• Home team squad not submitted\n' : ''}${!awaySquadReady ? '• Away team squad not submitted' : ''}`);
            return;
        }

        // Blow whistle audio on kick-off
        playRefereeWhistleSound();

        onUpdateMatch({
            ...match,
            status: 'live',
            liveState: match.liveState || {
                isRunning: true,
                startTime: Date.now(),
                elapsedOffset: 0,
                period: '1H',
                playerStats: {},
                timeline: []
            }
        });
    };

    const handleSubmitReport = (e) => {
        e.preventDefault();
        if (!refereeSignature.trim()) return;

        const updatedMatch = {
            ...selectedMatch,
            status: 'refereed',
            refereeReport: {
                misconductNotes,
                pitchCondition,
                weatherCondition,
                refereeSummary,
                refereeSignature,
                submittedAt: new Date().toISOString()
            }
        };

        onUpdateMatch(updatedMatch);
        setReportSaved(true);
        setSelectedMatch(null);
        setTimeout(() => setReportSaved(false), 3000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', height: '100%', minHeight: 0 }}>

            {/* ── Top Referee Notification & Gmail Dispatch Control Center ── */}
            <div className="glass-panel" style={{
                padding: '16px 20px', borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '800', color: '#ffffff' }}>
                                Referee Direct Notification &amp; Gmail Alert Dispatcher
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                ● Live Dispatch Active
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <span>Target Gmail:</span>
                            {isEditingEmail ? (
                                <form onSubmit={handleSaveEmail} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <input
                                        type="email"
                                        value={emailInput}
                                        onChange={e => setEmailInput(e.target.value)}
                                        placeholder="Enter your Gmail..."
                                        style={{
                                            background: 'rgba(0,0,0,0.4)', border: '1px solid #6366f1',
                                            borderRadius: '6px', padding: '3px 10px', color: '#ffffff', fontSize: '12px', outline: 'none'
                                        }}
                                        autoFocus
                                    />
                                    <button type="submit" style={{ padding: '3px 10px', borderRadius: '6px', background: '#10b981', color: '#fff', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                                        Save
                                    </button>
                                    <button type="button" onClick={() => setIsEditingEmail(false)} style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: 'none', fontSize: '11px', cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                </form>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong style={{ color: '#a5b4fc' }}>{refereeSettings.refereeEmail}</strong>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingEmail(true)}
                                        style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                                    >
                                        Change Gmail
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {testAlertToast && (
                        <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '700' }}>
                            {testAlertToast}
                        </span>
                    )}

                    {pushPermission !== 'granted' ? (
                        <button
                            type="button"
                            onClick={handleEnablePush}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                                background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            Enable Phone Screen Push
                        </button>
                    ) : (
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#4ade80', background: 'rgba(34,197,94,0.12)', padding: '4px 10px', borderRadius: '8px' }}>
                            Phone Push Enabled
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={handleSendTestAlert}
                        style={{
                            padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#ffffff', border: 'none', cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        Send Test Alert
                    </button>

                    {currentReferee && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#fbbf24' }}>{currentReferee.name}</span>
                        </div>
                    )}

                    {onLogout && (
                        <button
                            type="button"
                            onClick={onLogout}
                            style={{
                                padding: '6px 12px', borderRadius: '8px',
                                background: 'rgba(244,63,94,0.15)', color: '#f43f5e',
                                border: '1px solid rgba(244,63,94,0.3)', fontSize: '11.5px', fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Log Out
                        </button>
                    )}
                </div>
            </div>

            {/* ── Main Layout: Schedule + Match Area ───────────────────────── */}
            <div style={{ display: 'flex', gap: '20px', width: '100%', flex: 1, minHeight: 0 }}>
            
            {/* Left side: Pending matches list */}
            <div className="glass-panel" style={{ width: '380px', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: 'var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>Referee Schedule</h3>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kick off matches, officiate, or submit reports</span>
                        </div>
                    </div>

                    {/* Tournament Switcher for Referee */}
                    {onSelectTournament && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <button
                                    type="button"
                                    onClick={() => onSelectTournament('PMC')}
                                    style={{
                                        flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800',
                                        background: selectedTournament === 'PMC' ? '#FFC726' : 'transparent',
                                        color: selectedTournament === 'PMC' ? '#00267F' : 'rgba(255,255,255,0.6)',
                                        border: 'none', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                >
                                    🏆 PMC Cup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSelectTournament('NSSL')}
                                    style={{
                                        flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800',
                                        background: selectedTournament === 'NSSL' ? 'rgba(56,189,248,0.2)' : 'transparent',
                                        color: selectedTournament === 'NSSL' ? '#38bdf8' : 'rgba(255,255,255,0.6)',
                                        border: selectedTournament === 'NSSL' ? '1px solid rgba(56,189,248,0.4)' : 'none',
                                        cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                >
                                    🧪 Schools League
                                </button>
                            </div>

                            {selectedTournament === 'NSSL' && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: '800', color: '#38bdf8', background: 'rgba(56,189,248,0.12)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.25)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#38bdf8' }}></span>
                                        Testing Sandbox
                                    </span>
                                    {onOpenQuickTest && (
                                        <button
                                            type="button"
                                            onClick={onOpenQuickTest}
                                            style={{
                                                padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: '800',
                                                background: '#0284c7', color: '#ffffff', border: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            + Test Fixture
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Fixture Search Bar */}
                    <div style={{ position: 'relative' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="🔍 Search teams (e.g. Wotton, Benfica)..."
                            style={{
                                width: '100%', padding: '6px 10px', borderRadius: '8px',
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-primary)', fontSize: '12px', outline: 'none'
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px'
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {reportSaved && (
                        <div style={{
                            padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--success)', fontSize: '12px', fontWeight: '600', textAlign: 'center'
                        }}>
                            ✓ Match report submitted successfully!
                        </div>
                    )}

                    {/* Scheduled Matches — Kick Off Section */}
                    {filteredScheduledMatches.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingLeft: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#60a5fa', textTransform: 'uppercase' }}>
                                    Scheduled — Awaiting Kick-Off ({filteredScheduledMatches.length})
                                </span>
                            </div>
                            {filteredScheduledMatches.map(m => {
                                const homeSquadReady = !!m.homeSquadSelection;
                                const awaySquadReady = !!m.awaySquadSelection;
                                const bothReady = homeSquadReady && awaySquadReady;
                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            padding: '14px', borderRadius: '10px',
                                            background: 'rgba(255,255,255,0.01)',
                                            border: '1px solid rgba(96,165,250,0.15)',
                                            display: 'flex', flexDirection: 'column', gap: '8px',
                                            marginBottom: '8px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--primary-light)', fontWeight: '700' }}>
                                            <span>{m.ageGroup || m.division || 'Match'}</span>
                                            <span style={{ color: '#60a5fa' }}>{m.time || m.kickoff || 'Scheduled'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                            <span>{getSchoolName(m.homeTeamId, m)}</span>
                                            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                VS
                                            </span>
                                            <span>{getSchoolName(m.awayTeamId, m)}</span>
                                        </div>

                                                            {/* Squad Readiness Badges & Notification Indicator */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: homeSquadReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: homeSquadReady ? 'var(--success)' : 'var(--warning)', border: `1px solid ${homeSquadReady ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                                    {homeSquadReady ? 'Ready' : 'Pending'} · Home
                                                </span>
                                                <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: awaySquadReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: awaySquadReady ? 'var(--success)' : 'var(--warning)', border: `1px solid ${awaySquadReady ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                                    {awaySquadReady ? 'Ready' : 'Pending'} · Away
                                                </span>
                                            </div>
                                            {bothReady && (
                                                <span style={{ fontSize: '10px', color: '#4ade80', fontWeight: '800', background: 'rgba(34,197,94,0.12)', padding: '2px 6px', borderRadius: '6px' }}>
                                                    Alert Sent
                                                </span>
                                            )}
                                        </div>

                                        {/* Action Buttons: Team Sheet, Countdown & Kick Off */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveCountdownMatch(m)}
                                                title="Official Team Lineup Sheet"
                                                style={{
                                                    padding: '8px 8px', borderRadius: '8px',
                                                    background: 'rgba(37,99,235,0.12)',
                                                    color: '#60a5fa',
                                                    border: '1px solid rgba(37,99,235,0.3)',
                                                    fontWeight: '700', fontSize: '11px',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                                }}
                                            >
                                                📋 Team Sheet
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveCountdownScheduleMatch(m)}
                                                title="Matchday Operational Countdown Protocol"
                                                style={{
                                                    padding: '8px 8px', borderRadius: '8px',
                                                    background: 'rgba(255,199,38,0.12)',
                                                    color: '#FFC726',
                                                    border: '1px solid rgba(255,199,38,0.3)',
                                                    fontWeight: '700', fontSize: '11px',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                                }}
                                            >
                                                ⏱️ Countdown
                                            </button>
                                            <button
                                                onClick={() => handleKickOff(m)}
                                                disabled={!bothReady}
                                                style={{
                                                    padding: '8px 10px', borderRadius: '8px',
                                                    background: bothReady ? 'var(--success)' : 'rgba(255,255,255,0.03)',
                                                    color: bothReady ? '#fff' : 'var(--text-muted)',
                                                    border: bothReady ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                                    fontWeight: '800', fontSize: '11.5px',
                                                    cursor: bothReady ? 'pointer' : 'not-allowed',
                                                    opacity: bothReady ? 1 : 0.6,
                                                    boxShadow: bothReady ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {bothReady ? 'Whistle Kick Off' : 'Waiting Squads'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {liveMatches.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px' }}>Live Matches</div>
                            {liveMatches.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => handleSelectMatch(m)}
                                    style={{
                                        padding: '14px', borderRadius: '10px', background: selectedMatch?.id === m.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)',
                                        border: selectedMatch?.id === m.id ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(16, 185, 129, 0.15)',
                                        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.15s',
                                        marginBottom: '8px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--primary-light)', fontWeight: '700' }}>
                                        <span>{m.ageGroup} Division</span>
                                        <span style={{ color: 'var(--success)' }}>LIVE</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                        <span>{getSchoolName(m.homeTeamId, m)}</span>
                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                                            {m.homeScore} - {m.awayScore}
                                        </span>
                                        <span>{getSchoolName(m.awayTeamId, m)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px', marginTop: liveMatches.length > 0 ? '8px' : '0' }}>Awaiting Report</div>
                    {pendingMatches.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            No pending referee reports.
                        </div>
                    ) : (
                        pendingMatches.map(m => (
                            <div
                                key={m.id}
                                onClick={() => handleSelectMatch(m)}
                                style={{
                                    padding: '14px', borderRadius: '10px', background: selectedMatch?.id === m.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)',
                                    border: selectedMatch?.id === m.id ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.03)',
                                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.15s',
                                    marginBottom: '8px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--primary-light)', fontWeight: '700' }}>
                                    <span>{m.ageGroup} Division</span>
                                    <span>{m.matchday}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    <span>{getSchoolName(m.homeTeamId, m)}</span>
                                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                                        {m.homeScore} - {m.awayScore}
                                    </span>
                                    <span>{getSchoolName(m.awayTeamId, m)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right side: Report input form or Live Match */}
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden', minHeight: 0 }}>
                {selectedMatch ? (
                    viewMode === 'live' ? (
                        <div style={{ flex: 1, position: 'relative', height: '100%', overflowY: 'auto' }}>
                            <LiveMatch
                                matchData={matches.find(m => m.id === selectedMatch.id) || selectedMatch}
                                allStudents={allPlayers}
                                year={year}
                                isRefereeMode={true}
                                onUpdateMatch={onUpdateMatch}
                                onEndMatch={(res) => { 
                                    const completed = { ...res, status: 'completed' };
                                    onUpdateMatch(completed); 
                                    handleSelectMatch(completed);
                                }}
                            />
                        </div>
                    ) : (
                    <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                        <div style={{ padding: '20px 24px', borderBottom: 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    Official Referee Match Report
                                </h3>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {getSchoolName(selectedMatch.homeTeamId)} vs {getSchoolName(selectedMatch.awayTeamId)}
                                </span>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.08)', padding: '4px 10px', borderRadius: '20px' }}>
                                Status: Awaiting Report
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Official Match Events Ledger & Post-Game Audit */}
                            <div style={{
                                padding: '16px',
                                borderRadius: '10px',
                                background: 'rgba(255,255,255,0.02)',
                                border: 'var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                Official Match Events Ledger & Post-Game Audit
                                            </span>
                                            <span style={{
                                                fontSize: '10px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                background: 'rgba(56, 189, 248, 0.12)',
                                                color: '#38bdf8',
                                                fontWeight: '700'
                                            }}>
                                                {(selectedMatch.timeline || selectedMatch.liveState?.timeline || []).length} Events
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            Review calls recorded by statistician. If you changed or overturned a call on pitch, edit or overturn it before submitting report.
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            fontSize: '12px',
                                            fontWeight: '800',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: '#34d399',
                                            border: '1px solid rgba(16, 185, 129, 0.2)'
                                        }}>
                                            Score: {selectedMatch.homeScore ?? 0} - {selectedMatch.awayScore ?? 0}
                                        </div>
                                    </div>
                                </div>

                                {(!selectedMatch.timeline || selectedMatch.timeline.length === 0) && (!selectedMatch.liveState?.timeline || selectedMatch.liveState.timeline.length === 0) ? (
                                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                        No timeline events logged for this match.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                                        {(selectedMatch.timeline || selectedMatch.liveState?.timeline || []).map((evt, idx) => {
                                            const isOverturned = !!evt.overturned;
                                            return (
                                                <div
                                                    key={evt.id || idx}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '10px 14px',
                                                        borderRadius: '8px',
                                                        background: isOverturned ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255,255,255,0.03)',
                                                        border: isOverturned ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(255,255,255,0.06)',
                                                        opacity: isOverturned ? 0.7 : 1,
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: '800', color: '#38bdf8', width: '32px', fontSize: '12px' }}>
                                                            {evt.minute ? `${evt.minute}'` : `${evt.time || '-'}`}
                                                        </span>
                                                        <span style={{
                                                            fontWeight: '700',
                                                            fontSize: '12px',
                                                            color: 'var(--text-primary)',
                                                            textDecoration: isOverturned ? 'line-through' : 'none'
                                                        }}>
                                                            {evt.type === 'goal' ? '⚽ Goal' :
                                                             evt.type === 'yellow_card' ? '🟨 Yellow Card' :
                                                             evt.type === 'red_card' ? '🟥 Red Card' :
                                                             evt.type === 'penalty' ? '🎯 Penalty' :
                                                             evt.type === 'save' ? '🧤 Save' :
                                                             evt.type === 'shot' ? '⚡ Shot' :
                                                             evt.type || evt.event || 'Event'}
                                                        </span>
                                                        {evt.playerName && (
                                                            <span style={{
                                                                color: 'var(--text-secondary)',
                                                                fontSize: '12px',
                                                                textDecoration: isOverturned ? 'line-through' : 'none'
                                                            }}>
                                                                — {evt.playerName}
                                                            </span>
                                                        )}
                                                        {evt.assistingPlayerName && !isOverturned && (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                                                (assist: {evt.assistingPlayerName})
                                                            </span>
                                                        )}
                                                        {isOverturned && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: '800',
                                                                color: '#fbbf24',
                                                                background: 'rgba(245, 158, 11, 0.2)',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(245, 158, 11, 0.35)'
                                                            }}>
                                                                CALL OVERTURNED: {evt.overturnReason || 'Referee Disallowed'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: '700',
                                                            color: evt.teamSide === 'home' || evt.team === 'home' ? '#60a5fa' : '#f472b6',
                                                            background: evt.teamSide === 'home' || evt.team === 'home' ? 'rgba(96, 165, 250, 0.1)' : 'rgba(244, 114, 182, 0.1)',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px'
                                                        }}>
                                                            {(evt.teamSide || evt.team || 'Team').toUpperCase()}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title="Edit event details or overturn/rescind this call"
                                                            onClick={() => setEditingEvent(evt)}
                                                            style={{
                                                                padding: '5px 12px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(56, 189, 248, 0.15)',
                                                                color: '#38bdf8',
                                                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <span>✏️</span> Edit / Overturn Call
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Conditions */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Pitch Ground Condition</label>
                                    <select
                                        value={pitchCondition}
                                        onChange={e => setPitchCondition(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="Excellent">Excellent</option>
                                        <option value="Good">Good / Playable</option>
                                        <option value="Muddy">Muddy / Heavy</option>
                                        <option value="Waterlogged">Waterlogged</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Weather Condition</label>
                                    <select
                                        value={weatherCondition}
                                        onChange={e => setWeatherCondition(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="Sunny">Sunny / Clear</option>
                                        <option value="Overcast">Overcast / Windy</option>
                                        <option value="Raining">Heavy Rain</option>
                                        <option value="Humid">Humid / Hot</option>
                                    </select>
                                </div>
                            </div>

                            {/* Misconduct */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Disciplinary & Misconduct Notes</label>
                                <textarea
                                    value={misconductNotes}
                                    onChange={e => setMisconductNotes(e.target.value)}
                                    placeholder="Log details of yellow/red cards, player cautions, or team manager warnings..."
                                    style={{
                                        height: '70px', padding: '10px 12px', borderRadius: '8px', border: 'var(--border)',
                                        background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', resize: 'none', outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Summary */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Match Summary / Overview</label>
                                <textarea
                                    value={refereeSummary}
                                    onChange={e => setRefereeSummary(e.target.value)}
                                    placeholder="Enter a brief narrative of the match, incident descriptions, or notable details..."
                                    required
                                    style={{
                                        height: '110px', padding: '10px 12px', borderRadius: '8px', border: 'var(--border)',
                                        background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '13px', resize: 'none', outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Digital Sign off */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '16px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Referee Authorization Signature</label>
                                <input
                                    type="text"
                                    value={refereeSignature}
                                    onChange={e => setRefereeSignature(e.target.value)}
                                    placeholder="Type your official name to sign off..."
                                    required
                                    style={{
                                        padding: '10px 12px', borderRadius: '8px', border: 'var(--border)',
                                        background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold', outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Submit Footer */}
                        <div style={{ padding: '16px 24px', borderTop: 'var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255,255,255,0.01)' }}>
                            <button
                                type="submit"
                                disabled={!refereeSignature.trim() || !refereeSummary.trim()}
                                style={{
                                    padding: '8px 24px', borderRadius: '20px', background: 'var(--primary)',
                                    color: '#ffffff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                                    opacity: (refereeSignature.trim() && refereeSummary.trim()) ? 1 : 0.5,
                                    boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
                                }}
                            >
                                Submit & Sign Report
                            </button>
                        </div>
                    </form>
                    )
                ) : (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px', flexDirection: 'column', gap: '8px' }}>
                        <span>Select a match from the pending queue to write the referee report</span>
                    </div>
                )}
            </div>

            </div>
            {/* Official Team Sheet Modal for Referees */}
            {activeCountdownMatch && (
                <CountdownSheetModal
                    match={activeCountdownMatch}
                    allPlayers={allPlayers}
                    schools={schools}
                    userRole="referee"
                    onClose={() => setActiveCountdownMatch(null)}
                    onUpdateMatch={(updatedMatch) => {
                        onUpdateMatch(updatedMatch);
                        setActiveCountdownMatch(updatedMatch);
                    }}
                    onApplyCorrection={(matchId, correctionData) => {
                        const squadKey = correctionData.teamSide === 'home' ? 'homeSquadSelection' : 'awaySquadSelection';
                        const currentSquad = activeCountdownMatch[squadKey] || {};
                        const updatedSquad = {
                            ...(correctionData.updatedSquad || currentSquad),
                            lastModified: Date.now()
                        };
                        const updatedMatch = {
                            ...activeCountdownMatch,
                            [squadKey]: updatedSquad,
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

            {/* Matchday Operational Countdown Schedule Modal for Referees */}
            {activeCountdownScheduleMatch && (
                <MatchdayCountdownSheetModal
                    match={activeCountdownScheduleMatch}
                    userRole="referee"
                    onClose={() => setActiveCountdownScheduleMatch(null)}
                    onUpdateMatch={(updatedMatch) => {
                        onUpdateMatch(updatedMatch);
                        setActiveCountdownScheduleMatch(updatedMatch);
                    }}
                />
            )}

            {/* Referee Post-Match Edit / Overturn Call Modal */}
            {editingEvent && (
                <EditMatchEventModal
                    isOpen={!!editingEvent}
                    event={editingEvent}
                    match={selectedMatch}
                    allPlayers={allPlayers}
                    userRole="referee"
                    onSave={handleSaveRefereeEvent}
                    onOverturn={handleOverturnRefereeEvent}
                    onClose={() => setEditingEvent(null)}
                />
            )}

            {/* Referee Correction Toast Notification */}
            {refereeCorrectionToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 10001,
                    background: 'rgba(16, 185, 129, 0.95)',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    fontWeight: '800',
                    fontSize: '13px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span>✓</span> {refereeCorrectionToast}
                </div>
            )}
        </div>
    );
}
