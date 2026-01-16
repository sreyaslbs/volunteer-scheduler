import { useState } from 'react';
import { useVolunteers, useSchedule, useAuth } from '../lib/hooks';
import { format, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, X, AlertTriangle, RefreshCw, UserPlus, Trash2, Edit2, Clock, Plus } from 'lucide-react';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { Navigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { repairSchedule } from '../lib/scheduler';
import type { Volunteer } from '../types';

export default function AvailabilityPage() {
    const { loading: authLoading, isManager } = useAuth();
    const { volunteers, loading, updateAvailability, addVolunteer, deleteVolunteer, toggleVolunteerStatus, updateVolunteerLevel, updateTimeAvailability } = useVolunteers();

    const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Fetch schedule for conflict check
    const { schedule, setSchedule } = useSchedule(currentMonth.getMonth() + 1, currentMonth.getFullYear());

    // Conflict State
    const [conflict, setConflict] = useState<string[] | null>(null);
    const [pendingDates, setPendingDates] = useState<Timestamp[] | null>(null);
    const [isRegenerating, setIsRegenerating] = useState(false);

    if (authLoading) return <div className="p-8 text-center text-gray-500">Authenticating...</div>;
    if (!isManager) return <Navigate to="/" replace />;


    const selectedVolunteer = selectedVolunteerId ? volunteers.find(v => v.id === selectedVolunteerId) || null : null;
    const isModalOpen = !!selectedVolunteerId;

    const closeModal = () => {
        setSelectedVolunteerId(null);
        setConflict(null);
        setPendingDates(null);
        setIsRegenerating(false);
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const prevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };



    const handleUpdateAttempt = (dates: Timestamp[]) => {
        if (!selectedVolunteer) return;

        // 1. Check for conflicts with CURRENT month's existing schedule
        // Note: dates contains ALL unavailable dates for user. We need to check if any of them 
        // match an assignment in the LOADED schedule.

        if (schedule) {
            const conflictingDates: string[] = [];

            schedule.masses.forEach((mass: any) => {
                const massDateStr = format(mass.date.toDate(), 'yyyy-MM-dd');

                // Check if user is assigned to this mass
                const isAssigned = Object.values(mass.assignments).includes(selectedVolunteer.id);

                if (isAssigned) {
                    // Check if this date is newly marked as unavailable
                    const isNowUnavailable = dates.some(d => {
                        const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
                        return format(dObj, 'yyyy-MM-dd') === massDateStr;
                    });

                    if (isNowUnavailable) {
                        conflictingDates.push(massDateStr);
                    }
                }
            });

            if (conflictingDates.length > 0) {
                // Determine if these are NEW conflicts (i.e. wasn't unavailable before)
                // Actually simpler: if they are assigned AND marked unavailable, it's a conflict to resolve.
                setConflict(Array.from(new Set(conflictingDates))); // Unique dates
                setPendingDates(dates);
                return;
            }
        }

        // No conflict, proceed
        updateAvailability(selectedVolunteer.id, dates);
    };

    const proceedWithConflict = async (regenerate: boolean) => {
        if (!selectedVolunteer || !pendingDates) return;

        // 1. Update Availability
        await updateAvailability(selectedVolunteer.id, pendingDates);

        if (regenerate && conflict && schedule) {
            setIsRegenerating(true);
            try {
                // 2. Perform Minimal Repair
                // We need to pass the updated volunteer list (with new unavailability) to the repair function
                // or ensure the repair function checks unavailability correctly.
                // Since updateAvailability is async and might not propagate to 'volunteers' hook state instantly,
                // we manually construct the updated volunteer list.
                const updatedVolunteers = volunteers.map(v =>
                    v.id === selectedVolunteer.id ? { ...v, unavailableDates: pendingDates } : v
                );

                let currentScheduleState = schedule;
                const allChanges: string[] = [];

                // Attempt repair for each conflicting date
                conflict.forEach(dateStr => {
                    const result = repairSchedule(currentScheduleState, updatedVolunteers, selectedVolunteer.id, dateStr);
                    currentScheduleState = result.schedule;
                    allChanges.push(...result.changes);
                });

                // 3. Save Updated Schedule
                const scheduleId = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
                await setDoc(doc(db, 'schedules', scheduleId), currentScheduleState);
                setSchedule(currentScheduleState); // Update local hook state

                // 4. Show Diff to User
                if (allChanges.length > 0) {
                    alert(`Schedule Updated:\n\n${allChanges.join('\n')}`);
                } else {
                    alert("Schedule saved. No suitable replacements found for some slots.");
                }

            } catch (e) {
                console.error("Repair failed", e);
                alert("Failed to repair schedule.");
            } finally {
                setIsRegenerating(false);
            }
        }

        closeModal();
    };

    const getUnavailableDatesText = (v: Volunteer) => {
        if (!v.unavailableDates || v.unavailableDates.length === 0) return <span className="text-gray-400 italic">Available all month</span>;

        const datesInMonth = v.unavailableDates
            .map(d => (d as any).toDate ? (d as any).toDate() : new Date(d as any))
            .filter(d => isSameMonth(d, currentMonth))
            .sort((a, b) => a.getTime() - b.getTime());

        if (datesInMonth.length === 0) return <span className="text-gray-400 italic">Available all month</span>;

        return (
            <div className="flex flex-wrap gap-1">
                {datesInMonth.map(d => (
                    <span key={d.toISOString()} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                        {format(d, 'd MMM')}
                    </span>
                ))}
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading volunteers...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 sm:mb-0">Manage Availability</h2>
                <div className="flex items-center space-x-4 bg-gray-50 dark:bg-gray-700 p-1 rounded-lg">
                    <button onClick={prevMonth} className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-md shadow-sm transition-all text-gray-600 dark:text-gray-300">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-gray-900 dark:text-white w-32 text-center select-none">{format(currentMonth, 'MMMM yyyy')}</span>
                    <button onClick={nextMonth} className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-md shadow-sm transition-all text-gray-600 dark:text-gray-300">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors duration-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unavailable Dates ({format(currentMonth, 'MMM')})</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {volunteers
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(v => (
                                    <tr
                                        key={v.id}
                                        className={clsx(
                                            "transition-colors cursor-pointer group",
                                            v.isActive === false ? "bg-gray-50 dark:bg-gray-900/50 opacity-60 hover:bg-gray-100 dark:hover:bg-gray-900" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 bg-white dark:bg-gray-800"
                                        )}
                                        onClick={() => setSelectedVolunteerId(v.id)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-900 dark:text-gray-200">{v.name}</span>
                                                <span className={clsx(
                                                    "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded w-fit mt-1",
                                                    v.volunteerLevel === 'Volunteer' ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                                )}>
                                                    {v.volunteerLevel || 'Lector'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">{getUnavailableDatesText(v)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-indigo-600 hover:text-indigo-800 p-2 rounded-full hover:bg-indigo-50 transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            {volunteers.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-gray-400">No volunteers found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && selectedVolunteer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeModal}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        {conflict ? (
                            <div className="p-6 overflow-y-auto">
                                <div className="flex items-center space-x-3 mb-4 text-amber-600">
                                    <AlertTriangle className="w-8 h-8" />
                                    <h3 className="font-bold text-lg">Schedule Conflict Detected</h3>
                                </div>
                                <p className="text-gray-600 mb-4">
                                    <span className="font-semibold">{selectedVolunteer.name}</span> is currently assigned to a mass on:
                                </p>
                                <ul className="list-disc list-inside mb-6 bg-amber-50 p-4 rounded-lg text-amber-900 border border-amber-100">
                                    {conflict.map(d => (
                                        <li key={d}>{format(new Date(d), 'EEEE, MMMM d')}</li>
                                    ))}
                                </ul>
                                <p className="text-sm text-gray-500 mb-6">
                                    Do you want to update the schedule automatically?
                                </p>
                                <div className="flex space-x-3 justify-end">
                                    <button
                                        onClick={() => setConflict(null)}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => proceedWithConflict(false)}
                                        className="px-4 py-2 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 font-medium"
                                    >
                                        Mark Only
                                    </button>
                                    <button
                                        onClick={() => proceedWithConflict(true)}
                                        disabled={isRegenerating}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center shadow-sm"
                                    >
                                        {isRegenerating && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
                                        Update & Regenerate
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{selectedVolunteer.name}</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Mark dates as unavailable</p>
                                    </div>
                                    <button onClick={closeModal} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                                    <div className="space-y-8">
                                        {/* 1. Volunteer Level */}
                                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Volunteer Level</label>
                                            <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg w-fit">
                                                {(['Lector', 'Volunteer'] as const).map(level => (
                                                    <button
                                                        key={level}
                                                        onClick={() => updateVolunteerLevel(selectedVolunteer.id, level)}
                                                        className={clsx(
                                                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                                            selectedVolunteer.volunteerLevel === level
                                                                ? "bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm"
                                                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                                        )}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="mt-3 text-sm text-gray-600">
                                                {selectedVolunteer.volunteerLevel === 'Lector'
                                                    ? "• Can be assigned as Lector 1 or Lector 2"
                                                    : "• Experienced: Can do all roles (Lector 1, Lector 2, Commentator)"}
                                            </p>
                                        </div>

                                        {/* 2. Time Availability Profile */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100">Time Availability Settings</h4>
                                            </div>
                                            <TimeAvailabilityEditor
                                                volunteer={selectedVolunteer}
                                                onUpdate={(mode: 'always' | 'except' | 'only', slots: { start: string, end: string }[]) => {
                                                    if (mode === 'only') updateTimeAvailability(selectedVolunteer.id, mode, slots, []);
                                                    else if (mode === 'except') updateTimeAvailability(selectedVolunteer.id, mode, [], slots);
                                                    else updateTimeAvailability(selectedVolunteer.id, mode, [], []);
                                                }}
                                            />
                                        </div>

                                        {/* 3. Calendar for Specific Dates */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <ChevronRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100">Mark Busy Dates</h4>
                                            </div>
                                            <CalendarView
                                                volunteer={selectedVolunteer}
                                                month={currentMonth}
                                                onUpdate={handleUpdateAttempt}
                                            />
                                        </div>

                                        {/* 4. Unavailable Indefinitely */}
                                        <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
                                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl p-4">
                                                <label className="flex items-center space-x-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedVolunteer.isActive === false}
                                                        onChange={(e) => {
                                                            const isInactive = e.target.checked;
                                                            toggleVolunteerStatus(selectedVolunteer.id, !isInactive);
                                                        }}
                                                        className="w-5 h-5 text-red-600 rounded border-gray-300 dark:border-gray-600 focus:ring-red-500 dark:bg-gray-800"
                                                    />
                                                    <div>
                                                        <span className="text-sm font-bold text-red-900 dark:text-red-300">Mark as Unavailable Indefinitely</span>
                                                        <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                                                            {selectedVolunteer.isActive === false
                                                                ? "Volunteer is currently disabled and won't be assigned."
                                                                : "Disables volunteer for all future schedules."}
                                                        </p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <button
                                        onClick={async () => {
                                            await deleteVolunteer(selectedVolunteer.id);
                                            closeModal();
                                        }}
                                        className="px-4 py-2 text-red-600 hover:text-red-700 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete User
                                    </button>
                                    <button
                                        onClick={closeModal}
                                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                        Done
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mt-6 transition-colors duration-200">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Manage Volunteers
                </h3>

                <div className="grid grid-cols-1 gap-8">
                    <div>
                        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Add New Volunteer</h4>
                        <AddVolunteerForm onAdd={addVolunteer} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function CalendarView({ volunteer, month, onUpdate }: { volunteer: Volunteer, month: Date, onUpdate: (dates: Timestamp[]) => void }) {
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');

    const days = eachDayOfInterval({
        start: startOfMonth(month),
        end: endOfMonth(month)
    });

    const isUnavailable = (date: Date) => {
        if (!volunteer.unavailableDates) return false;
        const dateStr = format(date, 'yyyy-MM-dd');
        return volunteer.unavailableDates.some(d => {
            const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
            return format(dObj, 'yyyy-MM-dd') === dateStr;
        });
    };

    const toggleDate = (date: Date) => {
        const existingDates = volunteer.unavailableDates || [];
        const dateStr = format(date, 'yyyy-MM-dd');
        const exists = isUnavailable(date);

        let newDates: Timestamp[];
        if (exists) {
            newDates = existingDates.filter(d => {
                const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
                return format(dObj, 'yyyy-MM-dd') !== dateStr;
            });
        } else {
            // Check if we need to store as Timestamp or generic Date object depending on how hooks handles it
            // Hooks expects Timestamp, but our mock might be string. 
            // Ideally we create a Timestamp.fromDate(date) if firebase import works, else mock.
            // Since we import Timestamp, let's use it.
            newDates = [...existingDates, Timestamp.fromDate(date)];
        }
        onUpdate(newDates);
    };

    const handleRangeSubmit = () => {
        if (!rangeStart || !rangeEnd) return;
        const start = new Date(rangeStart + 'T00:00:00');
        const end = new Date(rangeEnd + 'T00:00:00');

        if (end < start) {
            alert("End date must be after start date");
            return;
        }

        const rangeDays = eachDayOfInterval({ start, end });

        // Merge
        const existingDates = volunteer.unavailableDates || [];
        const existingStrings = new Set(existingDates.map(d => {
            const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
            return format(dObj, 'yyyy-MM-dd');
        }));

        const newDates: Timestamp[] = [...existingDates];

        rangeDays.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (!existingStrings.has(dayStr)) {
                newDates.push(Timestamp.fromDate(day));
                existingStrings.add(dayStr);
            }
        });

        onUpdate(newDates);
        setRangeStart('');
        setRangeEnd('');
    };

    return (
        <div>
            <div className="mb-4 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Mark Range Unavailable</div>
                <div className="flex items-end gap-2">
                    <div className="flex-1">
                        <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">From</label>
                        <input
                            type="date"
                            className="w-full text-xs p-1 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-600"
                            value={rangeStart}
                            onChange={e => setRangeStart(e.target.value)}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">To</label>
                        <input
                            type="date"
                            className="w-full text-xs p-1 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-600"
                            value={rangeEnd}
                            onChange={e => setRangeEnd(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleRangeSubmit}
                        disabled={!rangeStart || !rangeEnd}
                        className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 h-[26px]"
                    >
                        Apply
                    </button>
                </div>
            </div>

            <div className="text-center font-semibold text-gray-800 dark:text-gray-100 mb-4">{format(month, 'MMMM yyyy')}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOfMonth(month).getDay() }).map((_, i) => (
                    <div key={`pad - ${i} `} />
                ))}
                {days.map(day => {
                    const marked = isUnavailable(day);
                    return (
                        <button
                            key={day.toISOString()}
                            onClick={() => toggleDate(day)}
                            className={clsx(
                                "aspect-square rounded-md flex items-center justify-center text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500",
                                marked
                                    ? "bg-red-500 text-white font-bold shadow-sm"
                                    : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                            )}
                        >
                            {format(day, 'd')}
                        </button>
                    );
                })}
            </div>
            <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span>Unavailable</span>
                <div className="w-3 h-3 bg-gray-100 dark:bg-gray-700 rounded ml-2"></div>
                <span>Available</span>
            </div>
        </div>
    );
}


function TimeAvailabilityEditor({ volunteer, onUpdate }: { volunteer: Volunteer, onUpdate: (mode: 'always' | 'except' | 'only', slots: { start: string, end: string }[]) => void }) {
    const slots = volunteer.availabilityMode === 'only'
        ? (volunteer.availableTimeSlots || [])
        : (volunteer.unavailableTimeSlots || []);

    const [newStart, setNewStart] = useState('09:00');
    const [newEnd, setNewEnd] = useState('10:00');

    const handleAddSlot = () => {
        if (newStart >= newEnd) {
            alert("End time must be after start time");
            return;
        }
        const newSlots = [...slots, { start: newStart, end: newEnd }];
        onUpdate(volunteer.availabilityMode, newSlots);
    };

    const handleRemoveSlot = (index: number) => {
        const newSlots = slots.filter((_, i) => i !== index);
        onUpdate(volunteer.availabilityMode, newSlots);
    };

    const handleModeChange = (mode: 'always' | 'except' | 'only') => {
        onUpdate(mode, []);
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Time Availability Mode</label>
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg w-fit">
                    {(['always', 'except', 'only'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => handleModeChange(mode)}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize",
                                volunteer.availabilityMode === mode
                                    ? "bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm"
                                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            )}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                    {volunteer.availabilityMode === 'always' && "• Volunteer is available at all mass times."}
                    {volunteer.availabilityMode === 'except' && "• Volunteer is available EXCEPT during the specified slots."}
                    {volunteer.availabilityMode === 'only' && "• Volunteer is ONLY available during the specified slots."}
                </p>
            </div>

            {volunteer.availabilityMode !== 'always' && (
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-100 dark:border-gray-700 space-y-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {volunteer.availabilityMode === 'only' ? 'Available Slots' : 'Unavailable Slots'}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {slots.map((slot, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 group">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    {format(new Date(`2000-01-01T${slot.start}`), 'h:mm a')} - {format(new Date(`2000-01-01T${slot.end}`), 'h:mm a')}
                                </span>
                                <button
                                    onClick={() => handleRemoveSlot(idx)}
                                    className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-600">
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold block mb-1">From</label>
                            <input
                                type="time"
                                className="w-full text-sm p-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={newStart}
                                onChange={e => setNewStart(e.target.value)}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold block mb-1">To</label>
                            <input
                                type="time"
                                className="w-full text-sm p-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={newEnd}
                                onChange={e => setNewEnd(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={handleAddSlot}
                            className="bg-indigo-600 text-white p-2.5 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function AddVolunteerForm({ onAdd }: { onAdd: (name: string) => void }) {

    const [name, setName] = useState('');
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onAdd(name);
            setName('');
        }
    };
    return (
        <form onSubmit={handleSubmit} className="flex gap-2">
            <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Volunteer Name"
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
            />
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap">
                Add
            </button>
        </form>
    );
}
