import { Timestamp } from 'firebase/firestore';

export type Role = 'Lector1' | 'Commentator' | 'Lector2';

// Volunteer level: Trainee (new, can do Lector1 or Lector2) or Lector (experienced, can do all roles)
export type VolunteerLevel = 'Trainee' | 'Lector';

// Availability mode for time-based constraints
export type AvailabilityMode = 'always' | 'except' | 'only';

// Time slot for availability constraints
export interface TimeSlot {
    start: string; // Format: "HH:mm" (24-hour)
    end: string;   // Format: "HH:mm" (24-hour)
}

export interface Volunteer {
    id: string;
    name: string;
    roles: Role[];
    unavailableDates: Timestamp[]; // Firestore Timestamp
    // For tracking fairness/usage (optional, usually calculated on fly)
    assignmentCount?: number;
    isActive?: boolean;

    // NEW: Volunteer level system
    volunteerLevel: VolunteerLevel; // 'Trainee' or 'Lector'
    traineeRolePreference?: Role[]; // Preferences for Trainees (List of roles they can do)

    // NEW: Weekday Mass Availability (specific slots: 06:00, 07:00, 07:30, 18:30)
    weekdayMassAvailability?: string[]; // e.g., ["06:00", "18:30"]

    // NEW: Recurring Weekly Unavailability (0=Sun, 1=Mon, ..., 6=Sat)
    unavailableDaysOfWeek?: number[];
}

export interface Assignment {
    role: Role;
    volunteerId: string;
}

export interface Mass {
    id: string; // unique ID relative to schedule or global
    date: Timestamp;
    type: 'Weekday' | 'Sunday' | 'Special';
    assignments: Record<Role, string | null>; // Role -> Volunteer ID
    name?: string; // For Special masses

    // NEW: Enhanced descriptions for special events
    description?: string; // Detailed description (e.g., "Solemnity of the Immaculate Conception")
    isHighlighted?: boolean; // Whether to visually highlight this event
}

export interface MonthlySchedule {
    id: string; // YYYY-MM
    month: number; // 0-11
    year: number;
    masses: Mass[];
}

export type UserRole = 'Admin' | 'Manager' | 'Volunteer';

export interface AppUser {
    uid: string;
    email: string | null;
    role: UserRole;
    displayName: string | null;
    photoURL: string | null;
    darkMode?: boolean;
}
