import { Timestamp } from 'firebase/firestore';

export type Role = 'Lector1' | 'Commentator' | 'Lector2';

export interface Volunteer {
    id: string;
    name: string;
    roles: Role[];
    unavailableDates: Timestamp[]; // Firestore Timestamp
    // For tracking fairness/usage (optional, usually calculated on fly)
    assignmentCount?: number;
    isActive?: boolean;
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
}

export interface MonthlySchedule {
    id: string; // YYYY-MM
    month: number; // 0-11
    year: number;
    masses: Mass[];
}
