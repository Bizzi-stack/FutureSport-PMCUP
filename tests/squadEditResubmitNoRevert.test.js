import test from 'node:test';
import assert from 'node:assert';
import { mergeMatchStates } from '../src/utils/matchEngine.js';
import { mergeCloudMatches, computeMatchesHash } from '../src/utils/realtimeSync.js';

test('Squad edit & resubmission: newly submitted squad with ISO string submittedAt or lastModified beats older submitted squad', () => {
    // 1. Match in cloud had a previously submitted squad from yesterday
    const cloudMatchYesterday = {
        id: 'pmc-fixture-24',
        status: 'upcoming',
        updatedAt: 1791500000000,
        homeTeam: 'ATLAS UNITED',
        homeTeamId: 'pmc-club-8',
        awayTeam: 'PRIDE OF GALL HILL',
        awayTeamId: 'pmc-club-9',
        homeSquadSelection: {
            formation: '4-3-3',
            startingXI: ['old-p1', 'old-p2', 'old-p3', 'old-p4', 'old-p5', 'old-p6', 'old-p7', 'old-p8', 'old-p9', 'old-p10', 'old-p11'],
            benchPlayers: ['old-p12', 'old-p13'],
            captainId: 'old-p1',
            submittedAt: '2026-10-09T18:00:00.000Z',
            validationStatus: 'approved'
        }
    };

    // 2. Coach edits and resubmits squad today with new players
    const editedTodaySquad = {
        formation: '4-4-2',
        startingXI: ['new-p1', 'new-p2', 'new-p3', 'new-p4', 'new-p5', 'new-p6', 'new-p7', 'new-p8', 'new-p9', 'new-p10', 'new-p11'],
        benchPlayers: ['new-p12', 'new-p13'],
        captainId: 'new-p10',
        submittedAt: '2026-10-10T14:00:00.000Z',
        lastModified: 1791650000000,
        validationStatus: 'pending_validation'
    };

    const coachUpdatedMatchToday = {
        ...cloudMatchYesterday,
        homeSquadSelection: editedTodaySquad,
        updatedAt: 1791650000000
    };

    // Merge in cloud (cloudMatchYesterday vs coachUpdatedMatchToday)
    const mergedInCloud = mergeMatchStates(cloudMatchYesterday, coachUpdatedMatchToday);
    assert.deepStrictEqual(mergedInCloud.homeSquadSelection.startingXI, editedTodaySquad.startingXI, 'Newly submitted squad startingXI must be preserved');
    assert.strictEqual(mergedInCloud.homeSquadSelection.captainId, 'new-p10', 'Newly selected captain must be preserved');
    assert.strictEqual(mergedInCloud.homeSquadSelection.formation, '4-4-2', 'New formation must be preserved');

    // Also reverse merge direction (coachUpdatedMatchToday vs cloudMatchYesterday)
    const reverseMerged = mergeMatchStates(coachUpdatedMatchToday, cloudMatchYesterday);
    assert.deepStrictEqual(reverseMerged.homeSquadSelection.startingXI, editedTodaySquad.startingXI, 'Newly submitted squad startingXI must be preserved regardless of merge order');
});

test('Analyst logging stats on today match does not revert edited squad to previous squad', () => {
    // Current match in cloud has today newly edited squad
    const activeMatchWithTodaySquad = {
        id: 'pmc-fixture-24',
        status: 'live',
        updatedAt: 1791651000000,
        homeTeam: 'ATLAS UNITED',
        homeTeamId: 'pmc-club-8',
        awayTeam: 'PRIDE OF GALL HILL',
        awayTeamId: 'pmc-club-9',
        homeSquadSelection: {
            formation: '4-4-2',
            startingXI: ['new-p1', 'new-p2', 'new-p3', 'new-p4', 'new-p5', 'new-p6', 'new-p7', 'new-p8', 'new-p9', 'new-p10', 'new-p11'],
            benchPlayers: ['new-p12', 'new-p13'],
            captainId: 'new-p10',
            submittedAt: '2026-10-10T14:00:00.000Z',
            lastModified: 1791650000000,
            validationStatus: 'approved'
        },
        awaySquadSelection: {
            formation: '4-3-3',
            startingXI: ['away-p1', 'away-p2', 'away-p3', 'away-p4', 'away-p5', 'away-p6', 'away-p7', 'away-p8', 'away-p9', 'away-p10', 'away-p11'],
            benchPlayers: ['away-p12', 'away-p13'],
            captainId: 'away-p1',
            submittedAt: '2026-10-10T14:15:00.000Z',
            lastModified: 1791650500000,
            validationStatus: 'approved'
        }
    };

    // Analyst logs goal for new-p1 at minute 12
    const analystEventUpdate = {
        ...activeMatchWithTodaySquad,
        homeScore: 1,
        playerStats: {
            'new-p1': { Goals: 1, Shots: 1, 'Shots on Target': 1, _updatedAt: 1791652000000 }
        },
        timeline: [
            { id: 'ev-1', type: 'goal', minute: 12, period: '1H', playerId: 'new-p1', playerName: 'New Player 1', team: 'home' }
        ],
        updatedAt: 1791652000000
    };

    const merged = mergeMatchStates(activeMatchWithTodaySquad, analystEventUpdate);
    assert.deepStrictEqual(merged.homeSquadSelection.startingXI, activeMatchWithTodaySquad.homeSquadSelection.startingXI, 'Analyst stat logging preserves home squad');
    assert.deepStrictEqual(merged.awaySquadSelection.startingXI, activeMatchWithTodaySquad.awaySquadSelection.startingXI, 'Analyst stat logging preserves away squad');
    assert.strictEqual(merged.homeScore, 1, 'Goal is logged');
});
