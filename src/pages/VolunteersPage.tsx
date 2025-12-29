import { useState } from 'react';
import { useVolunteers, useSchedule } from '../lib/hooks';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';

export default function VolunteersPage() {
    const { volunteers, loading, seedVolunteers } = useVolunteers();

    // Summary State
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

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
            <div className="only-print mb-4">
                <h1 className="text-2xl font-bold text-black tracking-tight">Volunteer Summary for {format(new Date(year, month - 1), 'MMMM yyyy')}</h1>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 no-print">
                <h2 className="text-xl font-bold text-gray-800 mb-4 sm:mb-0">Summary</h2>
                <div className="flex items-center space-x-4">
                    {volunteers.length === 0 && (
                        <button
                            onClick={handleSeed}
                            className="text-sm px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 border border-green-200"
                        >
                            Populate from List
                        </button>
                    )}
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => window.print()}
                            className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg flex items-center gap-2 text-sm font-medium border border-indigo-200 transition-colors"
                            title="Print / Download PDF"
                        >
                            <Printer className="w-4 h-4" />
                            <span>Download PDF Summary</span>
                        </button>
                    </div>
                    <div className="flex items-center space-x-2 bg-gray-50 p-1 rounded-lg">
                        <span className="text-xs text-gray-500 font-medium px-2">Summary for:</span>
                        <select
                            value={month}
                            onChange={e => setMonth(parseInt(e.target.value))}
                            className="p-1 bg-white border-none rounded text-sm font-semibold text-gray-700 outline-none cursor-pointer"
                        >
                            {Array.from({ length: 12 }, (_, i) => i).map(m => (
                                <option key={m} value={m + 1}>{format(new Date(2000, m, 1), 'MMMM')}</option>
                            ))}
                        </select>
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            className="p-1 bg-white border-none rounded text-sm font-semibold text-gray-700 outline-none cursor-pointer ml-1 border-l border-gray-200 pl-2"
                        >
                            {Array.from({ length: 2 }, (_, i) => new Date().getFullYear() + i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px]">Name</th>
                                <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-10 text-center">#</th>
                                <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignments ({format(new Date(year, month - 1), 'MMM')})</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {volunteers
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(v => {
                                    const assignments = getVolunteerAssignments(v.id);

                                    // Helper for abbreviations
                                    const getRoleAbbr = (role: string) => {
                                        switch (role) {
                                            case 'Lector1': return 'LEC1';
                                            case 'Lector2': return 'LEC2'; // if Sunday
                                            case 'Commentator': return 'COMM';
                                            default: return role.substring(0, 3).toUpperCase();
                                        }
                                    };

                                    return (
                                        <tr key={v.id} className="hover:bg-gray-50 transition-colors group text-sm">
                                            <td className="px-2 py-2 border-b border-gray-300 border-r border-gray-200 table-cell-compact whitespace-nowrap">
                                                <span className="font-medium text-gray-900">{v.name}</span>
                                            </td>
                                            <td className="px-2 py-2 text-center border-b border-gray-300 table-cell-compact w-12 border-r border-gray-200">
                                                <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${assignments.length > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {assignments.length}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2 border-b border-gray-300 table-cell-compact">
                                                {assignments.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1 items-center">
                                                        {assignments.map((a, idx) => (
                                                            <div key={idx} className="flex items-center space-x-1 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[9px] whitespace-nowrap">
                                                                <span className="font-semibold text-gray-800">{format(a.date, 'do')}</span>
                                                                <span className="text-gray-400">|</span>
                                                                <span className="font-semibold text-gray-800">{format(a.date, 'h:mma')}</span>
                                                                <span className="font-semibold text-gray-800 uppercase">{getRoleAbbr(a.role)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-gray-400 italic">No assignments</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            {volunteers.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-10 text-center text-gray-400 italic">
                                        No volunteers found. Add some above!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
