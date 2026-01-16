import { startOfMonth, endOfMonth, eachDayOfInterval, isSaturday, isSunday, format, getWeek } from 'date-fns';
import type { Volunteer, MonthlySchedule, Mass, Role } from '../types';
import { Timestamp } from 'firebase/firestore';

// Helper to safely convert any date-like object (Timestamp, Date, JS object from JSON) to a JS Date
const safeToDate = (dt: any): Date => {
    if (!dt) return new Date();
    if (typeof dt.toDate === 'function') return dt.toDate();
    if (dt instanceof Date) return dt;
    if (typeof dt.seconds === 'number') return new Date(dt.seconds * 1000);
    // Handle serialized objects that might have been converted to strings
    const parsed = new Date(dt);
    if (!isNaN(parsed.getTime())) return parsed;
    return new Date();
};

const isAvailable = (volunteer: Volunteer, date: Date): boolean => {
    if (!volunteer.unavailableDates) return true;
    const dateStr = format(date, 'yyyy-MM-dd');
    return !volunteer.unavailableDates.some(ud => {
        const udDate = safeToDate(ud);
        return format(udDate, 'yyyy-MM-dd') === dateStr;
    });
};

// Helper to check if volunteer is available at a specific time
const isAvailableAtTime = (volunteer: Volunteer, massDate: Date): boolean => {
    const massTime = format(massDate, 'HH:mm');

    // If mode is 'always', they're available at all times
    if (volunteer.availabilityMode === 'always') {
        return true;
    }

    // Helper to check if time falls within a slot
    const isTimeInSlot = (time: string, slot: { start: string; end: string }): boolean => {
        return time >= slot.start && time <= slot.end;
    };

    // If mode is 'except', check if time is in unavailable slots
    if (volunteer.availabilityMode === 'except') {
        const unavailableSlots = volunteer.unavailableTimeSlots || [];
        const isUnavailable = unavailableSlots.some(slot => isTimeInSlot(massTime, slot));
        return !isUnavailable; // Available if NOT in unavailable slots
    }

    // If mode is 'only', check if time is in available slots
    if (volunteer.availabilityMode === 'only') {
        const availableSlots = volunteer.availableTimeSlots || [];
        return availableSlots.some(slot => isTimeInSlot(massTime, slot));
    }

    return true; // Default to available
};

export const generateSchedule = (
    volunteers: Volunteer[],
    year: number,
    month: number, // 0-indexed (0 = Jan)
    existingMasses: Mass[] = []
): MonthlySchedule => {
    // Safety check for inputs
    if (!Array.isArray(volunteers)) {
        return { id: 'error', month, year, masses: [] };
    }

    let massesToKeep: Mass[] = [];
    try {
        massesToKeep = Array.isArray(existingMasses)
            ? existingMasses
                .filter(m => {
                    if (!m) return false;
                    if (m.type !== 'Special') return false;
                    return true;
                })
                .map((m, index) => {
                    try {
                        const cleanDate = Timestamp.fromDate(safeToDate(m.date));
                        return {
                            ...m,
                            date: cleanDate
                        };
                    } catch (err) {
                        console.error(`Error processing mass at index ${index}:`, m, err);
                        throw err;
                    }
                })
            : [];
    } catch (err) {
        console.error("generateSchedule: Failed to process existing masses", err);
        throw new Error(`Failed to process existing masses: ${err}`);
    }

    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(startDate);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const schedule: MonthlySchedule = {
        id: format(startDate, 'yyyy-MM'),
        month,
        year,
        masses: [...massesToKeep],
    };

    // Tracking assignments to enforce constraints
    const assignmentsHistory: Record<string, string[]> = {};
    const weeklyCounts: Record<string, Record<number, number>> = {};
    const lastRole: Record<string, Role> = {};
    const lastPartner: Record<string, string> = {};

    volunteers.forEach(v => {
        if (!v || !v.id) return;
        assignmentsHistory[v.id] = [];
        weeklyCounts[v.id] = {};
    });

    // CRITICAL: Pre-populate tracking from existing Special masses
    schedule.masses.forEach(mass => {
        if (!mass || !mass.assignments) return;
        const date = safeToDate(mass.date);
        const dateStr = format(date, 'yyyy-MM-dd');
        const weekNum = getWeek(date);

        Object.entries(mass.assignments).forEach(([role, vid]) => {
            if (vid && assignmentsHistory[vid]) {
                assignmentsHistory[vid].push(dateStr);
                if (mass.type === 'Weekday') {
                    weeklyCounts[vid][weekNum] = (weeklyCounts[vid][weekNum] || 0) + 1;
                }
                lastRole[vid] = role as Role;
            }
        });
    });

    days.forEach(day => {
        const isSat = isSaturday(day);
        const isSun = isSunday(day);
        const dateStr = format(day, 'yyyy-MM-dd');
        const weekNum = getWeek(day);

        let dayMasses: Mass[] = [];

        if (isSun) {
            // Sunday Schedule: 6:00 AM, 7:30 AM, 9:00 AM, 10:30 AM, 4:00 PM, 5:30 PM, 7:00 PM
            ['06:00', '07:30', '09:00', '10:30', '16:00', '17:30', '19:00'].forEach(time => {
                dayMasses.push(createMass(day, time, 'Sunday'));
            });
        } else if (isSat) {
            // Saturday Morning: 6:00 AM, 7:30 AM (Weekday type)
            ['06:00', '07:30'].forEach(time => {
                dayMasses.push(createMass(day, time, 'Weekday'));
            });
            // Saturday Evening: Anticipated Sunday Masses - 5:30 PM, 6:30 PM, 7:30 PM
            ['17:30', '18:30', '19:30'].forEach(time => {
                dayMasses.push(createMass(day, time, 'Sunday'));
            });
        } else {
            // Weekday (Mon-Fri): 6:00 AM, 7:30 AM, 6:30 PM
            ['06:00', '07:30', '18:30'].forEach(time => {
                dayMasses.push(createMass(day, time, 'Weekday'));
            });
        }

        // Fill masses
        dayMasses.forEach(mass => {
            if (!mass || !mass.date) return;

            // CHECK: Does a mass already exist at this EXACT date and time?
            const massDateStr = format(safeToDate(mass.date), 'yyyy-MM-dd HH:mm');
            const exists = schedule.masses.some(em => {
                if (!em || !em.date) return false;
                return format(safeToDate(em.date), 'yyyy-MM-dd HH:mm') === massDateStr;
            });
            if (exists) return;

            const requiredRoles: Role[] = mass.type === 'Weekday'
                ? ['Lector1', 'Commentator']
                : ['Lector1', 'Commentator', 'Lector2'];

            const assignedVolunteers: string[] = [];

            requiredRoles.forEach(role => {
                const candidate = findBestCandidate(
                    volunteers,
                    day, // Passing the full day Date object
                    safeToDate(mass.date), // Passing the full mass Date object
                    weekNum,
                    role,
                    mass.type,
                    assignmentsHistory,
                    weeklyCounts,
                    assignedVolunteers,
                    lastRole,
                    lastPartner
                );

                if (candidate) {
                    mass.assignments[role] = candidate.id;
                    assignedVolunteers.push(candidate.id);
                    assignmentsHistory[candidate.id].push(dateStr);

                    if (mass.type === 'Weekday') {
                        weeklyCounts[candidate.id][weekNum] = (weeklyCounts[candidate.id][weekNum] || 0) + 1;
                    }
                    lastRole[candidate.id] = role;
                    assignedVolunteers.forEach(p => {
                        if (p !== candidate.id) {
                            lastPartner[candidate.id] = p;
                            lastPartner[p] = candidate.id;
                        }
                    });
                }
            });

            schedule.masses.push(mass);
        });
    });

    // Final Sort to ensure Special masses are in order
    schedule.masses.sort((a, b) => {
        try {
            const timeA = safeToDate(a?.date).getTime();
            const timeB = safeToDate(b?.date).getTime();
            return timeA - timeB;
        } catch (e) {
            return 0;
        }
    });

    return schedule;
};

const createMass = (date: Date, timeStr: string, type: 'Weekday' | 'Sunday'): Mass => {
    // Combine date and time
    const [hours, minutes] = timeStr.split(':').map(Number);
    const massDate = new Date(date);
    massDate.setHours(hours, minutes, 0, 0);

    return {
        id: `${format(date, 'yyyyMMdd')}-${timeStr}`,
        date: Timestamp.fromDate(massDate),
        type,
        assignments: { Lector1: null, Commentator: null, Lector2: null }
    };
};

export const findBestCandidate = (
    volunteers: Volunteer[],
    date: Date,
    massDate: Date,
    weekNum: number,
    role: Role,
    massType: 'Weekday' | 'Sunday' | 'Special',
    history: Record<string, string[]>,
    weeklyCounts: Record<string, Record<number, number>>,
    currentPartners: string[],
    lastRole: Record<string, Role>,
    lastPartner: Record<string, string>
): Volunteer | null => {
    const dateStr = format(date, 'yyyy-MM-dd');

    // Helper function to filter candidates with all constraints
    const filterCandidates = () => {
        return volunteers.filter(v => {
            // 0. Must be active
            if (v.isActive === false) return false;

            // NEW: Volunteer Level Check
            // Lector level can do Lector1 or Lector2
            // Volunteer level can do all roles
            if (v.volunteerLevel === 'Lector' && role !== 'Lector1' && role !== 'Lector2') {
                return false;
            }

            // 1. Availability check: Date-based
            if (!isAvailable(v, date)) return false;

            // 2. Availability check: Time-based
            if (!isAvailableAtTime(v, massDate)) return false;

            // 2. No assignments for 2 consecutive days
            const prevDate = new Date(dateStr);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = format(prevDate, 'yyyy-MM-dd');
            if (history[v.id].includes(prevDateStr)) return false;

            // 3. No two assignments in one day (Constraint 3)
            if (history[v.id].includes(dateStr)) return false;

            // 4. Weekday constraint: only 1 weekday schedule a week
            if (massType === 'Weekday') {
                const count = weeklyCounts[v.id][weekNum] || 0;
                if (count >= 1) return false;
            }

            return true;
        });
    };

    let candidates = filterCandidates();

    // Scoring/Sorting candidates
    candidates.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // Prefer those with fewer assignments overall (Fairness)
        scoreA -= history[a.id].length * 10;
        scoreB -= history[b.id].length * 10;

        // Rotation: Switch roles
        if (lastRole[a.id] && lastRole[a.id] !== role) scoreA += 5;
        if (lastRole[b.id] && lastRole[b.id] !== role) scoreB += 5;

        // Rotation: Different partner
        const aHadPartner = currentPartners.some(p => lastPartner[a.id] === p);
        const bHadPartner = currentPartners.some(p => lastPartner[b.id] === p);
        if (!aHadPartner) scoreA += 3;
        if (!bHadPartner) scoreB += 3;

        // Add small random factor to break ties and create variation
        const randomFactor = (Math.random() - 0.5) * 2;

        return (scoreB - scoreA) + randomFactor; // Descending score with randomness
    });

    return candidates.length > 0 ? candidates[0] : null;
};

// Helper to build tracking stats from an existing schedule
export const buildStatsFromSchedule = (schedule: MonthlySchedule, volunteers: Volunteer[]) => {
    const assignmentsHistory: Record<string, string[]> = {};
    const weeklyCounts: Record<string, Record<number, number>> = {};
    const lastRole: Record<string, Role> = {};
    const lastPartner: Record<string, string> = {};

    volunteers.forEach(v => {
        assignmentsHistory[v.id] = [];
        weeklyCounts[v.id] = {};
    });

    schedule.masses.forEach(mass => {
        const date = (mass.date as any).toDate ? (mass.date as any).toDate() : new Date((mass.date as any).seconds * 1000);
        const dateStr = format(date, 'yyyy-MM-dd');
        const weekNum = getWeek(date);

        const assignedIds = Object.values(mass.assignments).filter(Boolean) as string[];

        assignedIds.forEach(vid => {
            if (!assignmentsHistory[vid]) return; // Volunteer might have been deleted?

            assignmentsHistory[vid].push(dateStr);
            if (mass.type === 'Weekday') {
                weeklyCounts[vid][weekNum] = (weeklyCounts[vid][weekNum] || 0) + 1;
            }

            // Simple last role/partner tracking (approximate based on order of masses)
            // Ideally we process chronologically.
        });
    });

    return { assignmentsHistory, weeklyCounts, lastRole, lastPartner };
};

export const repairSchedule = (
    currentSchedule: MonthlySchedule,
    volunteers: Volunteer[],
    conflictingId: string,
    conflictingDateStr: string // yyyy-MM-dd
): { schedule: MonthlySchedule, changes: string[] } => {
    // Deep copy schedule to avoid mutation
    const schedule = JSON.parse(JSON.stringify(currentSchedule));
    // Re-hydrate dates
    schedule.masses.forEach((m: any) => {
        const d = (m.date.seconds) ? new Date(m.date.seconds * 1000) : new Date(m.date);
        m.date = Timestamp.fromDate(d);
    });

    const changes: string[] = [];

    // 1. Build stats from *current* schedule
    const { assignmentsHistory, weeklyCounts, lastRole, lastPartner } = buildStatsFromSchedule(schedule, volunteers);

    // 2. Find the mass(es) with conflict
    schedule.masses.forEach((mass: Mass) => {
        const date = mass.date.toDate();
        const dateStr = format(date, 'yyyy-MM-dd');

        if (dateStr === conflictingDateStr) {
            // Check if conflicting ID is in this mass
            const entries = Object.entries(mass.assignments);
            for (const [role, vid] of entries) {
                if (vid === conflictingId) {
                    // Start Repair
                    // A. Remove conflicted volunteer from stats "temporarily" for validation?
                    // Actually, we are replacing them, so we just need to find someone ELSE who is valid.
                    // The valid checks in findBestCandidate will check against *their* history.
                    // We don't need to remove the conflicted guy from history because we are looking for a *different* person.

                    // Get current partners in this mass (excluding the one we are removing)
                    const currentPartners = Object.values(mass.assignments).filter(id => id !== conflictingId && id !== null) as string[];

                    // B. Find replacement
                    const replacement = findBestCandidate(
                        volunteers,
                        date,
                        date, // In repair, date is the mass date
                        getWeek(date),
                        role as Role,
                        mass.type,
                        assignmentsHistory,
                        weeklyCounts,
                        currentPartners,
                        lastRole, // These won't be perfectly accurate for mid-month repair but acceptable
                        lastPartner
                    );

                    if (replacement) {
                        mass.assignments[role as Role] = replacement.id;
                        changes.push(`${format(date, 'MMM d, h:mm a')}: Replaced ${volunteers.find(v => v.id === conflictingId)?.name} with ${replacement.name} as ${role}`);

                        // Update stats for the replacement so subsequent conflicts (if any) know they are taken
                        assignmentsHistory[replacement.id].push(dateStr);
                        if (mass.type === 'Weekday') {
                            weeklyCounts[replacement.id][getWeek(date)] = (weeklyCounts[replacement.id][getWeek(date)] || 0) + 1;
                        }
                    } else {
                        changes.push(`${format(date, 'MMM d, h:mm a')}: Could not find replacement for ${role} (was ${volunteers.find(v => v.id === conflictingId)?.name})`);
                        mass.assignments[role as Role] = null; // Unassign if no one found
                    }
                }
            }
        }
    });

    return { schedule, changes };
};
