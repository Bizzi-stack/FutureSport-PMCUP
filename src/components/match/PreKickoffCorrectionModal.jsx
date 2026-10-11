import React, { useState } from 'react';

export default function PreKickoffCorrectionModal({ match, allPlayers = [], onClose, onApplyCorrection }) {
    const [teamSide, setTeamSide] = useState('home'); // 'home' or 'away'
    const [correctionType, setCorrectionType] = useState('injury_swap'); // 'injury_swap', 'jersey_change', 'staff_change'
    const [reason, setReason] = useState('');
    
    // Injury swap selection
    const [selectedPlayerOffId, setSelectedPlayerOffId] = useState('');
    const [selectedPlayerOnId, setSelectedPlayerOnId] = useState('');
    
    // Jersey change selection
    const [jerseyPlayerId, setJerseyPlayerId] = useState('');
    const [newJerseyNumber, setNewJerseyNumber] = useState('');
    
    // Staff update
    const [staffTitle, setStaffTitle] = useState('Head Coach');
    const [staffName, setStaffName] = useState('');

    if (!match) return null;

    const squadKey = teamSide === 'home' ? 'homeSquadSelection' : 'awaySquadSelection';
    const currentSquad = match[squadKey] || { startingXI: [], benchPlayers: [] };
    const teamName = teamSide === 'home' ? (match.homeTeam || 'Home Team') : (match.awayTeam || 'Away Team');
    const teamId = teamSide === 'home' ? match.homeTeamId : match.awayTeamId;

    // Resolve player object helper
    const getPlayer = (idOrObj) => {
        if (!idOrObj) return null;
        if (typeof idOrObj === 'object') return idOrObj;
        return allPlayers.find(p => p.id === idOrObj) || { id: idOrObj, name: `Player #${idOrObj}`, jerseyNumber: idOrObj };
    };

    const startingXI = (currentSquad.startingXI || []).map(getPlayer).filter(Boolean);
    const benchPlayers = (currentSquad.benchPlayers || []).map(getPlayer).filter(Boolean);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        let correctionData = {
            timestamp: new Date().toISOString(),
            authorizedBy: 'Match Commissioner',
            teamSide,
            teamName,
            correctionType,
            reason: reason || 'Authorized pre-kickoff modification'
        };

        if (correctionType === 'injury_swap') {
            if (!selectedPlayerOffId || !selectedPlayerOnId) {
                alert('Please select both the player being replaced (OFF) and the replacement player (ON).');
                return;
            }

            const pOff = getPlayer(selectedPlayerOffId);
            const pOn = getPlayer(selectedPlayerOnId);

            // Swap player in starting XI with bench player
            const newXI = (currentSquad.startingXI || []).map(id => {
                const idVal = typeof id === 'object' ? id.id : id;
                if (idVal === selectedPlayerOffId) return selectedPlayerOnId;
                return id;
            });

            const newBench = (currentSquad.benchPlayers || []).map(id => {
                const idVal = typeof id === 'object' ? id.id : id;
                if (idVal === selectedPlayerOnId) return selectedPlayerOffId;
                return id;
            });

            correctionData.details = `Injury Replacement: ${pOff?.name || selectedPlayerOffId} (OFF) ➔ ${pOn?.name || selectedPlayerOnId} (ON)`;
            correctionData.updatedSquad = {
                ...currentSquad,
                startingXI: newXI,
                benchPlayers: newBench,
                lastModified: Date.now()
            };
        } else if (correctionType === 'jersey_change') {
            if (!jerseyPlayerId || !newJerseyNumber) {
                alert('Please select a player and enter their new squad number.');
                return;
            }
            const p = getPlayer(jerseyPlayerId);
            correctionData.details = `Jersey Number Change: ${p?.name || jerseyPlayerId} squad number changed to #${newJerseyNumber}`;
            correctionData.targetPlayerId = jerseyPlayerId;
            correctionData.newJerseyNumber = Number(newJerseyNumber);
        } else if (correctionType === 'staff_change') {
            if (!staffName) {
                alert('Please enter official staff name.');
                return;
            }
            correctionData.details = `Staff Update: ${staffTitle} set to ${staffName}`;
            correctionData.staffTitle = staffTitle;
            correctionData.staffName = staffName;
        }

        onApplyCorrection(match.id, correctionData);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 11000,
            background: 'rgba(5, 10, 20, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: '#0d1526',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                boxShadow: '0 0 40px rgba(245, 158, 11, 0.2)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '560px',
                overflow: 'hidden',
                color: '#e8edf8',
                fontFamily: 'Inter, system-ui, sans-serif'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(13,21,38,0.9))',
                    borderBottom: '1px solid rgba(245,158,11,0.3)',
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>✏️</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#fbbf24' }}>
                                Authorized Pre-Kickoff Correction
                            </h3>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                Match ID: {match.id} • {match.homeTeam} vs {match.awayTeam}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '4px 8px'
                        }}
                    >✕</button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Warning Callout */}
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        fontSize: '12px',
                        color: '#fcd34d',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start'
                    }}>
                        <span>⚠️</span>
                        <span>
                            Corrections made before kickoff are officially logged into the match report and instantly synced to the Countdown Sheet across all officials' devices.
                        </span>
                    </div>

                    {/* Select Team */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px' }}>
                            Select Target Team
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setTeamSide('home')}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '12px',
                                    border: teamSide === 'home' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                    background: teamSide === 'home' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                                    color: teamSide === 'home' ? '#60a5fa' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                🏠 {match.homeTeam || 'Home Team'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTeamSide('away')}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '12px',
                                    border: teamSide === 'away' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                    background: teamSide === 'away' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                                    color: teamSide === 'away' ? '#60a5fa' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                ✈️ {match.awayTeam || 'Away Team'}
                            </button>
                        </div>
                    </div>

                    {/* Correction Type */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px' }}>
                            Correction Type
                        </label>
                        <select
                            value={correctionType}
                            onChange={(e) => setCorrectionType(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: '#fff',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        >
                            <option value="injury_swap" style={{ background: '#0d1526' }}>🏥 Warm-up Injury Player Swap (XI ➔ Bench)</option>
                            <option value="jersey_change" style={{ background: '#0d1526' }}>🔢 Squad / Jersey Number Correction</option>
                            <option value="staff_change" style={{ background: '#0d1526' }}>📋 Official Staff / Head Coach Designation</option>
                        </select>
                    </div>

                    {/* Dynamic Fields */}
                    {correctionType === 'injury_swap' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#ef4444', marginBottom: '4px' }}>
                                    Player Injured / Withdrawn (XI)
                                </label>
                                <select
                                    value={selectedPlayerOffId}
                                    onChange={(e) => setSelectedPlayerOffId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        borderRadius: '8px',
                                        background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        color: '#fff',
                                        fontSize: '12px'
                                    }}
                                >
                                    <option value="" style={{ background: '#0d1526' }}>Select Starting XI Player...</option>
                                    {startingXI.map(p => (
                                        <option key={p.id} value={p.id} style={{ background: '#0d1526' }}>
                                            #{p.jerseyNumber || '?'} {p.name || p.id} ({p.position || 'Player'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#10b981', marginBottom: '4px' }}>
                                    Replacement Player (Bench ➔ XI)
                                </label>
                                <select
                                    value={selectedPlayerOnId}
                                    onChange={(e) => setSelectedPlayerOnId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        borderRadius: '8px',
                                        background: 'rgba(16,185,129,0.1)',
                                        border: '1px solid rgba(16,185,129,0.3)',
                                        color: '#fff',
                                        fontSize: '12px'
                                    }}
                                >
                                    <option value="" style={{ background: '#0d1526' }}>Select Bench Player...</option>
                                    {benchPlayers.map(p => (
                                        <option key={p.id} value={p.id} style={{ background: '#0d1526' }}>
                                            #{p.jerseyNumber || '?'} {p.name || p.id} ({p.position || 'Sub'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {correctionType === 'jersey_change' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
                                    Select Player
                                </label>
                                <select
                                    value={jerseyPlayerId}
                                    onChange={(e) => setJerseyPlayerId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#fff',
                                        fontSize: '12px'
                                    }}
                                >
                                    <option value="" style={{ background: '#0d1526' }}>Select Player...</option>
                                    {[...startingXI, ...benchPlayers].map(p => (
                                        <option key={p.id} value={p.id} style={{ background: '#0d1526' }}>
                                            #{p.jerseyNumber || '?'} {p.name || p.id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
                                    New Jersey #
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={newJerseyNumber}
                                    onChange={(e) => setNewJerseyNumber(e.target.value)}
                                    placeholder="e.g. 14"
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#fff',
                                        fontSize: '12px'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {correctionType === 'staff_change' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
                                    Role / Title
                                </label>
                                <select
                                    value={staffTitle}
                                    onChange={(e) => setStaffTitle(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#fff',
                                        fontSize: '12px'
                                    }}
                                >
                                    <option value="Head Coach">Head Coach</option>
                                    <option value="Assistant Coach">Assistant Coach</option>
                                    <option value="Team Manager">Team Manager</option>
                                    <option value="Physiotherapist">Physiotherapist</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
                                    Official Staff Name
                                </label>
                                <input
                                    type="text"
                                    value={staffName}
                                    onChange={(e) => setStaffName(e.target.value)}
                                    placeholder="e.g. Coach David Nicholls"
                                    style={{
                                        width: '100%',
                                        padding: '9px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#fff',
                                        fontSize: '12px'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Official Reason / Remarks */}
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
                            Official Reason for Pre-Kickoff Authorization
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Warm-up muscle strain verified by match doctor"
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: '#fff',
                                fontSize: '12px'
                            }}
                        />
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '9px 16px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: '#94a3b8',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: '9px 20px',
                                borderRadius: '8px',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                border: 'none',
                                color: '#000',
                                fontSize: '12px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                            }}
                        >
                            ✓ Submit Authorized Correction
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
