import { useState } from 'react';
import { useVolunteers, useSchedule } from '../lib/hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, X, Edit2, AlertTriangle, RefreshCw, UserPlus } from 'lucide-react';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Volunteer } from '../types';
import { repairSchedule } from '../lib/scheduler';

export default function AvailabilityPage() {
    const { volunteers, loading, updateAvailability, addVolunteer, toggleVolunteerStatus } = useVolunteers();
    const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Fetch schedule for conflict check
    const { schedule, setSchedule } = useSchedule(currentMonth.getMonth() + 1, currentMonth.getFullYear());

    const selectedVolunteer = selectedVolunteerId ? volunteers.find(v => v.id === selectedVolunteerId) || null : null;
    const isModalOpen = !!selectedVolunteerId;

    // Conflict State
    const [conflict, setConflict] = useState<string[] | null>(null);
    const [pendingDates, setPendingDates] = useState<Timestamp[] | null>(null);
    const [isRegenerating, setIsRegenerating] = useState(false);

    const closeRenal = () => {
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

        closeRenal();
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
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-4 sm:mb-0">Manage Availability</h2>
                <div className="flex items-center space-x-4 bg-gray-50 p-1 rounded-lg">
                    <button onClick={prevMonth} className="p-2 hover:bg-white rounded-md shadow-sm transition-all text-gray-600">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-gray-900 w-32 text-center select-none">{format(currentMonth, 'MMMM yyyy')}</span>
                    <button onClick={nextMonth} className="p-2 hover:bg-white rounded-md shadow-sm transition-all text-gray-600">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Volunteer</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unavailable Dates ({format(currentMonth, 'MMM')})</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {volunteers
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(v => (
                                    <tr
                                        key={v.id}
                                        className={clsx(
                                            "transition-colors cursor-pointer group",
                                            v.isActive === false ? "bg-gray-50 opacity-60 hover:bg-gray-100" : "hover:bg-gray-50 bg-white"
                                        )}
                                        onClick={() => setSelectedVolunteerId(v.id)}
                                    >
                                        <td className="px-6 py-4 font-medium text-gray-900">{v.name}</td>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeRenal}>
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        {conflict ? (
                            <div className="p-6">
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
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900">{selectedVolunteer.name}</h3>
                                        <p className="text-xs text-gray-500">Mark dates as unavailable</p>
                                    </div>
                                    <button onClick={closeRenal} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6">
                                    {/* Indefinite Unavailability Checkbox */}
                                    <div className="mb-6 bg-red-50 border border-red-100 rounded-lg p-3">
                                        <label className="flex items-center space-x-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedVolunteer.isActive === false}
                                                onChange={(e) => {
                                                    const isInactive = e.target.checked;
                                                    toggleVolunteerStatus(selectedVolunteer.id, !isInactive);
                                                }}
                                                className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                                            />
                                            <span className="text-sm font-medium text-red-900">Mark as Unavailable Indefinitely</span>
                                        </label>
                                        <p className="text-xs text-red-700 ml-7 mt-1">
                                            {selectedVolunteer.isActive === false
                                                ? "Volunteer is currently disabled and won't be assigned."
                                                : "Check this to disable the volunteer for all future schedules."}
                                        </p>
                                    </div>

                                    <CalendarView
                                        volunteer={selectedVolunteer}
                                        month={currentMonth}
                                        onUpdate={handleUpdateAttempt}
                                    />
                                </div>

                                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={closeRenal}
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-indigo-600" />
                    Manage Volunteers
                </h3>

                <div className="grid grid-cols-1 gap-8">
                    <div>
                        <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">Add New Volunteer</h4>
                        <AddVolunteerForm onAdd={addVolunteer} />
                    </div>
                </div>
            </div>
        </div>
    );
}
// ... CalendarView ...

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
            <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">Mark Range Unavailable</div>
                <div className="flex items-end gap-2">
                    <div className="flex-1">
                        <label className="text-xs text-gray-400 block mb-1">From</label>
                        <input
                            type="date"
                            className="w-full text-xs p-1 border rounded"
                            value={rangeStart}
                            onChange={e => setRangeStart(e.target.value)}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs text-gray-400 block mb-1">To</label>
                        <input
                            type="date"
                            className="w-full text-xs p-1 border rounded"
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

            <div className="text-center font-semibold text-gray-800 mb-4">{format(month, 'MMMM yyyy')}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="font-medium text-gray-400 uppercase tracking-wider">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOfMonth(month).getDay() }).map((_, i) => (
                    <div key={`pad-${i}`} />
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
                                    : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                            )}
                        >
                            {format(day, 'd')}
                        </button>
                    );
                })}
            </div>
            <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-gray-500">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span>Unavailable</span>
                <div className="w-3 h-3 bg-gray-100 rounded ml-2"></div>
                <span>Available</span>
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
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
            />
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 whitespace-nowrap">
                Add
            </button>
        </form>
    );
}


