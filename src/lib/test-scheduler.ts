import { generateSchedule } from './scheduler';
import type { Volunteer } from '../types';

const volunteers: Volunteer[] = [
    { id: '1', name: 'Alice', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '2', name: 'Bob', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '3', name: 'Charlie', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '4', name: 'David', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '5', name: 'Eve', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '6', name: 'Frank', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '7', name: 'Grace', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '8', name: 'Heidi', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '9', name: 'Ivan', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
    { id: '10', name: 'Judy', roles: ['Lector1', 'Commentator'], unavailableDates: [], volunteerLevel: 'Volunteer', availabilityMode: 'always' },
];

console.log("Generating schedule for Nov 2025...");
const schedule = generateSchedule(volunteers, 2025, 10); // Nov is month 10 (0-indexed)

console.log(`Generated ${schedule.masses.length} masses.`);

// Check constraints
let violations = 0;

// 1. Weekday assignments per week per person
const weeklyCounts: Record<string, Record<number, number>> = {};
import { getWeek, format } from 'date-fns';

schedule.masses.forEach(m => {
    const week = getWeek(m.date.toDate());
    Object.values(m.assignments).forEach(vid => {
        if (!vid) return; // unassigned
        if (m.type === 'Weekday') {
            if (!weeklyCounts[vid]) weeklyCounts[vid] = {};
            weeklyCounts[vid][week] = (weeklyCounts[vid][week] || 0) + 1;
        }
    });
});

Object.entries(weeklyCounts).forEach(([vid, weeks]) => {
    Object.entries(weeks).forEach(([week, count]) => {
        if (count > 1) {
            console.error(`Violation: Volunteer ${vid} has ${count} weekday assignments in week ${week}`);
            violations++;
        }
    });
});

// 2. Consecutive days
const volunteerDates: Record<string, string[]> = {};
schedule.masses.forEach(m => {
    const d = format(m.date.toDate(), 'yyyy-MM-dd');
    Object.values(m.assignments).forEach(vid => {
        if (!vid) return;
        if (!volunteerDates[vid]) volunteerDates[vid] = [];
        volunteerDates[vid].push(d);
    });
});

Object.entries(volunteerDates).forEach(([vid, dates]) => {
    dates.sort();
    for (let i = 0; i < dates.length - 1; i++) {
        const d1 = new Date(dates[i]);
        const d2 = new Date(dates[i + 1]);
        const diff = (d2.getTime() - d1.getTime()) / (1000 * 3600 * 24);
        if (diff === 1) {
            console.error(`Violation: Volunteer ${vid} assigned on consecutive days ${dates[i]} and ${dates[i + 1]}`);
            // This might happen if 'Saturday Evening' (Sunday type) follows 'Saturday Morning' (Weekday type)?
            // Or Friday Weekday -> Saturday Morning?
            // User said: "no assignments for 2 consecutive days".
            // Saturday AM is weekday. Saturday PM is Sunday mass. Same day.
            // Constraint 3: "no two assignments in one day".
            violations++;
        }
        if (diff === 0) {
            console.error(`Violation: Volunteer ${vid} assigned twice on ${dates[i]}`);
            violations++;
        }
    }
});

if (violations === 0) {
    console.log("SUCCESS: No constraint violations found.");
} else {
    console.log(`FAILED: ${violations} violations found.`);
}

// Print a sample
console.log("Sample Assignments (First 5):");
schedule.masses.slice(0, 5).forEach(m => {
    console.log(`${format(m.date.toDate(), 'yyyy-MM-dd HH:mm')} (${m.type}): L=${m.assignments.Lector1}, C=${m.assignments.Commentator}`);
});
