import { useState, useEffect } from 'react';
import { collection, getDocs, Timestamp, doc, updateDoc, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Volunteer } from '../types';

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

            const vList: Volunteer[] = querySnapshot.docs.map((d: any) => ({
                id: d.id,
                ...d.data()
            })) as Volunteer[];
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
                unavailableDates: []
            };

            // Optimistic update
            const updatedList = [...volunteers, newVol];
            setVolunteers(updatedList);
            localStorage.setItem('volunteers_cache', JSON.stringify(updatedList));

            await setDoc(docRef, {
                name,
                roles: ['Lector1', 'Commentator'],
                unavailableDates: []
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
            const newVolunteers: Volunteer[] = names.map(name => ({
                id: doc(collection(db, 'volunteers')).id, // Generate ID locally
                name,
                roles: ['Lector1', 'Commentator'],
                unavailableDates: []
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
                    unavailableDates: v.unavailableDates
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

    return { volunteers, loading, addVolunteer, updateAvailability, seedVolunteers, removeFutureAssignments, toggleVolunteerStatus };
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
