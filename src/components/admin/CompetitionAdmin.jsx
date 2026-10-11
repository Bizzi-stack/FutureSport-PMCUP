import { useState, useMemo } from 'react';
import LeagueTable from '../LeagueTable';
import KnockoutBrackets from '../KnockoutBrackets';
import CompetitionStats from '../CompetitionStats';
import {
    sendCoachSquadReminderNotification,
    sendRefereeSquadNotification,
    sendDataLoggerMatchReadyNotification
} from '../../services/refereeNotificationService';

const DEFAULT_VENUES = [
    { id: 'v1', name: 'Harrison College Field', status: 'Available' },
    { id: 'v2', name: 'Queens College Arena', status: 'Available' },
    { id: 'v3', name: 'National Stadium', status: 'Available' },
    { id: 'v4', name: 'Combermere Grounds', status: 'Maintenance' },
];

const DEFAULT_OFFICIALS = [
    { id: 'off1', name: 'Michael Beckles', role: 'Referee' },
    { id: 'off2', name: 'Wren', role: 'Match Commissioner' },
    { id: 'off3', name: 'Dave Yearwood', role: 'Referee' },
    { id: 'off4', name: 'Karen Thorne', role: 'Match Commissioner' },
    { id: 'off5', name: 'Adrian Hunte', role: 'Referee' },
];

export default function CompetitionAdmin({ schools, teams, matches = [], allStudents = [], year, onAddMatches, onUpdateMatch, selectedTournament, readOnly = false }) {
    const [activeSubTab, setActiveSubTab] = useState('divisions'); // 'divisions' | 'squadValidation' | 'alerts' | 'standings' | 'stats' | 'knockout' | 'venues'
    const [adminAlertToast, setAdminAlertToast] = useState(null);

    // Group teams by division/age group
    const divisionGroups = useMemo(() => {
        const safeTeams = teams || [];
        const PMC = safeTeams.filter(t => t && (t.ageGroup === 'PMC' || (typeof t.name === 'string' && t.name.includes('PMC'))));
        const U14 = safeTeams.filter(t => t && (t.ageGroup === 'U14' || (typeof t.name === 'string' && t.name.includes('U14'))));
        const U16 = safeTeams.filter(t => t && (t.ageGroup === 'U16' || (typeof t.name === 'string' && t.name.includes('U16'))));
        const U19 = safeTeams.filter(t => t && (t.ageGroup === 'U19' || (typeof t.name === 'string' && t.name.includes('U19'))));
        return { PMC, U14, U16, U19 };
    }, [teams]);

    const getSchoolName = (schoolId, fallbackMatchTeam = null) => {
        if (fallbackMatchTeam && typeof fallbackMatchTeam === 'string' && fallbackMatchTeam !== 'Home Team' && fallbackMatchTeam !== 'Away Team') {
            return fallbackMatchTeam;
        }
        const sc = (schools || []).find(s => s.id === schoolId || s.rawId === schoolId);
        return sc ? sc.name : 'Team';
    };

    // Calculate count of submitted squads pending Super-Admin validation
    const pendingSquadsCount = useMemo(() => {
        return (matches || []).filter(m => {
            const hPending = m?.homeSquadSelection && m.homeSquadSelection.validationStatus !== 'approved';
            const aPending = m?.awaySquadSelection && m.awaySquadSelection.validationStatus !== 'approved';
            return hPending || aPending;
        }).length;
    }, [matches]);

    // Prioritize and push pending validation / live running matches to the FRONT
    const prioritizedSquadMatches = useMemo(() => {
        const submitted = (matches || []).filter(m => m && (m.homeSquadSelection || m.awaySquadSelection));
        return [...submitted].sort((a, b) => {
            const aHPending = a.homeSquadSelection && a.homeSquadSelection.validationStatus !== 'approved';
            const aAPending = a.awaySquadSelection && a.awaySquadSelection.validationStatus !== 'approved';
            const aHasPending = aHPending || aAPending;

            const bHPending = b.homeSquadSelection && b.homeSquadSelection.validationStatus !== 'approved';
            const bAPending = b.awaySquadSelection && b.awaySquadSelection.validationStatus !== 'approved';
            const bHasPending = bHPending || bAPending;

            const aIsLiveOrUpcoming = a.status === 'live' || a.status === 'upcoming' || a.status === 'scheduled';
            const bIsLiveOrUpcoming = b.status === 'live' || b.status === 'upcoming' || b.status === 'scheduled';

            // 1. Matches with pending submissions come first
            if (aHasPending && !bHasPending) return -1;
            if (!aHasPending && bHasPending) return 1;

            // 2. Active / Live running matches come next
            if (aIsLiveOrUpcoming && !bIsLiveOrUpcoming) return -1;
            if (!aIsLiveOrUpcoming && bIsLiveOrUpcoming) return 1;

            return 0;
        });
    }, [matches]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', height: '100%', minHeight: 0 }}>
            
            {/* Feedback Toast Banner */}
            {adminAlertToast && (
                <div style={{
                    padding: '12px 20px', borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff', fontWeight: '800', fontSize: '13px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
                    animation: 'fadeIn 0.2s ease-in'
                }}>
                    <span>{adminAlertToast}</span>
                    <button onClick={() => setAdminAlertToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
            )}

            {/* Sub-navigation Tabs */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: 'var(--border)', paddingBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                    { key: 'divisions', label: 'Divisions & Teams' },
                    { 
                        key: 'squadValidation', 
                        label: `🛡️ Squad Validation Station ${pendingSquadsCount > 0 ? `(${pendingSquadsCount} Pending)` : ''}`,
                        highlight: pendingSquadsCount > 0
                    },
                    { key: 'alerts', label: 'Match Operations & Alerts' },
                    { key: 'standings', label: 'League Standings' },
                    { key: 'stats', label: 'Competition Stats' },
                    { key: 'knockout', label: 'Knockouts' },
                    { key: 'venues', label: 'Venues & Officials' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveSubTab(tab.key)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                            background: activeSubTab === tab.key 
                                ? 'rgba(37,99,235,0.18)' 
                                : tab.highlight ? 'rgba(245,158,11,0.12)' : 'transparent',
                            color: activeSubTab === tab.key 
                                ? 'var(--primary-light)' 
                                : tab.highlight ? '#fbbf24' : 'var(--text-secondary)',
                            border: activeSubTab === tab.key 
                                ? '1px solid rgba(37,99,235,0.35)' 
                                : tab.highlight ? '1px solid rgba(245,158,11,0.35)' : '1px solid transparent',
                            cursor: 'pointer', transition: 'all 0.2s', outline: 'none'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Switcher */}
            <div style={{ flex: 1, minHeight: 0 }}>
                {activeSubTab === 'divisions' && (
                    <div style={{ display: 'grid', gridTemplateColumns: selectedTournament === 'PMC' || divisionGroups.PMC.length > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '20px' }}>
                        {(selectedTournament === 'PMC' || divisionGroups.PMC.length > 0 ? ['PMC', 'U14', 'U16', 'U19'] : ['U14', 'U16', 'U19']).map(div => {
                            const list = divisionGroups[div] || [];
                            if (list.length === 0 && div !== 'PMC' && selectedTournament === 'PMC') return null;
                            return (
                                <div key={div} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 'var(--border)', paddingBottom: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                            {div === 'PMC' ? "PMC Senior Division" : `${div} Division`}
                                        </h3>
                                        <span style={{ fontSize: '11px', color: 'var(--primary-light)', background: 'rgba(37,99,235,0.1)', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>
                                            {list.length} Teams
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                                        {list.map(team => (
                                            <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)', borderRadius: '8px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{getSchoolName(team.schoolId)}</span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {team.id}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeSubTab === 'venues' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Venues Panel */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', borderBottom: 'var(--border)', paddingBottom: '8px' }}>Venues Directory</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {DEFAULT_VENUES.map(venue => (
                                    <div key={venue.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{venue.name}</span>
                                        </div>
                                        <span style={{
                                            fontSize: '10px', fontWeight: '800', padding: '3px 8px', borderRadius: '20px',
                                            background: venue.status === 'Available' ? 'var(--success-dim)' : 'var(--danger-dim)',
                                            color: venue.status === 'Available' ? 'var(--success)' : 'var(--danger)'
                                        }}>
                                            {venue.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Officials Panel */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', borderBottom: 'var(--border)', paddingBottom: '8px' }}>Match Officials</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {DEFAULT_OFFICIALS.map(off => (
                                    <div key={off.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.01)', border: 'var(--border)', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{off.name}</span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: 'var(--primary-light)', background: 'rgba(37,99,235,0.1)', padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                                            {off.role}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeSubTab === 'standings' && (
                    <LeagueTable matches={matches} teams={teams} schools={schools} />
                )}

                {activeSubTab === 'knockout' && (
                    <KnockoutBrackets matches={matches} teams={teams} schools={schools} onAddMatches={onAddMatches} />
                )}

                {activeSubTab === 'stats' && (
                    <CompetitionStats matches={matches} teams={teams} schools={schools} allStudents={allStudents} year={year} />
                )}

                {activeSubTab === 'alerts' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Live Match Operations &amp; Official Notifications
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Monitor team sheet readiness, dispatch coach submission reminders, and trigger official alerts.
                                    </p>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                    ● FormSubmit Relay Connected
                                </span>
                            </div>

                            {/* Fixtures list with alert action buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(matches || []).filter(m => m.status === 'upcoming' || m.status === 'scheduled' || m.status === 'live').map(m => {
                                    const homeName = getSchoolName(m.homeTeamId, m.homeTeam);
                                    const awayName = getSchoolName(m.awayTeamId, m.awayTeam);
                                    const homeReady = !!m.homeSquadSelection;
                                    const awayReady = !!m.awaySquadSelection;
                                    const bothReady = homeReady && awayReady;

                                    return (
                                        <div key={m.id} style={{
                                            padding: '16px', borderRadius: '12px',
                                            background: bothReady ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                                            border: bothReady ? '1px solid rgba(34,197,94,0.3)' : 'var(--border)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                        {homeName} vs {awayName}
                                                    </span>
                                                    {m.status === 'live' && (
                                                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '2px 8px', borderRadius: '8px' }}>
                                                            LIVE
                                                        </span>
                                                    )}
                                                    {bothReady && m.status !== 'live' && (
                                                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '2px 8px', borderRadius: '8px' }}>
                                                            SQUADS SUBMITTED
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                                    {m.matchday || 'Matchday 1'} · {m.venue || 'Stadium'} · Ref: {m.referee || 'Assigned Referee'}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                {readOnly ? (
                                                    <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>
                                                        👁️ Observer View: {homeReady ? 'Home Squad Ready' : 'Home Pending'} · {awayReady ? 'Away Squad Ready' : 'Away Pending'}
                                                    </span>
                                                ) : (
                                                    <>
                                                        {/* Home Squad Status / Remind Button */}
                                                        {!homeReady ? (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        const res = await sendCoachSquadReminderNotification(m, homeName, '', `Coach (${homeName})`, awayName);
                                                                        setAdminAlertToast(res?.bypassed ? `Squad reminder simulated (Gmail silenced in Sandbox mode).` : `Squad reminder dispatched to ${homeName} Coach!`);
                                                                        setTimeout(() => setAdminAlertToast(null), 4000);
                                                                    } catch (e) {
                                                                        console.warn(e);
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                                                                    background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)',
                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                                                }}
                                                            >
                                                                Remind {homeName} Coach
                                                            </button>
                                                        ) : (
                                                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                                                                {homeName} Ready
                                                            </span>
                                                        )}

                                                        {/* Away Squad Status / Remind Button */}
                                                        {!awayReady ? (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        const res = await sendCoachSquadReminderNotification(m, awayName, '', `Coach (${awayName})`, homeName);
                                                                        setAdminAlertToast(res?.bypassed ? `Squad reminder simulated (Gmail silenced in Sandbox mode).` : `Squad reminder dispatched to ${awayName} Coach!`);
                                                                        setTimeout(() => setAdminAlertToast(null), 4000);
                                                                    } catch (e) {
                                                                        console.warn(e);
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                                                                    background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)',
                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                                                }}
                                                            >
                                                                Remind {awayName} Coach
                                                            </button>
                                                        ) : (
                                                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                                                                {awayName} Ready
                                                            </span>
                                                        )}

                                                        {/* Manual broadcast alert */}
                                                        {bothReady && (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        const res = await sendRefereeSquadNotification(m, homeName, awayName, allStudents);
                                                                        await sendDataLoggerMatchReadyNotification(m, homeName, awayName, allStudents);
                                                                        setAdminAlertToast(res?.bypassed ? `Sandbox alerts simulated (Gmail alerts silenced in Sandbox mode).` : `Official alerts & team sheets delivered to Referee and Data Loggers!`);
                                                                        setTimeout(() => setAdminAlertToast(null), 4000);
                                                                    } catch (e) {
                                                                        console.warn(e);
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '800',
                                                                    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                                                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                                                                }}
                                                            >
                                                                Alert Officials
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeSubTab === 'squadValidation' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                        
                        {/* Information & Regulatory Policy Banner */}
                        <div style={{
                            padding: '16px 20px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(30,27,75,0.7), rgba(15,23,42,0.9))',
                            border: '1px solid rgba(165,180,252,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px'
                        }}>
                            <div>
                                <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🛡️</span> Super-Administrator Squad Validation Station
                                    {pendingSquadsCount > 0 && (
                                        <span style={{ fontSize: '11px', fontWeight: '900', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '1px solid #f59e0b', padding: '2px 8px', borderRadius: '12px' }}>
                                            {pendingSquadsCount} Action Required
                                        </span>
                                    )}
                                </div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.45' }}>
                                    <strong>Operational Policy:</strong> Matches do not require Super-Administrator validation before kick-off to avoid match delays. However, Super-Administrator verification is required to certify official matchday records and publish validated stats.
                                </p>
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }} />
                                Real-Time Squad Listener Active
                            </div>
                        </div>

                        {/* List of Submitted Manager Squads (Prioritized: Urgent/Pending & Live Running Matches Pushed to Front) */}
                        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    Submitted Matchday Squads &amp; Player ID Verification
                                </h4>
                                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                    Matches with newly submitted rosters are prioritized at the top
                                </span>
                            </div>

                            {prioritizedSquadMatches.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                    No manager squads have been submitted for validation yet. As coaches submit rosters, fixtures will appear here automatically.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {prioritizedSquadMatches.map(m => {
                                        const homeName = getSchoolName(m.homeTeamId, m.homeTeam);
                                        const awayName = getSchoolName(m.awayTeamId, m.awayTeam);

                                        const homeSquad = m.homeSquadSelection;
                                        const awaySquad = m.awaySquadSelection;

                                        const isHomePending = homeSquad && homeSquad.validationStatus !== 'approved';
                                        const isAwayPending = awaySquad && awaySquad.validationStatus !== 'approved';
                                        const hasPendingAction = isHomePending || isAwayPending;

                                        const isMatchFullyApproved = homeSquad?.validationStatus === 'approved' && awaySquad?.validationStatus === 'approved';

                                        // Master Quick Approve Both Squads
                                        const handleApproveAllSquads = () => {
                                            const now = Date.now();
                                            const nowIso = new Date(now).toISOString();
                                            const updated = {
                                                ...m,
                                                validationStatus: 'approved',
                                                validatedAt: nowIso,
                                                validatedBy: 'Super Administrator',
                                                homeSquadSelection: homeSquad ? {
                                                    ...homeSquad,
                                                    validationStatus: 'approved',
                                                    validatedAt: nowIso,
                                                    validatedBy: 'Super Administrator',
                                                    lastModified: now
                                                } : homeSquad,
                                                awaySquadSelection: awaySquad ? {
                                                    ...awaySquad,
                                                    validationStatus: 'approved',
                                                    validatedAt: nowIso,
                                                    validatedBy: 'Super Administrator',
                                                    lastModified: now
                                                } : awaySquad,
                                                updatedAt: now
                                            };
                                            if (onUpdateMatch) onUpdateMatch(updated);
                                            setAdminAlertToast(`✓ Both Squads Approved & Certified for ${homeName} vs ${awayName}!`);
                                            setTimeout(() => setAdminAlertToast(null), 4000);
                                        };

                                        // Render Individual Squad Card
                                        const renderSquadCard = (squad, teamName, teamSide) => {
                                            if (!squad) {
                                                return (
                                                    <div style={{ padding: '20px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                                        {teamName}: Waiting for Manager submission...
                                                    </div>
                                                );
                                            }

                                            const isApproved = squad.validationStatus === 'approved';
                                            const isRejected = squad.validationStatus === 'rejected';

                                            const handleApproveSingle = () => {
                                                const now = Date.now();
                                                const nowIso = new Date(now).toISOString();
                                                const squadKey = teamSide === 'home' ? 'homeSquadSelection' : 'awaySquadSelection';
                                                const updated = {
                                                    ...m,
                                                    [squadKey]: {
                                                        ...squad,
                                                        validationStatus: 'approved',
                                                        validatedAt: nowIso,
                                                        validatedBy: 'Super Administrator',
                                                        lastModified: now
                                                    },
                                                    updatedAt: now
                                                };
                                                if (onUpdateMatch) onUpdateMatch(updated);
                                                setAdminAlertToast(`✓ ${teamName} Squad Approved!`);
                                                setTimeout(() => setAdminAlertToast(null), 3500);
                                            };

                                            const handleRejectSingle = () => {
                                                const reason = window.prompt(`Enter rejection reason for ${teamName}:`, 'Missing player ID verification or ineligible squad assignment.');
                                                if (!reason) return;
                                                const now = Date.now();
                                                const nowIso = new Date(now).toISOString();
                                                const squadKey = teamSide === 'home' ? 'homeSquadSelection' : 'awaySquadSelection';
                                                const updated = {
                                                    ...m,
                                                    [squadKey]: {
                                                        ...squad,
                                                        validationStatus: 'rejected',
                                                        rejectionReason: reason,
                                                        validatedAt: nowIso,
                                                        validatedBy: 'Super Administrator',
                                                        lastModified: now
                                                    },
                                                    updatedAt: now
                                                };
                                                if (onUpdateMatch) onUpdateMatch(updated);
                                                setAdminAlertToast(`✕ ${teamName} Squad Flagged for Changes.`);
                                                setTimeout(() => setAdminAlertToast(null), 3500);
                                            };

                                            return (
                                                <div style={{
                                                    flex: 1, padding: '16px', borderRadius: '12px',
                                                    background: isApproved ? 'rgba(34,197,94,0.06)' : isRejected ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                                                    border: `1px solid ${isApproved ? 'rgba(34,197,94,0.3)' : isRejected ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                                    display: 'flex', flexDirection: 'column', gap: '12px'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div>
                                                            <div style={{ fontSize: '14.5px', fontWeight: '800', color: 'var(--text-primary)' }}>{teamName}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Manager: {squad.submittedBy || 'Team Coach'} • Formation: {squad.formation || '4-3-3'}</div>
                                                        </div>
                                                        <span style={{
                                                            fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '20px',
                                                            background: isApproved ? 'rgba(34,197,94,0.2)' : isRejected ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                                                            color: isApproved ? '#4ade80' : isRejected ? '#f87171' : '#fbbf24',
                                                            border: `1px solid ${isApproved ? '#22c55e' : isRejected ? '#ef4444' : '#f59e0b'}`
                                                        }}>
                                                            {isApproved ? '✓ APPROVED' : isRejected ? '✕ CHANGES REQUESTED' : '⏳ PENDING VALIDATION'}
                                                        </span>
                                                    </div>

                                                    {/* Starting XI Player IDs Check */}
                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Starting XI (Player IDs):</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', maxHeight: '130px', overflowY: 'auto' }}>
                                                        {(squad.startingXI || []).filter(Boolean).map((pid, idx) => {
                                                            const player = (allStudents || []).find(s => String(s.id) === String(pid));
                                                            return (
                                                                <div key={idx} style={{ fontSize: '11px', padding: '5px 8px', borderRadius: '6px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontWeight: '700', color: '#ffffff' }}>#{player?.jerseyNumber || idx+1} {player?.name || `Player #${pid}`}</span>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: '9.5px', color: '#a5b4fc', fontWeight: '800' }}>{player?.playerId || `PID-PMC-${String(pid).padStart(5, '0')}`}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Individual Action Buttons */}
                                                    {readOnly ? (
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                            <span style={{
                                                                flex: 1, padding: '8px 12px', borderRadius: '8px', textAlign: 'center',
                                                                background: isApproved ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                                                                color: isApproved ? '#4ade80' : 'var(--text-muted)', fontSize: '11.5px', fontWeight: '700',
                                                                border: isApproved ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.06)'
                                                            }}>
                                                                {isApproved ? '✓ Squad Validated' : 'Pending Verification (Read-Only)'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={handleApproveSingle}
                                                                disabled={isApproved}
                                                                style={{
                                                                    flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none',
                                                                    background: isApproved ? 'rgba(34,197,94,0.15)' : 'var(--success)',
                                                                    color: isApproved ? '#4ade80' : '#ffffff', fontSize: '12px', fontWeight: '800',
                                                                    cursor: isApproved ? 'default' : 'pointer', transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                {isApproved ? '✓ Squad Validated' : `✓ Approve ${teamName}`}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleRejectSingle}
                                                                style={{
                                                                    padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
                                                                    background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: '12px', fontWeight: '800',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                ✕ Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        };

                                        return (
                                            <div 
                                                key={m.id} 
                                                className="glass-panel" 
                                                style={{
                                                    padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
                                                    borderRadius: '14px',
                                                    background: hasPendingAction 
                                                        ? 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(15,23,42,0.95))' 
                                                        : 'linear-gradient(135deg, rgba(34,197,94,0.04), rgba(15,23,42,0.9))',
                                                    border: hasPendingAction 
                                                        ? '2px solid #f59e0b' 
                                                        : '1px solid rgba(34,197,94,0.35)',
                                                    boxShadow: hasPendingAction 
                                                        ? '0 0 28px rgba(245, 158, 11, 0.25)' 
                                                        : 'none',
                                                    transition: 'all 0.25s ease'
                                                }}
                                            >
                                                {/* Header Bar with Action Light-up Badge */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '16px', fontWeight: '900', color: '#ffffff' }}>
                                                            {homeName} vs {awayName}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            ({m.matchday || 'Matchday 1'} · {m.venue || 'National Stadium'})
                                                        </span>
                                                        {m.status === 'live' && (
                                                            <span style={{ fontSize: '10px', fontWeight: '900', background: 'rgba(34,197,94,0.2)', color: '#4ade80', padding: '2px 8px', borderRadius: '10px', border: '1px solid #22c55e' }}>
                                                                ● LIVE RUNNING MATCH
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {hasPendingAction ? (
                                                            <span style={{
                                                                fontSize: '11px', fontWeight: '900', color: '#fbbf24', background: 'rgba(245,158,11,0.2)',
                                                                border: '1px solid #f59e0b', padding: '4px 12px', borderRadius: '20px',
                                                                animation: 'pulse 2s infinite'
                                                            }}>
                                                                ⚡ SQUADS SUBMITTED — VALIDATION ACTION REQUIRED
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                fontSize: '11px', fontWeight: '900', color: '#4ade80', background: 'rgba(34,197,94,0.2)',
                                                                border: '1px solid #22c55e', padding: '4px 12px', borderRadius: '20px'
                                                            }}>
                                                                ✓ OFFICIALLY VALIDATED BY SUPER-ADMIN
                                                            </span>
                                                        )}

                                                        {/* One-Click Master Approval for Match */}
                                                        {hasPendingAction && (homeSquad || awaySquad) && (
                                                            readOnly ? (
                                                                <span style={{
                                                                    padding: '5px 12px', borderRadius: '8px',
                                                                    background: 'rgba(56,189,248,0.12)', color: '#38bdf8',
                                                                    border: '1px solid rgba(56,189,248,0.3)', fontSize: '11px', fontWeight: '800'
                                                                }}>
                                                                    👁️ Observer View (Validation Restricted)
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={handleApproveAllSquads}
                                                                    style={{
                                                                        padding: '7px 16px', borderRadius: '8px', border: 'none',
                                                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                                                        color: '#ffffff', fontSize: '12px', fontWeight: '900',
                                                                        cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                                                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                                                                >
                                                                    ✓ Approve Both Squads
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Side-by-Side Squad Cards */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                    {renderSquadCard(homeSquad, homeName, 'home')}
                                                    {renderSquadCard(awaySquad, awayName, 'away')}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
