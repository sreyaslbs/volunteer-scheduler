import { useState, useEffect } from 'react';
import { useVolunteers, useSchedule, useAuth } from '../lib/hooks';
import { format } from 'date-fns';
import { Printer, Calendar, List, Search } from 'lucide-react';

export default function VolunteersPage() {
    const { volunteers, loading, seedVolunteers } = useVolunteers();
    const { isManager } = useAuth();

    // Summary State
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [viewMode, setViewMode] = useState<'calendar' | 'person'>('calendar');

    // Default view based on role
    useEffect(() => {
        if (!isManager) {
            setViewMode('person');
        } else {
            setViewMode('calendar');
        }
    }, [isManager]);

    // Use shared hook to ensure consistent ID format and caching
    const { schedule } = useSchedule(month, year);

    const getVolunteerAssignments = (volunteerId: string) => {
        if (!schedule) return [];
        const assignments: { date: Date, role: string, type: string }[] = [];
        schedule.masses.forEach((m: any) => {
            // Check if m.date is a Timestamp or Date, handle consistently
            const dateObj = (m.date as any).toDate ? (m.date as any).toDate() : new Date((m.date as any).seconds ? (m.date as any).seconds * 1000 : m.date);

            if (m.assignments.Lector1 === volunteerId) assignments.push({ date: dateObj, role: 'Lector1', type: m.type });
            if (m.assignments.Commentator === volunteerId) assignments.push({ date: dateObj, role: 'Commentator', type: m.type });
            if (m.assignments.Lector2 === volunteerId) assignments.push({ date: dateObj, role: 'Lector2', type: m.type });
        });
        return assignments.sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    const handleSeed = () => {
        const names = [
            "Abbie", "Alan", "Amy", "Angie", "Ann", "Anna", "Annie", "Baby", "Bernie", "Cora",
            "Dang", "Dens", "Desi", "Dhors", "Emmie", "Evelyn", "Florie", "Gats", "Glo", "Haydee",
            "Helen", "Ianne", "Irene", "Jojo", "Julie", "Kaye", "Lanz", "Leony", "Letty", "Lily",
            "Liza C.", "Liza T.", "Mae", "Maris", "Melba", "Mini", "Myrna", "Nea", "Ning", "Paulette",
            "Peggy", "Telly", "Thet", "Thina", "Tina B.", "Tinay", "Tita"
        ];
        if (confirm(`This will add ${names.length} volunteers to the database. Continue?`)) {
            seedVolunteers(names);
        }
    };

    if (loading) return <div className="p-4 text-center">Loading volunteers...</div>;

    return (
        <div className="space-y-6">
            {/* Print Only Header */}
            <div className="only-print mb-4 w-full border-b border-gray-400 pb-2">
                <div className="flex justify-center items-center gap-6">
                    {/* Left Emblem */}
                    <img src="/parish-logo.png" alt="Parish Logo" className="w-16 h-16 object-contain" />

                    <div className="text-center px-4">
                        <h1 className="text-xl font-extrabold text-black leading-tight tracking-tight uppercase">OUR LADY OF THE PILLAR PARISH</h1>
                        <p className="text-xs font-bold text-gray-700 tracking-widest mt-1 uppercase">Ministry of Lectors, Commentators and Psalmists</p>
                        <h2 className="text-lg font-bold text-black mt-2">Volunteer Summary - {format(new Date(year, month - 1), 'MMMM yyyy')}</h2>
                    </div>

                    {/* Right Emblem */}
                    <img src="/ministry-logo.png" alt="Ministry Logo" className="w-16 h-16 object-contain" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 no-print transition-colors duration-200">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 sm:mb-0">Summary</h2>
                <div className="flex items-center space-x-4">
                    {isManager && volunteers.length === 0 && (
                        <button
                            onClick={handleSeed}
                            className="text-sm px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800"
                        >
                            Populate from List
                        </button>
                    )}

                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1 transition-colors duration-200">
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'calendar'
                                ? 'bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm'
                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <Calendar className="w-4 h-4" />
                            Calendar
                        </button>
                        <button
                            onClick={() => setViewMode('person')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'person'
                                ? 'bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm'
                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <List className="w-4 h-4" />
                            Member
                        </button>
                    </div>


                    <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors duration-200">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium px-2">Summary for:</span>
                        <select
                            value={month}
                            onChange={e => setMonth(parseInt(e.target.value))}
                            className="p-1 bg-white dark:bg-gray-800 border-none rounded text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                        >
                            {Array.from({ length: 12 }, (_, i) => i).map(m => (
                                <option key={m} value={m + 1}>{format(new Date(2000, m, 1), 'MMMM')}</option>
                            ))}
                        </select>
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            className="p-1 bg-white dark:bg-gray-800 border-none rounded text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none cursor-pointer ml-1 border-l border-gray-200 dark:border-gray-700 pl-2"
                        >
                            {Array.from({ length: 2 }, (_, i) => new Date().getFullYear() + i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Conditional Rendering based on view mode */}
            {viewMode === 'calendar' ? (
                <CalendarSummaryView schedule={schedule} volunteers={volunteers} month={month} year={year} />
            ) : (
                <PersonSummaryView schedule={schedule} volunteers={volunteers} getVolunteerAssignments={getVolunteerAssignments} month={month} year={year} />
            )}

            {/* Attire Guidelines - Moved from Schedule */}
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg p-4 mb-4 text-sm no-print">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <span className="text-xl">👔</span> Attire Guidelines
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span className="font-bold text-blue-800 dark:text-blue-400 block text-xs uppercase tracking-wider mb-1">Sunday & Special Masses</span>
                        <span className="text-blue-900 dark:text-blue-200 font-medium">Gala Uniform</span>
                    </div>
                    <div>
                        <span className="font-bold text-blue-800 dark:text-blue-400 block text-xs uppercase tracking-wider mb-1">Weekday Masses</span>
                        <div className="text-blue-900 dark:text-blue-200 space-y-1">
                            <div className="flex gap-2">
                                <span className="font-medium min-w-[60px]">Ladies:</span>
                                <span>Black Skirt & White Blouse</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-medium min-w-[60px]">Men:</span>
                                <span>Black Pants & White Polo Shirt</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Download PDF Button - Positioned at Bottom */}
            <div className="flex justify-center no-print">
                <button
                    onClick={() => window.print()}
                    className="px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg flex items-center gap-2 text-sm font-medium shadow-md hover:shadow-lg transition-all"
                    title="Print / Download PDF"
                >
                    <Printer className="w-5 h-5" />
                    <span>Download PDF Summary</span>
                </button>
            </div>
        </div>
    );
}

// Calendar View Component - Traditional Monthly Grid
function CalendarSummaryView({ schedule, volunteers, month, year }: any) {
    if (!schedule || !schedule.masses || schedule.masses.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400 dark:text-gray-500">
                No schedule found for this month.
            </div>
        );
    }

    const getVolunteerName = (id: string | null) => {
        if (!id) return "Unassigned";
        const volunteer = volunteers.find((v: any) => v.id === id);
        return volunteer?.name || "Unknown";
    };

    // Group masses by date
    const massesByDate: { [key: string]: any[] } = {};
    schedule.masses.forEach((mass: any) => {
        const dateObj = (mass.date as any).toDate ? (mass.date as any).toDate() : new Date((mass.date as any).seconds * 1000);
        const dateKey = format(dateObj, 'yyyy-MM-dd');
        if (!massesByDate[dateKey]) {
            massesByDate[dateKey] = [];
        }
        massesByDate[dateKey].push({ ...mass, dateObj });
    });

    // Generate calendar grid
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = lastDayOfMonth.getDate();

    // Create array of all days including padding
    const calendarDays: (Date | null)[] = [];

    // Add padding for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
        calendarDays.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push(new Date(year, month - 1, day));
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden calendar-view-container transition-colors duration-200">
            {/* Calendar Header */}
            <div className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">
                    {format(firstDayOfMonth, 'MMMM yyyy')}
                </h3>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                    <div key={day} className="px-2 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                        {day.substring(0, 3)}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7">
                {calendarDays.map((day, index) => {
                    if (!day) {
                        // Empty cell for padding
                        return (
                            <div
                                key={`empty-${index}`}
                                className="min-h-[120px] border-r border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
                            />
                        );
                    }

                    const dateKey = format(day, 'yyyy-MM-dd');
                    const masses = massesByDate[dateKey] || [];
                    const isToday = format(new Date(), 'yyyy-MM-dd') === dateKey;

                    return (
                        <div
                            key={dateKey}
                            className={`min-h-[120px] border-r border-b border-gray-200 dark:border-gray-700 p-2 ${isToday ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-white dark:bg-gray-800'
                                } hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                        >
                            {/* Day Number */}
                            <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                                }`}>
                                {format(day, 'd')}
                            </div>

                            {/* Masses for this day */}
                            <div className="space-y-1 text-xs">
                                {masses.map((mass: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className={`p-1.5 rounded ${mass.isHighlighted
                                            ? 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700'
                                            : mass.type === 'Sunday'
                                                ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
                                                : 'bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'
                                            }`}
                                    >
                                        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight">
                                            {/* Time */}
                                            <span className="font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                                {format(mass.dateObj, 'h:mm a')}
                                            </span>

                                            {/* Separator if needed or just space */}
                                            {/* Volunteers */}
                                            {/* Volunteers */}
                                            {[
                                                { label: 'C', name: getVolunteerName(mass.assignments.Commentator) },
                                                { label: 'L1', name: getVolunteerName(mass.assignments.Lector1) },
                                                (mass.type === 'Sunday' && mass.assignments.Lector2) ? { label: 'L2', name: getVolunteerName(mass.assignments.Lector2) } : null
                                            ].filter(Boolean).map((role: any, rIdx) => (
                                                <div key={rIdx} className="whitespace-nowrap flex items-center">
                                                    <span className="text-gray-500 dark:text-gray-400 font-medium mr-0.5">{role.label}:</span>
                                                    <span className="text-gray-900 dark:text-gray-100 font-semibold">{role.name}</span>
                                                    {/* Add bullet after item unless it's the last one */}
                                                    {rIdx < (mass.type === 'Sunday' && mass.assignments.Lector2 ? 2 : 1) && (
                                                        <span className="text-gray-400 dark:text-gray-600 mx-1">•</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 p-3 flex items-center gap-4 text-xs no-print">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Legend:</span>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded"></div>
                    <span className="text-gray-600 dark:text-gray-400">Sunday</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded"></div>
                    <span className="text-gray-600 dark:text-gray-400">Weekday</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded"></div>
                    <span className="text-gray-600 dark:text-gray-400">Highlighted</span>
                </div>
                <div className="ml-auto text-gray-500 dark:text-gray-500">
                    C = Commentator • L1 = Lector 1 • L2 = Lector 2
                </div>
            </div>
        </div>
    );
}

// Person-centric View Component (existing view)
function PersonSummaryView({ volunteers, getVolunteerAssignments, month, year }: any) {
    const [searchTerm, setSearchTerm] = useState('');

    const getRoleAbbr = (role: string) => {
        switch (role) {
            case 'Lector1': return 'LEC1';
            case 'Lector2': return 'LEC2';
            case 'Commentator': return 'COMM';
            default: return role.substring(0, 3).toUpperCase();
        }
    };

    const filteredVolunteers = volunteers.filter((v: any) =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors duration-200">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 no-print">
                <div className="relative max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Filter by member name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[120px]">Member</th>
                            <th className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10 text-center">#</th>
                            <th className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assignments ({format(new Date(year, month - 1), 'MMM')})</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {filteredVolunteers.length > 0 ? (
                            filteredVolunteers
                                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                                .map((v: any) => {
                                    const assignments = getVolunteerAssignments(v.id);

                                    return (
                                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group text-sm">
                                            <td className="px-2 py-2 border-b border-gray-300 dark:border-gray-600 border-r border-gray-200 dark:border-gray-700 table-cell-compact whitespace-nowrap">
                                                <span className="font-medium text-gray-900 dark:text-gray-100">{v.name}</span>
                                            </td>
                                            <td className="px-2 py-2 text-center border-b border-gray-300 dark:border-gray-600 table-cell-compact w-12 border-r border-gray-200 dark:border-gray-700">
                                                <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${assignments.length > 0 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                    }`}>
                                                    {assignments.length}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2 border-b border-gray-300 dark:border-gray-600 table-cell-compact">
                                                {assignments.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1 items-center">
                                                        {assignments.map((a: any, idx: number) => (
                                                            <div key={idx} className="flex items-center space-x-1 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-[9px] whitespace-nowrap">
                                                                <span className="font-semibold text-gray-800 dark:text-gray-200">{format(a.date, 'do')}</span>
                                                                <span className="text-gray-400 dark:text-gray-500">|</span>
                                                                <span className="font-semibold text-gray-800 dark:text-gray-200">{format(a.date, 'h:mma')}</span>
                                                                <span className="font-semibold text-gray-800 dark:text-gray-200 uppercase">{getRoleAbbr(a.role)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-gray-400 italic">No assignments</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                        ) : (
                            <tr>
                                <td colSpan={3} className="px-6 py-10 text-center text-gray-400 italic">
                                    {searchTerm ? `No members found matching "${searchTerm}"` : "No volunteers found."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
