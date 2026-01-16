import { Timestamp } from 'firebase/firestore';

export type Role = 'Lector1' | 'Commentator' | 'Lector2';

// Volunteer level: Lector (new, can only do Lector1) or Volunteer (experienced, can do all roles)
export type VolunteerLevel = 'Lector' | 'Volunteer';

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
    volunteerLevel: VolunteerLevel; // 'Lector' or 'Volunteer'

    // NEW: Time-based availability
    availabilityMode: AvailabilityMode; // 'always', 'except', or 'only'
    availableTimeSlots?: TimeSlot[]; // Times when volunteer IS available (for 'only' mode)
    unavailableTimeSlots?: TimeSlot[]; // Times when volunteer is NOT available (for 'except' mode)
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
