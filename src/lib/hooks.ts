import { useState, useEffect } from 'react';
import { collection, getDocs, Timestamp, doc, updateDoc, writeBatch, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from './firebase';
import type { Volunteer, AppUser, UserRole } from '../types';

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
                    volunteerLevel: data.volunteerLevel || 'Volunteer', // Existing volunteers default to 'Volunteer' level
                    availabilityMode: data.availabilityMode || 'always',
                    availableTimeSlots: data.availableTimeSlots || [],
                    unavailableTimeSlots: data.unavailableTimeSlots || []
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
                volunteerLevel: 'Lector', // New volunteers default to Lector level
                availabilityMode: 'always' // Default to always available
            };

            // Optimistic update
            const updatedList = [...volunteers, newVol];
            setVolunteers(updatedList);
            localStorage.setItem('volunteers_cache', JSON.stringify(updatedList));

            await setDoc(docRef, {
                name,
                roles: ['Lector1', 'Commentator'],
                unavailableDates: [],
                volunteerLevel: 'Lector',
                availabilityMode: 'always'
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
                volunteerLevel: 'Volunteer', // Seeded volunteers are experienced
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
                    availabilityMode: v.availabilityMode
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

    const updateVolunteerLevel = async (id: string, level: 'Lector' | 'Volunteer') => {
        try {
            const ref = doc(db, 'volunteers', id);
            await updateDoc(ref, { volunteerLevel: level });
            setVolunteers(prev => prev.map(v => v.id === id ? { ...v, volunteerLevel: level } : v));
        } catch (e) {
            console.error("Error updating volunteer level", e);
        }
    };

    const updateTimeAvailability = async (
        id: string,
        mode: 'always' | 'except' | 'only',
        availableSlots?: { start: string; end: string }[],
        unavailableSlots?: { start: string; end: string }[]
    ) => {
        try {
            const ref = doc(db, 'volunteers', id);
            const updateData: any = {
                availabilityMode: mode,
                availableTimeSlots: availableSlots || [],
                unavailableTimeSlots: unavailableSlots || []
            };
            await updateDoc(ref, updateData);
            setVolunteers(prev => prev.map(v => v.id === id ? {
                ...v,
                availabilityMode: mode,
                availableTimeSlots: availableSlots,
                unavailableTimeSlots: unavailableSlots
            } : v));
        } catch (e) {
            console.error("Error updating time availability", e);
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
        updateTimeAvailability
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
            // Race Firestore against a 2-second timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 2000)
            );
            const docRef = doc(db, 'schedules', scheduleId);
            const docPromise = getDoc(docRef);

            const docSnap = await Promise.race([docPromise, timeoutPromise]) as any;

            if (docSnap.exists()) {
                const data = docSnap.data();
                setSchedule(data);
                localStorage.setItem(cacheKey, JSON.stringify(data));
            } else {
                setSchedule(null);
            }
        } catch (e) {
            console.warn("Firebase slow or failed, falling back to cache.", e);
            // Fallback to local storage
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

    useEffect(() => {
        fetchSchedule();
    }, [month, year]);

    return { schedule, loading, fetchSchedule, setSchedule };
};
