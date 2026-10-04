import pmcData from '../data/pmcScrapedData.json' with { type: 'json' };
import pmcInitialMatches from '../data/pmcInitialMatches.json' with { type: 'json' };

export const PMC_YEARS = ['2026-2027'];
const YEARS = PMC_YEARS;
const TERMS = ['Matchday 1', 'Matchday 2', 'Matchday 3'];

// Mulberry32 RNG for consistent mock performance generation on scraped PMC players
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// 1. Process Schools / Clubs
export const PMC_SCHOOLS = pmcData.teams.map((t, idx) => ({
    id: `pmc-club-${t.id}`,
    name: t.name || `Club ${t.id}`,
    logo: null,
    primaryColor: t.primaryColor || '#00267F',
    secondaryColor: t.secondaryColor || '#FFC726',
    division: t.division || 'Group A',
    rawId: t.id
}));

// 2. Process Teams (categorized per club)
export const PMC_TEAMS = [];
PMC_SCHOOLS.forEach(school => {
    PMC_TEAMS.push({
        id: `${school.id}-team-PMC`,
        schoolId: school.id,
        name: `${school.name} (${school.division})`,
        ageGroup: 'PMC',
        groupNum: 1
    });
});

// Helper for clean initial tournament performance stats (0-based before match participation)
export function generatePmcPerformance(isGk) {
    const perf = {};
    YEARS.forEach(y => {
        perf[y] = {};
        TERMS.forEach(t => {
            if (isGk) {
                perf[y][t] = {
                    'Saves': 0,
                    'Clean Sheets': 0,
                    'Goals Conceded': 0,
                    'Penalties Saved': 0,
                    'Pass Completed': 0,
                    'Punches': 0,
                    'High Claims': 0
                };
            } else {
                perf[y][t] = {
                    'Goals': 0,
                    'Assists': 0,
                    'Shots on Target': 0,
                    'Shots': 0,
                    'Shots Per Game': 0,
                    'Shot Accuracy': 0,
                    'Pass Completed': 0,
                    'Successful Dribbles': 0,
                    'Tackles Per Game': 0,
                    'Interceptions Per Game': 0,
                    'Successful Clearances': 0,
                    'Successful Blocks': 0,
                    'Corners Taken': 0,
                    'Freekicks Taken': 0,
                    'Penalties Taken': 0,
                    'Successful Tackles': 0
                };
            }
        });
    });
    return perf;
}

// 3. Process Players / Students — Only verified registered club rosters
const allPmcStudents = [];

const FALLBACK_CLUB_ROSTERS = {
    8: ['Marcus Griffith', 'Jamal Blackman', 'Devon Clarke', 'Kevon Alleyne', 'Tyrese Boyce', 'Shane Goodridge', 'Rico Prescod', 'Dario Thorne', 'Romario Skeete', 'Kemal Harewood', 'Rashad Hinds', 'Jamar Cummins', 'Trevon Brathwaite', 'Jevon Jordan', 'Stefan Pilgrim', 'Kofi Trotman', 'Darnell Walcott', 'Akim Best'],
    9: ['Zico Edmee', 'Ronaldo Best', 'Shaquille Stewart', 'Omari Walrond', 'Tariq Waithe', 'Keon Forde', 'Damian Greenidge', 'Jaden Mayers', 'Nathaniel Barrow', 'Raheem Sobers', 'Keshawn Applewhaite', 'Shakir Gill', 'Dwayne Small', 'Jamarley Husbands', 'Corey Hoyte', 'Tyrique Lashley', 'Malik Grazette', 'Carlson Roach'],
    17: [
        { name: 'Corey Bridgeman', number: 21 },
        { name: 'Ryan Preston', number: null },
        { name: 'Cliff Gooding-Edghill', number: 3 },
        { name: 'Shakeel Brown', number: 31 },
        { name: 'Tadj Nyathu', number: null },
        { name: 'Yohann Goddard', number: 14 },
        { name: 'Javier Smith', number: 8 },
        { name: 'Tavion Eastmond', number: 10 },
        { name: 'Christopher Jacobs', number: 7 },
        { name: 'Jemari Trotman', number: 9 },
        { name: 'Tre Moore', number: 17 },
        { name: 'Xavier Archer', number: 22 },
        { name: 'Darren Sammy Jr', number: null },
        { name: 'Andre Brathwaite', number: 18 },
        { name: 'Chriseur Harry', number: 11 },
        { name: 'Sharzeef Thompson', number: 15 },
        { name: 'Kymani Jones', number: 20 },
        { name: 'Kyle Smith', number: null }
    ]
};

PMC_SCHOOLS.forEach((club, cIdx) => {
    let scrapedForClub = pmcData.players.filter(p => p.teamId === club.rawId);
    
    // Explicitly override scraped data if a hardcoded true roster exists
    if (FALLBACK_CLUB_ROSTERS[club.rawId]) {
        scrapedForClub = FALLBACK_CLUB_ROSTERS[club.rawId].map((entry, idx) => {
            const isObj = typeof entry === 'object' && entry !== null;
            return {
                id: club.rawId * 1000 + idx + 1,
                name: isObj ? entry.name : entry,
                number: isObj ? entry.number : idx + 1
            };
        });
    }
    const teamId = `${club.id}-team-PMC`;
    const rng = mulberry32(club.rawId || (cIdx + 1) * 100);

    // Only load players if the club has a registered official squad. Otherwise, leave empty.
    const squadLimit = scrapedForClub.length;
    for (let i = 0; i < squadLimit; i++) {
        const scP = scrapedForClub[i];
        const pos = scP?.position || (i < 2 ? 'Goalkeeper' : i < 10 ? 'Defender' : i < 18 ? 'Midfielder' : 'Forward');
        const isGk = pos === 'Goalkeeper' || pos === 'GK';

        const teamAssignments = {};
        YEARS.forEach(y => { teamAssignments[y] = teamId; });

        const rawClubNum = club.rawId || String(club.id).replace('pmc-club-', '');
        const canonicalId = `pmc-p-${rawClubNum}-${i + 1}`;
        const aliasIds = [
            canonicalId,
            `pmc-student-${club.id}-${i + 1}`,
            `pmc-student-${rawClubNum}-${i + 1}`,
            scP ? `pmc-student-${scP.id}` : null,
            scP ? String(scP.id) : null
        ].filter(Boolean);

        const playerName = scP.name;
        const rawPid = scP ? String(scP.id).padStart(5, '0') : `${String(rawClubNum).padStart(2, '0')}${String(i + 1).padStart(3, '0')}`;
        const student = {
            id: canonicalId,
            rawId: scP?.id || null,
            aliasIds,
            playerId: `PID-PMC-${rawPid}`,
            name: playerName,
            schoolId: club.id,
            teamAssignments,
            position: pos,
            jerseyNumber: (scP?.jerseyNumber != null) ? scP.jerseyNumber : (scP?.number != null ? scP.number : null),
            gender: scP?.gender || 'Boy',
            dob: `200${6 + (i % 3)}-0${(i % 9) + 1}-15`,
            preferredFoot: rng() < 0.8 ? 'Right' : 'Left',
            medicalInfo: 'None',
            emergencyContact: 'Parent / Guardian',
            status: 'approved',
            isMockPlayer: false,
            performance: generatePmcPerformance(isGk),
            matchStats: {
                yellowCards: 0,
                redCards: 0,
                fouls: 0,
                minutesPlayed: 0
            },
            documents: {
                birthCertificate: 'Birth_Certificate.pdf',
                enrollmentLetter: 'School_Enrollment_Letter.pdf'
            }
        };

        if (isGk) {
            student.saveLogs = [];
        } else {
            student.shotLogs = [];
        }

        allPmcStudents.push(student);
    }
});

export const PMC_STUDENTS = allPmcStudents;

// Standard BFA / Concacaf Pre-Match Operational Protocol Milestones
export const DEFAULT_COUNTDOWN_PROTOCOL = [
    {
        id: 'cd-1',
        timeBefore: 'T-90 min',
        minutesBefore: 90,
        action: 'Team arrival, pitch inspection, and music choice',
        location: 'Stadium / Dressing Room',
        completed: false
    },
    {
        id: 'cd-2',
        timeBefore: 'T-75 min',
        minutesBefore: 75,
        action: 'Submit official team sheet to referee / opponents',
        location: 'Administration',
        completed: false
    },
    {
        id: 'cd-3',
        timeBefore: 'T-60 min',
        minutesBefore: 60,
        action: 'Warm-up begins (dynamic stretching and activation)',
        location: 'Pitch',
        completed: false
    },
    {
        id: 'cd-4',
        timeBefore: 'T-30 min',
        minutesBefore: 30,
        action: 'Tactical review, final lineup reminder, and hydration',
        location: 'Dressing Room',
        completed: false
    },
    {
        id: 'cd-5',
        timeBefore: 'T-15 min',
        minutesBefore: 15,
        action: 'Team leaves dressing room for final on-pitch warm-up',
        location: 'Tunnel / Pitch',
        completed: false
    },
    {
        id: 'cd-6',
        timeBefore: 'T-05 min',
        minutesBefore: 5,
        action: 'Final lineup check, gear check, and team huddle',
        location: 'Tunnel',
        completed: false
    },
    {
        id: 'cd-7',
        timeBefore: 'T-00 min',
        minutesBefore: 0,
        action: 'Kickoff',
        location: 'Pitch',
        completed: false
    }
];

// 4. Official Prime Minister's Cup Tournament Matches (Opening Matchday: Monday 07 Sep 2026)
export const PMC_MATCHES = pmcInitialMatches;
