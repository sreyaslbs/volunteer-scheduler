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
    // 1. Check recurring weekly unavailability
    if (volunteer.unavailableDaysOfWeek?.includes(date.getDay())) {
        return false;
    }

    // 2. Check specific dates
    if (!volunteer.unavailableDates) return true;
    const dateStr = format(date, 'yyyy-MM-dd');
    return !volunteer.unavailableDates.some(ud => {
        const udDate = safeToDate(ud);
        return format(udDate, 'yyyy-MM-dd') === dateStr;
    });
};

// Helper to check if volunteer is available at a specific mass time
const isAvailableAtTime = (volunteer: Volunteer, massDate: Date, massType: string): boolean => {
    const massTime = format(massDate, 'HH:mm');

    // Weekday Availability check only for Weekday masses
    if (massType === 'Weekday') {
        if (volunteer.weekdayMassAvailability) {
            return volunteer.weekdayMassAvailability.includes(massTime);
        }
    }

    return true; // Default to available (Sunday/Special or if field missing)
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
            // Saturday Morning: 6:00 AM, 7:00 AM, 7:30 AM (Weekday type)
            ['06:00', '07:00', '07:30'].forEach(time => {
                dayMasses.push(createMass(day, time, 'Weekday'));
            });
            // Saturday Evening: Anticipated Sunday Masses - 5:30 PM, 6:30 PM, 7:30 PM
            ['17:30', '18:30', '19:30'].forEach(time => {
                dayMasses.push(createMass(day, time, 'Sunday'));
            });
        } else {
            // Weekday (Mon-Fri): 6:00 AM, 7:00 AM, 7:30 AM, 18:30 (6:30 PM)
            ['06:00', '07:00', '07:30', '18:30'].forEach(time => {
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
    const isSatMatins = isSaturday(date) && massDate.getHours() < 12;

    for (let pass = 0; pass <= 4; pass++) {
        const candidates = volunteers.filter(v => {
            if (v.isActive === false) return false;
            if (currentPartners.includes(v.id)) return false;

            // Pass 4: Relax unavailability (Calendar Red)
            if (pass < 4 && !isAvailable(v, date)) return false;

            // Pass 3: Relax Time-based / Trainee preferences
            if (pass < 3 && !isAvailableAtTime(v, massDate, massType)) return false;
            if (v.volunteerLevel === 'Trainee') {
                const preferences = v.traineeRolePreference || ['Lector2'];
                if (!preferences.includes(role)) return false;
            }

            // Pass 2: Relax Same Day
            if (pass < 2 && history[v.id].includes(dateStr)) return false;

            // Pass 1: Relax Consecutive Days / Weekday Limit
            if (pass === 0) {
                const prevDate = new Date(dateStr);
                prevDate.setDate(prevDate.getDate() - 1);
                if (history[v.id].includes(format(prevDate, 'yyyy-MM-dd'))) return false;

                const nextDate = new Date(dateStr);
                nextDate.setDate(nextDate.getDate() + 1);
                if (history[v.id].includes(format(nextDate, 'yyyy-MM-dd'))) return false;

                if (massType === 'Weekday' && !isSatMatins) {
                    const count = weeklyCounts[v.id][weekNum] || 0;
                    if (count >= 1) return false;
                }
            }

            return true;
        });

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                let sA = 0, sB = 0;
                sA -= history[a.id].length * 10;
                sB -= history[b.id].length * 10;
                if (lastRole[a.id] !== role) sA += 5;
                if (lastRole[b.id] !== role) sB += 5;
                if (!currentPartners.includes(lastPartner[a.id])) sA += 3;
                if (!currentPartners.includes(lastPartner[b.id])) sB += 3;
                return (sB - sA) + (Math.random() - 0.5) * 5;
            });
            return candidates[0];
        }
    }
    return null;
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
