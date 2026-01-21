import { useState, useEffect } from 'react';
import { collection, getDocs, Timestamp, doc, updateDoc, writeBatch, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from './firebase';
import type { Volunteer, AppUser, UserRole, Role, MassTiming } from '../types';

const ADMIN_EMAIL = 'mailsuren2019@gmail.com';

export const useAuth = () => {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Determine Role
                let role: UserRole = 'Volunteer';

                let darkMode = false;

                if (firebaseUser.email === ADMIN_EMAIL) {
                    role = 'Admin';
                    // Admins are also managers effectively, check if they have a manager doc for prefs
                    const managerDoc = await getDoc(doc(db, 'managers', firebaseUser.email));
                    if (managerDoc.exists()) {
                        darkMode = managerDoc.data()?.darkMode || false;
                    }
                } else if (firebaseUser.email) {
                    // Check Firestore for Manager role
                    const managerDoc = await getDoc(doc(db, 'managers', firebaseUser.email));
                    if (managerDoc.exists()) {
                        role = 'Manager';
                        darkMode = managerDoc.data()?.darkMode || false;
                    }
                }

                setUser({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    photoURL: firebaseUser.photoURL,
                    role,
                    darkMode
                });
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { user, loading, isAdmin: user?.role === 'Admin', isManager: user?.role === 'Manager' || user?.role === 'Admin' };
};

export const useManagers = () => {
    const [managers, setManagers] = useState<{ email: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchManagers = async () => {
        setLoading(true);
        try {
            const snapshot = await getDocs(collection(db, 'managers'));
            const list = snapshot.docs.map(d => ({ email: d.id }));
            setManagers(list);
        } catch (e) {
            console.error("Error fetching managers", e);
        } finally {
            setLoading(false);
        }
    };

    const addManager = async (email: string) => {
        const cleanedEmail = email.trim().toLowerCase();
        if (!cleanedEmail) return;
        await setDoc(doc(db, 'managers', cleanedEmail), { addedAt: Timestamp.now() });
        fetchManagers();
    };

    const removeManager = async (email: string) => {
        await deleteDoc(doc(db, 'managers', email));
        fetchManagers();
    };

    useEffect(() => {
        fetchManagers();
    }, []);

    return { managers, loading, addManager, removeManager };
};

export const useVolunteers = () => {
    const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchVolunteers = async () => {
        try {
            // Race Firestore against a 2-second timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 2000)
            );

            const snapshotPromise = getDocs(collection(db, 'volunteers'));

            const querySnapshot = await Promise.race([snapshotPromise, timeoutPromise]) as any;

            const vList: Volunteer[] = querySnapshot.docs.map((d: any) => {
                const data = d.data();
                // Migration: Add default values for new fields if they don't exist
                return {
                    id: d.id,
                    ...data,
                    volunteerLevel: data.volunteerLevel === 'Trainee' ? 'Trainee' : 'Lector',
                    // Robust array migration: ensure it's always an array of Role
                    traineeRolePreference: Array.isArray(data.traineeRolePreference)
                        ? (data.traineeRolePreference.length > 0 ? data.traineeRolePreference : ['Lector2'])
                        : (data.traineeRolePreference ? [data.traineeRolePreference] : ['Lector2']),
                    weekdayMassAvailability: data.weekdayMassAvailability || ['06:00', '07:00', '07:30', '18:30'],
                    unavailableDaysOfWeek: data.unavailableDaysOfWeek || []
                };
            }) as Volunteer[];
            setVolunteers(vList);
            localStorage.setItem('volunteers_cache', JSON.stringify(vList));
        } catch (e) {
            console.warn("Firebase slow or failed, falling back to cache.", e);
            // Fallback to local storage
            const cached = localStorage.getItem('volunteers_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Re-hydrate objects
                const hydrated = parsed.map((v: any) => ({
                    ...v,
                    unavailableDates: v.unavailableDates.map((d: any) => {
                        // If it's a string, wrap it in a mock Timestamp-like object or just parsing logic above handles it
                        // Best to standardise on something that has .toDate() if code expects it, 
                        // but logic above now handles both. Let's just return the strings/dates as is 
                        // but ensuring they aren't completely broken. 
                        // actually, to be safe for other parts of app, let's mock checks
                        if (typeof d === 'string') return { toDate: () => new Date(d) };
                        return d;
                    })
                }));
                setVolunteers(hydrated);
            }
        } finally {
            setLoading(false);
        }
    };

    const addVolunteer = async (name: string) => {
        try {
            const docRef = doc(collection(db, 'volunteers'));
            const newVol: Volunteer = {
                id: docRef.id,
                name,
                roles: ['Lector1', 'Commentator'],
                unavailableDates: [],
                volunteerLevel: 'Trainee', // New volunteers default to Trainee level
                traineeRolePreference: ['Lector2'],
                weekdayMassAvailability: ['06:00', '07:00', '07:30', '18:30'],
                unavailableDaysOfWeek: []
            };

            // Optimistic update
            const updatedList = [...volunteers, newVol];
            setVolunteers(updatedList);
            localStorage.setItem('volunteers_cache', JSON.stringify(updatedList));

            await setDoc(docRef, {
                name,
                roles: ['Lector1', 'Commentator'],
                unavailableDates: [],
                volunteerLevel: 'Trainee',
                traineeRolePreference: ['Lector2'],
                weekdayMassAvailability: ['06:00', '07:00', '07:30', '18:30'],
                unavailableDaysOfWeek: []
            });
        } catch (e) {
            console.error("Error adding volunteer (background sync failed)", e);
        }
    };

    const updateAvailability = async (id: string, dates: Timestamp[]) => {
        try {
            const ref = doc(db, 'volunteers', id);
            await updateDoc(ref, { unavailableDates: dates });
            // Optimistic update or refetch
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, unavailableDates: dates } : v));
        } catch (e) {
            console.error("Error updating availability", e);
        }
    };

    const seedVolunteers = async (names: string[]) => {
        try {
            // 1. Generate local objects immediately with random IDs (or valid Firestore IDs)
            // Existing volunteers get 'Volunteer' level (experienced)
            const newVolunteers: Volunteer[] = names.map(name => ({
                id: doc(collection(db, 'volunteers')).id, // Generate ID locally
                name,
                roles: ['Lector1', 'Commentator'],
                unavailableDates: [],
                volunteerLevel: 'Lector', // Seeded volunteers are experienced
                availabilityMode: 'always'
            }));

            // 2. Optimistic UI update
            const updatedList = [...volunteers, ...newVolunteers];
            setVolunteers(updatedList);
            localStorage.setItem('volunteers_cache', JSON.stringify(updatedList));

            // 3. Fire and forget (or async wait) the server update
            // We do this in a non-blocking way or we accept that it might fail silently in UI but logs error
            // If offline, this will just fail or queue. For now, we try to push.
            const batch = writeBatch(db);
            newVolunteers.forEach(v => {
                const docRef = doc(db, 'volunteers', v.id);
                batch.set(docRef, {
                    name: v.name,
                    roles: v.roles,
                    unavailableDates: v.unavailableDates,
                    volunteerLevel: v.volunteerLevel,
                    traineeRolePreference: v.traineeRolePreference || ['Lector2'],
                    weekdayMassAvailability: ['06:00', '07:00', '07:30', '18:30']
                });
            });

            // Don't await if we want instant UI, but good to await to know if it fails.
            // Given the user's issue, let's await but catch error so UI stays populated.
            await batch.commit();
        } catch (e) {
            console.error("Error seeding volunteers (background sync failed)", e);
            // We keep the local data!
        }
    };

    useEffect(() => {
        fetchVolunteers();
    }, []);

    const removeFutureAssignments = async (volunteerId: string) => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Fetch schedules potentially related
            // Since we store schedules by 'yyyy-MM', we can start from current month
            // To be thorough, for now we can scan sll relevant collections or rely on a known range.
            // Simplified approach: Query all schedules. In production, perform range query on ID or date.
            const q = collection(db, 'schedules');
            const querySnapshot = await getDocs(q);

            const batch = writeBatch(db);
            let updateCount = 0;

            querySnapshot.forEach(docSnap => {
                const schedule = docSnap.data() as any;
                let modified = false;

                // Check month/year first to skip past schedules efficiently?
                // Or just iterate masses.
                schedule.masses.forEach((mass: any) => {
                    const massDate = mass.date.toDate ? mass.date.toDate() : new Date(mass.date.seconds * 1000);
                    if (massDate >= today) {
                        // Check assignments
                        Object.keys(mass.assignments).forEach(role => {
                            if (mass.assignments[role] === volunteerId) {
                                mass.assignments[role] = null;
                                modified = true;
                            }
                        });
                    }
                });

                if (modified) {
                    batch.set(docSnap.ref, schedule); // Using set to overwrite entire doc with modification
                    updateCount++;
                }
            });

            if (updateCount > 0) {
                await batch.commit();
                console.log(`Removed future assignments for ${volunteerId} in ${updateCount} schedules.`);
            }

        } catch (e) {
            console.error("Error removing future assignments", e);
            throw e; // Rethrow so UI can alert
        }
    };

    const toggleVolunteerStatus = async (id: string, active: boolean) => {
        try {
            const ref = doc(db, 'volunteers', id);
            await updateDoc(ref, { isActive: active });
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, isActive: active } : v));
        } catch (e) {
            console.error("Error toggling volunteer status", e);
        }
    };

    const updateVolunteerLevel = async (id: string, level: 'Trainee' | 'Lector') => {
        try {
            const ref = doc(db, 'volunteers', id);
            const updateData: any = { volunteerLevel: level };
            if (level === 'Trainee') {
                updateData.traineeRolePreference = ['Lector2']; // Reset/Set default when switching to trainee
            }
            await updateDoc(ref, updateData);
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, ...updateData } : v));
        } catch (e) {
            console.error("Error updating volunteer level", e);
        }
    };

    const updateTraineePreference = async (id: string, preference: Role[]) => {
        try {
            const ref = doc(db, 'volunteers', id);
            await updateDoc(ref, { traineeRolePreference: preference });
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, traineeRolePreference: preference } : v));
        } catch (e) {
            console.error("Error updating trainee preference", e);
        }
    };

    const updateWeekdayAvailability = async (id: string, slots: string[]) => {
        try {
            const ref = doc(db, 'volunteers', id);
            await updateDoc(ref, { weekdayMassAvailability: slots });
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, weekdayMassAvailability: slots } : v));
        } catch (e) {
            console.error("Error updating weekday availability", e);
        }
    };

    const updateRecurringAvailability = async (id: string, days: number[]) => {
        try {
            const ref = doc(db, 'volunteers', id);
            await updateDoc(ref, { unavailableDaysOfWeek: days });
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, unavailableDaysOfWeek: days } : v));
        } catch (e) {
            console.error("Error updating recurring availability", e);
        }
    };

    const deleteVolunteer = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this volunteer? This action cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, 'volunteers', id));
            setVolunteers(prev => prev.filter(v => v.id !== id));
            // Also update cache
            const cached = localStorage.getItem('volunteers_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                const updated = parsed.filter((v: any) => v.id !== id);
                localStorage.setItem('volunteers_cache', JSON.stringify(updated));
            }
        } catch (e) {
            console.error("Error deleting volunteer", e);
            alert("Failed to delete volunteer.");
        }
    };

    return {
        volunteers,
        loading,
        addVolunteer,
        deleteVolunteer,
        updateAvailability,
        seedVolunteers,
        removeFutureAssignments,
        toggleVolunteerStatus,
        updateVolunteerLevel,
        updateTraineePreference,
        updateWeekdayAvailability,
        updateRecurringAvailability
    };
};

// ... existing export useVolunteers ...

export const useSchedule = (month: number, year: number) => {
    const [schedule, setSchedule] = useState<any | null>(null); // Type 'MonthlySchedule' ideally
    const [loading, setLoading] = useState(false);

    const fetchSchedule = async () => {
        setLoading(true);
        const scheduleId = `${year}-${String(month).padStart(2, '0')}`;
        const cacheKey = `schedule_${scheduleId}`;
        try {
            const docRef = doc(db, 'schedules', scheduleId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setSchedule(data);
                localStorage.setItem(cacheKey, JSON.stringify(data));
            } else {
                setSchedule(null);
            }
        } catch (e) {
            console.warn("Firebase slow or failed, falling back to cache.", e);
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                const rehydrated = {
                    ...parsed,
                    masses: parsed.masses.map((m: any) => {
                        const seconds = m.date.seconds || (new Date(m.date).getTime() / 1000);
                        return {
                            ...m,
                            date: {
                                seconds,
                                nanoseconds: m.date.nanoseconds || 0
                            }
                        };
                    })
                };
                setSchedule(rehydrated);
            } else {
                setSchedule(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const updateMonthMassTimings = async (timings: MassTiming[]) => {
        if (!schedule) return;
        const scheduleId = `${year}-${String(month).padStart(2, '0')}`;
        const ref = doc(db, 'schedules', scheduleId);

        const updatedSchedule = { ...schedule, massTimings: timings };
        await updateDoc(ref, { massTimings: timings });
        setSchedule(updatedSchedule);
        localStorage.setItem(`schedule_${scheduleId}`, JSON.stringify(updatedSchedule));
    };

    useEffect(() => {
        fetchSchedule();
    }, [month, year]);

    return { schedule, loading, fetchSchedule, setSchedule, updateMonthMassTimings };
};

export const useMassTimings = () => {
    const [defaultTimings, setDefaultTimings] = useState<MassTiming[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDefaultTimings = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, 'settings', 'massTimings');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setDefaultTimings(docSnap.data().timings || []);
            } else {
                // Fallback to hardcoded defaults if not in Firestore
                const defaults: MassTiming[] = [
                    // Sunday
                    ...['06:00', '07:30', '09:00', '10:30', '16:00', '17:30', '19:00'].map(t => ({ id: crypto.randomUUID(), dayOfWeek: 0, time: t, type: 'Sunday' as const })),
                    // Monday - Friday
                    ...[1, 2, 3, 4, 5].flatMap(d => ['06:00', '07:00', '07:30', '18:30'].map(t => ({ id: crypto.randomUUID(), dayOfWeek: d, time: t, type: 'Weekday' as const }))),
                    // Saturday
                    ...['06:00', '07:00', '07:30'].map(t => ({ id: crypto.randomUUID(), dayOfWeek: 6, time: t, type: 'Weekday' as const })),
                    ...['17:30', '18:30', '19:30'].map(t => ({ id: crypto.randomUUID(), dayOfWeek: 6, time: t, type: 'Sunday' as const })),
                ];
                setDefaultTimings(defaults);
            }
        } catch (e) {
            console.error("Error fetching mass timings", e);
        } finally {
            setLoading(false);
        }
    };

    const updateDefaultTimings = async (timings: MassTiming[]) => {
        try {
            const docRef = doc(db, 'settings', 'massTimings');
            await setDoc(docRef, { timings });
            setDefaultTimings(timings);
        } catch (e) {
            console.error("Error updating mass timings", e);
            throw e;
        }
    };

    useEffect(() => {
        fetchDefaultTimings();
    }, []);

    return { defaultTimings, loading, updateDefaultTimings };
};
