import { useState, useEffect } from 'react';
import { useVolunteers, useSchedule, useAuth } from '../lib/hooks';
import { format, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, X, AlertTriangle, RefreshCw, UserPlus, Trash2, Edit2, Clock } from 'lucide-react';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { Navigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { repairSchedule } from '../lib/scheduler';
import type { Volunteer, Role } from '../types';

const safeToDate = (dt: any): Date => {
    if (!dt) return new Date();
    if (typeof dt.toDate === 'function') return dt.toDate();
    if (dt instanceof Date) return dt;
    if (typeof dt.seconds === 'number') return new Date(dt.seconds * 1000);
    const parsed = new Date(dt);
    if (!isNaN(parsed.getTime())) return parsed;
    return new Date();
};

export default function AvailabilityPage() {
    const { loading: authLoading, isManager } = useAuth();
    const { volunteers, loading, updateAvailability, addVolunteer, deleteVolunteer, toggleVolunteerStatus, updateVolunteerLevel, updateTraineePreference, updateWeekdayAvailability, updateRecurringAvailability } = useVolunteers();

    const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
    const [stagedVolunteer, setStagedVolunteer] = useState<Volunteer | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isRecurringMode, setIsRecurringMode] = useState(false);

    // Fetch schedule for conflict check
    const { schedule, setSchedule } = useSchedule(currentMonth.getMonth() + 1, currentMonth.getFullYear());

    // Conflict State
    const [conflict, setConflict] = useState<string[] | null>(null);
    const [pendingDates, setPendingDates] = useState<Timestamp[] | null>(null);
    const [isRegenerating, setIsRegenerating] = useState(false);

    // When a volunteer is selected, clone it to stagedVolunteer
    useEffect(() => {
        if (selectedVolunteerId) {
            // Only pull from source if we don't have a staged volunteer yet, 
            // or if the selected ID has changed.
            if (!stagedVolunteer || stagedVolunteer.id !== selectedVolunteerId) {
                const v = volunteers.find(vol => vol.id === selectedVolunteerId);
                if (v) setStagedVolunteer({ ...v });
            }
        } else {
            setStagedVolunteer(null);
        }
    }, [selectedVolunteerId, volunteers]);

    if (authLoading) return <div className="p-8 text-center text-gray-500">Authenticating...</div>;
    if (!isManager) return <Navigate to="/" replace />;


    const selectedVolunteer = selectedVolunteerId ? volunteers.find(v => v.id === selectedVolunteerId) || null : null;
    const isModalOpen = !!selectedVolunteerId;

    const closeModal = () => {
        setSelectedVolunteerId(null);
        setStagedVolunteer(null);
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



    const handleDone = async () => {
        if (!stagedVolunteer) return;

        // Check for conflicts
        if (schedule) {
            const conflictingDates: string[] = [];
            const dates = stagedVolunteer.unavailableDates || [];

            schedule.masses.forEach((mass: any) => {
                const massDate = safeToDate(mass.date);
                const massDateStr = format(massDate, 'yyyy-MM-dd');
                const isAssigned = Object.values(mass.assignments).includes(stagedVolunteer.id);

                if (isAssigned) {
                    const isNowUnavailableByDate = dates.some(d => {
                        const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
                        return format(dObj, 'yyyy-MM-dd') === massDateStr;
                    });

                    const isNowUnavailableByDay = stagedVolunteer.unavailableDaysOfWeek?.includes(massDate.getDay());

                    if (isNowUnavailableByDate || isNowUnavailableByDay) {
                        conflictingDates.push(massDateStr);
                    }
                }
            });

            if (conflictingDates.length > 0) {
                setConflict(Array.from(new Set(conflictingDates)));
                setPendingDates(dates);
                return; // Wait for conflict resolution popup
            }
        }

        // No conflicts or no schedule, save all staged changes
        await saveStagedChanges();
    };

    const saveStagedChanges = async () => {
        if (!stagedVolunteer) return;

        // Find what changed and call respective hooks
        const original = volunteers.find(v => v.id === stagedVolunteer.id);
        if (!original) return;

        try {
            // Dates
            if (JSON.stringify(original.unavailableDates) !== JSON.stringify(stagedVolunteer.unavailableDates)) {
                await updateAvailability(stagedVolunteer.id, stagedVolunteer.unavailableDates);
            }
            // Level
            if (original.volunteerLevel !== stagedVolunteer.volunteerLevel) {
                await updateVolunteerLevel(stagedVolunteer.id, stagedVolunteer.volunteerLevel);
            }
            // Preference
            const prefToSave: Role[] = Array.isArray(stagedVolunteer.traineeRolePreference) ? stagedVolunteer.traineeRolePreference : ['Lector2'];
            const origPref: Role[] = Array.isArray(original.traineeRolePreference) ? original.traineeRolePreference : ['Lector2'];

            if (JSON.stringify(origPref) !== JSON.stringify(prefToSave)) {
                await updateTraineePreference(stagedVolunteer.id, prefToSave);
            }
            // Weekday Availability
            if (JSON.stringify(original.weekdayMassAvailability || []) !== JSON.stringify(stagedVolunteer.weekdayMassAvailability || [])) {
                await updateWeekdayAvailability(stagedVolunteer.id, stagedVolunteer.weekdayMassAvailability || []);
            }
            // Recurring Day Unavailability
            if (JSON.stringify(original.unavailableDaysOfWeek || []) !== JSON.stringify(stagedVolunteer.unavailableDaysOfWeek || [])) {
                await updateRecurringAvailability(stagedVolunteer.id, stagedVolunteer.unavailableDaysOfWeek || []);
            }
            // Active Status
            if (original.isActive !== stagedVolunteer.isActive) {
                await toggleVolunteerStatus(stagedVolunteer.id, stagedVolunteer.isActive === false ? false : true);
            }

            closeModal();
            // We keep isRecurringMode value for the next volunteer in the same session
        } catch (e) {
            console.error("Save failed", e);
            alert("Failed to save some changes.");
        }
    };

    const proceedWithConflict = async (regenerate: boolean) => {
        if (!stagedVolunteer || !pendingDates) return;

        // 1. Update Availability first (to ensure DB matches what we're repairing)
        // Actually, we should save everything staged.
        await saveStagedChanges();

        // Modal is closed by saveStagedChanges, but proceedWithConflict logic continues if regenerate
        if (regenerate && conflict && schedule) {
            setIsRegenerating(true);
            try {
                // 2. Perform Minimal Repair
                const updatedVolunteers = volunteers.map(v =>
                    v.id === stagedVolunteer.id ? { ...v, unavailableDates: pendingDates } : v
                );

                let currentScheduleState = schedule;
                const allChanges: string[] = [];

                conflict.forEach(dateStr => {
                    const result = repairSchedule(currentScheduleState, updatedVolunteers, stagedVolunteer.id, dateStr);
                    currentScheduleState = result.schedule;
                    allChanges.push(...result.changes);
                });

                const scheduleId = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
                await setDoc(doc(db, 'schedules', scheduleId), currentScheduleState);
                setSchedule(currentScheduleState);

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
        const recurringDays = v.unavailableDaysOfWeek || [];
        const specificDates = v.unavailableDates || [];

        const datesInMonth = specificDates
            .map(d => (d as any).toDate ? (d as any).toDate() : new Date(d as any))
            .filter(d => isSameMonth(d, currentMonth))
            .sort((a, b) => a.getTime() - b.getTime());

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        if (datesInMonth.length === 0 && recurringDays.length === 0)
            return <span className="text-gray-400 italic">Available all month</span>;

        return (
            <div className="flex flex-col gap-1.5">
                {recurringDays.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">Every:</span>
                        <div className="flex flex-wrap gap-1">
                            {recurringDays.map(d => (
                                <span key={d} className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] rounded-full font-bold">
                                    {dayNames[d]}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {datesInMonth.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tight">Dates:</span>
                        <div className="flex flex-wrap gap-1">
                            {datesInMonth.map(d => (
                                <span key={d.toISOString()} className="px-2 py-0.5 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] rounded-full font-medium">
                                    {format(d, 'd MMM')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
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
                                                    v.volunteerLevel === 'Lector' ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                                )}>
                                                    {v.volunteerLevel || 'Trainee'}
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

            {isModalOpen && selectedVolunteer && stagedVolunteer && (
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
                                                {(['Trainee', 'Lector'] as const).map(level => (
                                                    <button
                                                        key={level}
                                                        onClick={() => stagedVolunteer && setStagedVolunteer({ ...stagedVolunteer, volunteerLevel: level })}
                                                        className={clsx(
                                                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                                            stagedVolunteer?.volunteerLevel === level
                                                                ? "bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm"
                                                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                                        )}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>

                                            {stagedVolunteer.volunteerLevel === 'Trainee' && (
                                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-2">Assign as</label>
                                                    <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg w-fit">
                                                        {(['Lector1', 'Lector2'] as const).map(role => {
                                                            const currentPrefs = stagedVolunteer.traineeRolePreference || ['Lector2'];
                                                            const isSelected = currentPrefs.includes(role);
                                                            return (
                                                                <button
                                                                    key={role}
                                                                    onClick={() => {
                                                                        let newPrefs: Role[];
                                                                        if (isSelected) {
                                                                            // Prevent deselecting all roles (must have at least one)
                                                                            if (currentPrefs.length > 1) {
                                                                                newPrefs = currentPrefs.filter(p => p !== role);
                                                                            } else {
                                                                                newPrefs = currentPrefs;
                                                                            }
                                                                        } else {
                                                                            newPrefs = [...currentPrefs, role];
                                                                        }
                                                                        setStagedVolunteer({ ...stagedVolunteer, traineeRolePreference: newPrefs });
                                                                    }}
                                                                    className={clsx(
                                                                        "px-3 py-1 rounded-md text-xs font-medium transition-all",
                                                                        isSelected
                                                                            ? "bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm"
                                                                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                                                    )}
                                                                >
                                                                    {role === 'Lector1' ? 'Lector 1' : 'Lector 2'}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                                                {stagedVolunteer.volunteerLevel === 'Trainee'
                                                    ? `• New: Assigned as ${(stagedVolunteer.traineeRolePreference || ['Lector2']).map(r => r === 'Lector1' ? 'Lector 1' : 'Lector 2').join(' and ')}`
                                                    : "• Experienced: Can do all roles (Lector 1, Lector 2, Commentator)"}
                                            </p>
                                        </div>

                                        {/* 2. Weekday Mass Availability */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100">Weekday Mass Availability</h4>
                                            </div>
                                            <WeekdayMassAvailabilityEditor
                                                volunteer={stagedVolunteer}
                                                onUpdate={(slots: string[]) => {
                                                    setStagedVolunteer({ ...stagedVolunteer, weekdayMassAvailability: slots });
                                                }}
                                            />
                                        </div>

                                        {/* 3. Recurring Weekly Unavailability - Linked to bottom toggle */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100">Weekly Busy Days</h4>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 italic">
                                                Quickly mark days of the week as busy. Status depends on the "Recurring" setting below.
                                            </p>
                                            <div className="grid grid-cols-7 gap-2">
                                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => {
                                                    const isRecurring = stagedVolunteer.unavailableDaysOfWeek?.includes(i);
                                                    const monthDays = eachDayOfInterval({
                                                        start: startOfMonth(currentMonth),
                                                        end: endOfMonth(currentMonth)
                                                    }).filter(d => d.getDay() === i);

                                                    const isChecked = isRecurringMode
                                                        ? isRecurring
                                                        : (monthDays.length > 0 && monthDays.every(d => {
                                                            const dateStr = format(d, 'yyyy-MM-dd');
                                                            return isRecurring || stagedVolunteer.unavailableDates?.some(ud => {
                                                                const dObj = (ud as any).toDate ? (ud as any).toDate() : new Date(ud as any);
                                                                return format(dObj, 'yyyy-MM-dd') === dateStr;
                                                            });
                                                        }));

                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={() => {
                                                                const ev = new CustomEvent('toggle-day', { detail: i });
                                                                window.dispatchEvent(ev);
                                                            }}
                                                            className={clsx(
                                                                "aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all border-2",
                                                                isChecked
                                                                    ? (isRecurringMode ? "bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-300 ring-offset-1" : "bg-red-500 text-white border-red-400 shadow-md")
                                                                    : (isRecurring ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" : "bg-gray-100 dark:bg-gray-700 text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600")
                                                            )}
                                                            title={isRecurringMode
                                                                ? `${isRecurring ? 'Remove' : 'Set'} global recurring ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}`
                                                                : `Busy on all ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][i]} in ${format(currentMonth, 'MMMM')}${isRecurring ? ' (Due to recurring setting)' : ''}`}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* 4. Calendar for Specific Dates */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <ChevronRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100">Specific Busy Dates</h4>
                                            </div>
                                            <CalendarView
                                                volunteer={stagedVolunteer}
                                                month={currentMonth}
                                                onUpdate={(dates: Timestamp[]) => {
                                                    setStagedVolunteer({ ...stagedVolunteer, unavailableDates: dates });
                                                }}
                                                onRecurringUpdate={(days: number[]) => {
                                                    setStagedVolunteer({ ...stagedVolunteer, unavailableDaysOfWeek: days });
                                                }}
                                                isRecurringMode={isRecurringMode}
                                            />
                                        </div>

                                        <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
                                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl p-4">
                                                <label className="flex items-center space-x-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={stagedVolunteer.isActive === false}
                                                        onChange={(e) => {
                                                            const isInactive = e.target.checked;
                                                            setStagedVolunteer({ ...stagedVolunteer, isActive: !isInactive });
                                                        }}
                                                        className="w-5 h-5 text-red-600 rounded border-gray-300 dark:border-gray-600 focus:ring-red-500 dark:bg-gray-800"
                                                    />
                                                    <div>
                                                        <span className="text-sm font-bold text-red-900 dark:text-red-300">Mark as Unavailable Indefinitely</span>
                                                        <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                                                            {stagedVolunteer.isActive === false
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
                                        Delete
                                    </button>

                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer group py-1">
                                            <input
                                                type="checkbox"
                                                checked={isRecurringMode}
                                                onChange={(e) => setIsRecurringMode(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600"
                                            />
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 transition-colors uppercase tracking-wider">Recurring</span>
                                        </label>
                                        <button
                                            onClick={handleDone}
                                            className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-all flex items-center gap-2"
                                        >
                                            Done
                                        </button>
                                    </div>
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

function CalendarView({ volunteer, month, onUpdate, onRecurringUpdate, isRecurringMode }: {
    volunteer: Volunteer,
    month: Date,
    onUpdate: (dates: Timestamp[]) => void,
    onRecurringUpdate: (days: number[]) => void,
    isRecurringMode: boolean
}) {
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');

    const days = eachDayOfInterval({
        start: startOfMonth(month),
        end: endOfMonth(month)
    });

    useEffect(() => {
        const handler = (e: any) => toggleDayOfWeek(e.detail);
        window.addEventListener('toggle-day', handler);
        return () => window.removeEventListener('toggle-day', handler);
    }, [volunteer, month, isRecurringMode]);

    const isUnavailable = (date: Date) => {
        // 1. Check recurring
        if (volunteer.unavailableDaysOfWeek?.includes(date.getDay())) return true;

        // 2. Check specific dates
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

    const handleSelectAll = () => {
        const existingDates = volunteer.unavailableDates || [];
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

        // Keep dates from other months, replace current month with all days
        const otherMonthDates = existingDates.filter(d => {
            const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
            return !isSameMonth(dObj, month);
        });

        const newMonthDates = monthDays.map(day => Timestamp.fromDate(day));
        onUpdate([...otherMonthDates, ...newMonthDates]);
    };

    const handleClearAll = () => {
        const existingDates = volunteer.unavailableDates || [];
        const otherMonthDates = existingDates.filter(d => {
            const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
            return !isSameMonth(dObj, month);
        });
        onUpdate(otherMonthDates);
    };

    const toggleDayOfWeek = (dayIndex: number) => {
        const currentGlobalDays = volunteer.unavailableDaysOfWeek || [];
        const isCurrentlyRecurring = currentGlobalDays.includes(dayIndex);

        // SMART TOGGLE: 
        // 1. If we are in Recurring Mode -> Always update global pattern.
        // 2. If we are NOT in Recurring Mode, but the day is ALREADY recurring globally -> Force global update (removes the global setting).
        // This prevents the user from being "stuck" when trying to uncheck a recurring day with the toggle off.
        if (isRecurringMode || isCurrentlyRecurring) {
            let newRecurring: number[];
            if (isCurrentlyRecurring) {
                newRecurring = currentGlobalDays.filter(d => d !== dayIndex);
            } else {
                newRecurring = [...currentGlobalDays, dayIndex];

                // Clean up any specific dates for this day in the current month if we are making it recurring
                const existingDates = volunteer.unavailableDates || [];
                const filteredDates = existingDates.filter(d => {
                    const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
                    return dObj.getDay() !== dayIndex;
                });
                if (filteredDates.length !== existingDates.length) {
                    onUpdate(filteredDates);
                }
            }
            onRecurringUpdate(newRecurring);
        } else {
            // NON-RECURRING LOGIC (Updates specific dates in the currently viewed month only)
            const monthDays = days.filter(d => d.getDay() === dayIndex);
            const allMarked = monthDays.every(d => isUnavailable(d));

            const existingDates = volunteer.unavailableDates || [];
            // Filter out any specific dates for this day in THIS month so we can toggle them cleanly
            const otherDates = existingDates.filter(d => {
                const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
                const isSameMonthYear = dObj.getMonth() === month.getMonth() && dObj.getFullYear() === month.getFullYear();
                return !(isSameMonthYear && dObj.getDay() === dayIndex);
            });

            if (allMarked) {
                // If it was fully marked by specific dates, clear them.
                onUpdate(otherDates);
            } else {
                // Mark all instances of this day in the current month as specific busy dates
                const dayStrings = new Set(otherDates.map(d => {
                    const dObj = (d as any).toDate ? (d as any).toDate() : new Date(d as any);
                    return format(dObj, 'yyyy-MM-dd');
                }));
                const toAdd = monthDays
                    .filter(d => !dayStrings.has(format(d, 'yyyy-MM-dd')))
                    .map(d => Timestamp.fromDate(d));

                onUpdate([...otherDates, ...toAdd]);
            }
        }
    };

    return (
        <div>
            <div className="mb-4 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-tight">Mark Range Unavailable</div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSelectAll}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 uppercase"
                        >
                            Select All
                        </button>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <button
                            onClick={handleClearAll}
                            className="text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 uppercase"
                        >
                            Clear
                        </button>
                    </div>
                </div>
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

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {[0, 1, 2, 3, 4, 5, 6].map(i => {
                    const monthDays = days.filter(d => d.getDay() === i);
                    const allMarked = monthDays.length > 0 && monthDays.every(d => isUnavailable(d));
                    return (
                        <div key={`check-${i}`} className="flex justify-center">
                            <input
                                type="checkbox"
                                checked={allMarked}
                                onChange={() => toggleDayOfWeek(i)}
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 transition-all cursor-pointer"
                                title={`Toggle all ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][i]}`}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tighter">{d}</div>
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


function WeekdayMassAvailabilityEditor({ volunteer, onUpdate }: { volunteer: Volunteer, onUpdate: (slots: string[]) => void }) {
    const availableSlots = volunteer.weekdayMassAvailability || [];

    const massTimes = [
        { id: '06:00', label: '6:00 AM' },
        { id: '07:00', label: '7:00 AM' },
        { id: '07:30', label: '7:30 AM' },
        { id: '18:30', label: '6:30 PM' },
    ];

    const toggleSlot = (time: string) => {
        let newSlots: string[];
        if (availableSlots.includes(time)) {
            newSlots = availableSlots.filter(t => t !== time);
        } else {
            newSlots = [...availableSlots, time];
        }
        onUpdate(newSlots);
    };

    return (
        <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 italic">
                    Select which weekday masses this member is available for. All are selected by default.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    {massTimes.map((time) => (
                        <label
                            key={time.id}
                            className={clsx(
                                "flex items-center p-3 rounded-lg border transition-all cursor-pointer select-none",
                                availableSlots.includes(time.id)
                                    ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
                                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-100 dark:hover:border-indigo-900/40"
                            )}
                        >
                            <input
                                type="checkbox"
                                checked={availableSlots.includes(time.id)}
                                onChange={() => toggleSlot(time.id)}
                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <span className={clsx(
                                "ml-3 text-sm font-medium",
                                availableSlots.includes(time.id) ? "text-indigo-900 dark:text-indigo-200" : "text-gray-700 dark:text-gray-300"
                            )}>
                                {time.label}
                            </span>
                        </label>
                    ))}
                </div>
            </div>
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
