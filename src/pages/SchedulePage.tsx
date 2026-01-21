import { useState, useRef, useEffect } from 'react';
import { useVolunteers, useSchedule, useMassTimings, useAuth } from '../lib/hooks';
import { generateSchedule, findBestCandidate, buildStatsFromSchedule } from '../lib/scheduler';
import type { Role, Mass, MassTiming } from '../types';
import { Calendar as CalendarIcon, Loader2, Plus, X, Edit2, Clock, Trash2 } from 'lucide-react';
import { doc, setDoc, Timestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, getWeek } from 'date-fns';

export default function SchedulePage() {
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    useAuth();

    const { volunteers, loading: volunteersLoading } = useVolunteers();
    const { schedule, loading, setSchedule, fetchSchedule, updateMonthMassTimings } = useSchedule(month, year);
    const { defaultTimings } = useMassTimings();

    const [generating, setGenerating] = useState(false);
    const [isAddMassOpen, setIsAddMassOpen] = useState(false);
    const [isTimingsOpen, setIsTimingsOpen] = useState(false);
    const [editingMassId, setEditingMassId] = useState<string | null>(null);
    const editingMass = editingMassId ? schedule?.masses.find((m: Mass) => m.id === editingMassId) : null;

    const handleAddMass = async (date: Date, name: string, description?: string, isHighlighted?: boolean) => {
        if (!schedule) return;

        // 1. Build context from current schedule to ensure fairness/validity
        const { assignmentsHistory, weeklyCounts, lastRole, lastPartner } = buildStatsFromSchedule(schedule, volunteers);
        const dateStr = format(date, 'yyyy-MM-dd');
        const weekNum = getWeek(date);

        // 2. Determine assignments
        const assignments: Record<string, string | null> = { Lector1: null, Commentator: null, Lector2: null };
        const requiredRoles: Role[] = ['Lector1', 'Commentator', 'Lector2'];
        const currentPartners: string[] = [];

        requiredRoles.forEach(role => {
            const candidate = findBestCandidate(
                volunteers,
                date, // Full day Date
                date, // Full mass Date (Special masses use same object for both)
                weekNum,
                role,
                'Special',
                assignmentsHistory,
                weeklyCounts,
                currentPartners,
                lastRole,
                lastPartner
            );

            if (candidate) {
                assignments[role] = candidate.id;
                currentPartners.push(candidate.id);
                // Update local stats so next role in THIS mass knows about this assignment
                assignmentsHistory[candidate.id].push(dateStr);
            }
        });

        // 3. Create new mass with description and highlight
        const newMass: Mass = {
            id: doc(collection(db, 'schedules')).id,
            date: Timestamp.fromDate(date),
            type: 'Special',
            assignments: assignments as Record<Role, string | null>,
            name: name,
            description: description || undefined,
            isHighlighted: isHighlighted || false
        };

        // Append and sort
        const updatedMasses = [...schedule.masses, newMass].sort((a: any, b: any) =>
            a.date.seconds - b.date.seconds
        );

        const updatedSchedule = { ...schedule, masses: updatedMasses };

        // Save
        setSchedule(updatedSchedule);
        const scheduleId = `${year}-${String(month).padStart(2, '0')}`;
        const cacheKey = `schedule_${scheduleId}`;
        localStorage.setItem(cacheKey, JSON.stringify(updatedSchedule));

        await setDoc(doc(db, 'schedules', scheduleId), updatedSchedule);

        setIsAddMassOpen(false);
    };

    const handleEditMass = async (massId: string, date: Date, name: string, description?: string, isHighlighted?: boolean, assignments?: Record<Role, string | null>) => {
        if (!schedule) return;

        const updatedMasses = schedule.masses.map((m: Mass) => {
            if (m.id === massId) {
                return {
                    ...m,
                    date: Timestamp.fromDate(date),
                    name,
                    description: description || undefined,
                    isHighlighted: isHighlighted || false,
                    assignments: assignments || m.assignments
                };
            }
            return m;
        }).sort((a: any, b: any) => a.date.seconds - b.date.seconds);

        const updatedSchedule = { ...schedule, masses: updatedMasses };

        // Save
        setSchedule(updatedSchedule);
        const scheduleId = `${year}-${String(month).padStart(2, '0')}`;
        const cacheKey = `schedule_${scheduleId}`;
        localStorage.setItem(cacheKey, JSON.stringify(updatedSchedule));

        await setDoc(doc(db, 'schedules', scheduleId), updatedSchedule);
        setEditingMassId(null);
    };

    const handleDeleteMass = async (massId: string) => {
        if (!schedule) return;
        if (!window.confirm("Are you sure you want to delete this mass?")) return;

        const updatedMasses = schedule.masses.filter((m: Mass) => m.id !== massId);
        const updatedSchedule = { ...schedule, masses: updatedMasses };

        setSchedule(updatedSchedule);
        const scheduleId = `${year}-${String(month).padStart(2, '0')}`;
        await setDoc(doc(db, 'schedules', scheduleId), updatedSchedule);
    };

    // Month selection
    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setMonth(parseInt(e.target.value));
    };

    // fetchSchedule is now handled by the hook


    const handleGenerate = async () => {
        if (!volunteers.length) return;
        setGenerating(true);

        try {
            // Use monthly overrides if they exist, otherwise use defaults
            const currentTimings = (schedule?.massTimings && schedule.massTimings.length > 0)
                ? schedule.massTimings
                : defaultTimings;

            // logic: 0-indexed month for date-fns
            const generated = generateSchedule(volunteers, year, month - 1, schedule?.masses || [], currentTimings);

            if (generated.id === 'error') {
                throw new Error("Generator returned error state");
            }

            // 1. Optimistic Update: Show it immediately!
            // Force a new object reference so React detects the change
            const freshSchedule = JSON.parse(JSON.stringify(generated));
            // Re-hydrate Timestamps
            freshSchedule.masses = freshSchedule.masses.map((m: any) => ({
                ...m,
                date: {
                    seconds: m.date.seconds,
                    nanoseconds: m.date.nanoseconds || 0
                }
            }));
            setSchedule(freshSchedule);

            // 2. Save to Local Storage (Safety fallback)
            const scheduleId = `${year}-${String(month).padStart(2, '0')}`;
            const cacheKey = `schedule_${scheduleId}`;
            localStorage.setItem(cacheKey, JSON.stringify(generated));

            setGenerating(false); // Stop loading spinner immediately

            // 3. Save to Firebase (Background)
            await setDoc(doc(db, 'schedules', scheduleId), generated);

            // Fetch the schedule again to ensure React re-renders with the fresh data
            await fetchSchedule();

        } catch (e) {
            console.error("Error generating/saving schedule", e);
            alert("Failed to generate schedule. Check console for details.");
            setGenerating(false);
        }
    };

    const getVolunteerName = (id?: string | null) => {
        if (!id) return "Unassigned";
        return volunteers.find(v => v.id === id)?.name || "Unknown";
    };

    // Helper to safely convert date objects (handles both Timestamp and plain objects)
    const safeGetDate = (dt: any): Date => {
        if (!dt) return new Date();
        if (typeof dt.toDate === 'function') return dt.toDate();
        if (dt instanceof Date) return dt;
        if (typeof dt.seconds === 'number') return new Date(dt.seconds * 1000);
        return new Date(dt);
    };

    if (volunteersLoading) return <div>Loading data...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Monthly Schedule</h2>
                <div className="flex items-center space-x-2">
                    <select
                        value={month}
                        onChange={handleMonthChange}
                        className="p-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700"
                    >
                        {Array.from({ length: 12 }, (_, i) => i).map(m => (
                            <option key={m} value={m + 1}>{format(new Date(2000, m, 1), 'MMMM')}</option>
                        ))}
                    </select>
                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        className="p-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700"
                    >
                        <option value={2025}>2025</option>
                        <option value={2026}>2026</option>
                    </select>
                </div>
            </div>

            {!schedule && !loading && (
                <div className="text-center py-10 bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl space-y-4">
                    <CalendarIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-600" />
                    <p className="text-gray-500 dark:text-gray-400">No schedule found for this month.</p>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center space-x-2 mx-auto"
                    >
                        {generating && <Loader2 className="w-4 h-4 animate-spin" />}
                        {generating && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>Generate Schedule</span>
                    </button>
                </div>
            )}

            {loading && <div className="text-center py-10">Loading schedule...</div>}

            {schedule && (
                <div className="space-y-6">

                    <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsAddMassOpen(true)}
                                className="text-sm px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Special Mass
                            </button>
                            <button
                                onClick={() => setIsTimingsOpen(true)}
                                className="text-sm px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium flex items-center gap-2"
                            >
                                <Clock className="w-4 h-4" />
                                Mass Timings
                            </button>
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="text-sm text-indigo-600 hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                            {generating ? 'Regenerating...' : 'Regenerate'}
                        </button>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors duration-200">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Date</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Time</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Type</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lector1</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lector2</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Commentator</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {schedule.masses.map((mass: Mass, idx: number) => {
                                        const dateStr = format(safeGetDate(mass.date), 'MMM d, EEE');
                                        // Check if previous row had same date to avoid repetition (optional, but cleaner)
                                        const prevMass = idx > 0 ? schedule.masses[idx - 1] : null;
                                        const isSameDate = prevMass && format(safeGetDate(prevMass.date), 'MMM d, EEE') === dateStr;

                                        return (
                                            <tr
                                                key={idx}
                                                className={`transition-colors ${mass.isHighlighted
                                                    ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                    }`}
                                            >
                                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-200 font-medium whitespace-nowrap">
                                                    {!isSameDate && dateStr}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                    {format(safeGetDate(mass.date), 'h:mm a')}
                                                </td>
                                                <td className="px-4 py-2 text-sm">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium w-fit ${mass.type === 'Sunday' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' :
                                                            mass.type === 'Special' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                                                            }`}>
                                                            <span>{mass.type === 'Weekday' ? '👕' : '👔'}</span>
                                                            {mass.name || mass.type}
                                                        </span>
                                                        {mass.description && (
                                                            <span className="text-xs text-gray-600 dark:text-gray-400 italic">
                                                                {mass.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                                    {getVolunteerName(mass.assignments.Lector1)}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                                    {mass.type === 'Sunday' ? getVolunteerName(mass.assignments.Lector2) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                                    {getVolunteerName(mass.assignments.Commentator)}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => setEditingMassId(mass.id)}
                                                            className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-full hover:bg-indigo-50 transition-colors"
                                                            title="Edit Mass"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMass(mass.id)}
                                                            className="text-red-600 hover:text-red-800 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                            title="Delete Mass"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {isTimingsOpen && (
                <MassTimingsModal
                    onClose={() => setIsTimingsOpen(false)}
                    currentTimings={schedule?.massTimings?.length ? schedule.massTimings : defaultTimings}
                    onSave={async (timings) => {
                        await updateMonthMassTimings(timings);
                        setIsTimingsOpen(false);
                    }}
                    title={`Mass Timings for ${format(new Date(year, month - 1), 'MMMM yyyy')}`}
                />
            )}
            {isAddMassOpen && (
                <AddMassModal
                    onClose={() => setIsAddMassOpen(false)}
                    onAdd={handleAddMass}
                    defaultYear={year}
                    defaultMonth={month - 1} // 0-indexed for Date
                />
            )}
            {editingMass && (
                <EditMassModal
                    mass={editingMass}
                    onClose={() => setEditingMassId(null)}
                    onSave={(date, name, desc, highlighted) => handleEditMass(editingMass.id, date, name, desc, highlighted)}
                />
            )}
        </div>
    );
}

export function MassTimingsModal({ onClose, currentTimings, onSave, title }: {
    onClose: () => void,
    currentTimings: MassTiming[],
    onSave: (timings: MassTiming[]) => void,
    title: string
}) {
    const [timings, setTimings] = useState<MassTiming[]>(() =>
        [...currentTimings].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time))
    );
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastAddedId = useRef<string | null>(null);

    const handleAddTime = () => {
        const id = crypto.randomUUID();
        lastAddedId.current = id;
        setTimings([...timings, {
            id,
            dayOfWeek: 0,
            time: '', // Empty time for user to fill
            type: 'Sunday'
        }]);
    };

    useEffect(() => {
        if (lastAddedId.current && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
            lastAddedId.current = null;
        }
    }, [timings.length]);

    const handleRemoveTime = (id: string) => {
        setTimings(timings.filter(t => t.id !== id));
    };

    const handleUpdateTiming = (id: string, updates: Partial<MassTiming>) => {
        setTimings(timings.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleSave = () => {
        // Filter out items with empty time and sort before saving
        const validTimings = timings.filter(t => t.time !== '').sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
        onSave(validTimings);
    };

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white">{title}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2" ref={scrollContainerRef}>
                    <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase px-2 sticky top-0 bg-white dark:bg-gray-800 z-10 py-1">
                        <div className="col-span-4">Day</div>
                        <div className="col-span-3">Time</div>
                        <div className="col-span-3">Dress Code</div>
                        <div className="col-span-2"></div>
                    </div>

                    <div className="space-y-2">
                        {timings.map((t) => (
                            <div key={t.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                <div className="col-span-4">
                                    <select
                                        value={t.dayOfWeek}
                                        onChange={(e) => handleUpdateTiming(t.id, { dayOfWeek: parseInt(e.target.value) })}
                                        className="w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-md p-1.5"
                                    >
                                        {days.map((day, i) => (
                                            <option key={i} value={i}>{day}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-3">
                                    <input
                                        type="time"
                                        value={t.time}
                                        onChange={(e) => handleUpdateTiming(t.id, { time: e.target.value })}
                                        className="w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-md p-1.5"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <select
                                        value={t.type}
                                        onChange={(e) => handleUpdateTiming(t.id, { type: e.target.value as any })}
                                        className="w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-md p-1.5"
                                    >
                                        <option value="Weekday">Weekday (Casual)</option>
                                        <option value="Sunday">Sunday (Formal)</option>
                                    </select>
                                </div>
                                <div className="col-span-2 text-right">
                                    <button
                                        onClick={() => handleRemoveTime(t.id)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={handleAddTime}
                        className="w-full py-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Mass Timing
                    </button>
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                    >
                        Save for this Month
                    </button>
                </div>
            </div>
        </div>
    );
}



function AddMassModal({ onClose, onAdd, defaultYear, defaultMonth }: { onClose: () => void, onAdd: (date: Date, name: string, description?: string, isHighlighted?: boolean) => void, defaultYear: number, defaultMonth: number }) {
    // Default to logic: if defaultMonth is current month, use today, else first of month?
    // Actually just use formatted string directly.
    const getInitialDate = () => {
        const d = new Date(defaultYear, defaultMonth, 1);
        const today = new Date();
        // If current month matches default, use today
        if (today.getMonth() === defaultMonth && today.getFullYear() === defaultYear) {
            return format(today, 'yyyy-MM-dd');
        }
        return format(d, 'yyyy-MM-dd');
    };

    const [dateStr, setDateStr] = useState(getInitialDate());
    const [timeStr, setTimeStr] = useState('09:00');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isHighlighted, setIsHighlighted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!dateStr || !timeStr) return;

        const dateObj = new Date(dateStr + 'T' + timeStr);
        onAdd(dateObj, name, description, isHighlighted);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white">Add Special Mass</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Date</label>
                        <input
                            type="date"
                            required
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={dateStr}
                            onChange={e => setDateStr(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Time</label>
                        <input
                            type="time"
                            required
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={timeStr}
                            onChange={e => setTimeStr(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Name (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. Wedding, Funeral"
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Description (Optional)</label>
                        <textarea
                            placeholder="e.g. Solemnity of the Immaculate Conception"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                        <input
                            type="checkbox"
                            id="highlight-checkbox"
                            checked={isHighlighted}
                            onChange={e => setIsHighlighted(e.target.checked)}
                            className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                        />
                        <label htmlFor="highlight-checkbox" className="text-sm font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                            Highlight this event in the schedule
                        </label>
                    </div>

                    <div className="pt-2 flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                        >
                            Add Mass
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function EditMassModal({ mass, onClose, onSave }: { mass: Mass, onClose: () => void, onSave: (date: Date, name: string, desc?: string, highlighted?: boolean) => void }) {
    const safeGetDate = (dt: any): Date => {
        if (!dt) return new Date();
        if (typeof dt.toDate === 'function') return dt.toDate();
        if (dt instanceof Date) return dt;
        if (typeof dt.seconds === 'number') return new Date(dt.seconds * 1000);
        return new Date(dt);
    };

    const massDate = safeGetDate(mass.date);
    const [dateStr, setDateStr] = useState(format(massDate, 'yyyy-MM-dd'));
    const [timeStr, setTimeStr] = useState(format(massDate, 'HH:mm'));
    const [name, setName] = useState(mass.name || '');
    const [description, setDescription] = useState(mass.description || '');
    const [isHighlighted, setIsHighlighted] = useState(mass.isHighlighted || false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dateObj = new Date(dateStr + 'T' + timeStr);
        onSave(dateObj, name, description, isHighlighted);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white">Edit Mass</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Date</label>
                        <input
                            type="date"
                            required
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={dateStr}
                            onChange={e => setDateStr(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Time</label>
                        <input
                            type="time"
                            required
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={timeStr}
                            onChange={e => setTimeStr(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Name (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. Wedding, Funeral"
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Description (Optional)</label>
                        <textarea
                            placeholder="e.g. Solemnity of the Immaculate Conception"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                        <input
                            type="checkbox"
                            id="edit-highlight-checkbox"
                            checked={isHighlighted}
                            onChange={e => setIsHighlighted(e.target.checked)}
                            className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                        />
                        <label htmlFor="edit-highlight-checkbox" className="text-sm font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                            Highlight this event in the schedule
                        </label>
                    </div>

                    <div className="pt-2 flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
