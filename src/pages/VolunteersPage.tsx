import { useState, useEffect } from 'react';
import { useVolunteers, useSchedule, useAuth } from '../lib/hooks';
import { format } from 'date-fns';
import { Printer, Calendar, List, Search, FileDown } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

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

    const handleDownloadExcel = async () => {
        if (!schedule || !schedule.masses) return;

        const getVolunteerName = (id: string | null) => {
            if (!id) return "";
            const volunteer = volunteers.find((v: any) => v.id === id);
            return volunteer?.name || "Unknown";
        };

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Schedule');

        // Main Headers
        const titleRow1 = worksheet.addRow(["OUR LADY OF THE PILLAR PARISH"]);
        const titleRow2 = worksheet.addRow(["MINISTRY OF LECTORS, COMMENTATORS AND PSALMISTS (MLCP)"]);
        const titleRow3 = worksheet.addRow([`${format(new Date(year, month - 1), 'MMMM yyyy').toUpperCase()} MASS SCHEDULE`]);
        worksheet.addRow([]); // Empty row

        // Merge title rows
        worksheet.mergeCells('A1:Q1');
        worksheet.mergeCells('A2:Q2');
        worksheet.mergeCells('A3:Q3');

        // Style title rows
        [titleRow1, titleRow2, titleRow3].forEach(row => {
            row.alignment = { horizontal: 'center' };
            row.font = { bold: true, size: 12 };
        });

        const sortedMasses = [...schedule.masses].sort((a, b) => {
            const timeA = (a.date as any).toDate ? (a.date as any).toDate().getTime() : (a.date as any).seconds * 1000;
            const timeB = (b.date as any).toDate ? (b.date as any).toDate().getTime() : (b.date as any).seconds * 1000;
            return timeA - timeB;
        });

        const sections: Record<string, any[]> = {};
        sortedMasses.forEach(m => {
            const dateObj = (m.date as any).toDate ? (m.date as any).toDate() : new Date((m.date as any).seconds ? (m.date as any).seconds * 1000 : m.date);
            const timeStr = format(dateObj, 'HH:mm');
            const isSat = dateObj.getDay() === 6;
            const isSun = dateObj.getDay() === 0;

            let sectionKey = m.name ? m.name.toUpperCase() : m.type.toUpperCase();

            if (isSun) sectionKey = "SUNDAYS";
            else if (isSat) {
                if (timeStr === '19:30') sectionKey = "ANTICIPATED MASS CAMELLA";
                else if (timeStr === '18:30') sectionKey = "ANTICIPATED MASS OLPP";
                else if (timeStr === '17:30') sectionKey = m.name ? `ANTICIPATED MASS ${m.name.toUpperCase()}` : "ANTICIPATED MASS";
                else sectionKey = m.name ? `ANTICIPATED MASS ${m.name.toUpperCase()}` : "ANTICIPATED MASS";
            } else if (m.type === 'Weekday') {
                sectionKey = "WEEKDAY MASSES";
            }

            if (!sections[sectionKey]) sections[sectionKey] = [];
            sections[sectionKey].push(m);
        });

        const order = [
            "ANTICIPATED MASS CAMELLA", "ANTICIPATED MASS OLPP", "ANTICIPATED MASS SAMPAGUITA",
            "ANTICIPATED MASS TERESA PARK/COMPD", "ANTICIPATED MASS GLORIA", "ANTICIPATED MASS PAG-ASA",
            "SUNDAYS", "WEEKDAY MASSES"
        ];

        const sectionOrder = Object.keys(sections).sort((a, b) => {
            const idxA = order.indexOf(a);
            const idxB = order.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        sectionOrder.forEach(key => {
            const masses = sections[key];
            if (masses.length === 0) return;

            // Section Header
            const sectionRow = worksheet.addRow([]);
            if (key === "WEEKDAY MASSES") {
                sectionRow.getCell(1).value = "WEEKDAYS";
                sectionRow.getCell(9).value = "ATTIRE: Black Skirt & White Blouse (Ladies)";
                worksheet.mergeCells(sectionRow.number, 1, sectionRow.number + 1, 2);
                worksheet.mergeCells(sectionRow.number, 9, sectionRow.number, 17);
                sectionRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                sectionRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
                sectionRow.getCell(1).font = { bold: true };

                const attireRow2 = worksheet.getRow(sectionRow.number + 1);
                attireRow2.getCell(9).value = "Black Pants & White Polo Shirt (Men)";
                worksheet.mergeCells(attireRow2.number, 9, attireRow2.number, 17);
                attireRow2.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
            } else if (key.startsWith("ANTICIPATED MASS")) {
                const location = key.replace("ANTICIPATED MASS ", "");
                sectionRow.getCell(1).value = "ANTICIPATED MASS";
                sectionRow.getCell(9).value = "ATTIRE: GALA UNIFORM";
                worksheet.mergeCells(sectionRow.number, 1, sectionRow.number, 2);
                worksheet.mergeCells(sectionRow.number, 9, sectionRow.number, 17);
                sectionRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                sectionRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
                sectionRow.getCell(1).font = { bold: true };

                const locRow = worksheet.addRow([]);
                locRow.getCell(1).value = location;
                worksheet.mergeCells(locRow.number, 1, locRow.number, 2);
                locRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                locRow.getCell(1).font = { bold: true };
            } else {
                sectionRow.getCell(1).value = key;
                sectionRow.getCell(9).value = "ATTIRE: GALA UNIFORM";
                worksheet.mergeCells(sectionRow.number, 1, sectionRow.number, 2);
                worksheet.mergeCells(sectionRow.number, 9, sectionRow.number, 17);
                sectionRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                sectionRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
                sectionRow.getCell(1).font = { bold: true };
            }

            // Table Header Row 1
            const headerRow1 = [
                "DATE", "TIME",
                "LECTOR 1", "LECTOR 1", "LECTOR 1", "SWAPPED", "SWAPPED",
                "LECTOR 2", "LECTOR 2", "LECTOR 2", "SWAPPED", "SWAPPED",
                "COMMENTATOR", "COMMENTATOR", "COMMENTATOR", "SWAPPED", "SWAPPED"
            ];
            const headerRow2 = [
                "", "",
                "ON DUTY", "WHO SERVED", "TIME", "DATE", "TIME",
                "ON DUTY", "WHO SERVED", "TIME", "DATE", "TIME",
                "ON DUTY", "WHO SERVED", "TIME", "DATE", "TIME"
            ];

            const h1 = worksheet.addRow(headerRow1);
            const h2 = worksheet.addRow(headerRow2);

            // Merge Headers
            worksheet.mergeCells(h1.number, 1, h2.number, 1); // DATE
            worksheet.mergeCells(h1.number, 2, h2.number, 2); // TIME
            worksheet.mergeCells(h1.number, 3, h1.number, 5); // L1 Group
            worksheet.mergeCells(h1.number, 6, h1.number, 7); // L1 Swapped
            worksheet.mergeCells(h1.number, 8, h1.number, 10); // L2 Group
            worksheet.mergeCells(h1.number, 11, h1.number, 12); // L2 Swapped
            worksheet.mergeCells(h1.number, 13, h1.number, 15); // COM Group
            worksheet.mergeCells(h1.number, 16, h1.number, 17); // COM Swapped

            [h1, h2].forEach(row => {
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.font = { bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });
            });

            // Data Rows
            let lastDataRowNumber = h2.number;
            masses.forEach(m => {
                const dateObj = (m.date as any).toDate ? (m.date as any).toDate() : new Date((m.date as any).seconds ? (m.date as any).seconds * 1000 : m.date);
                const row = worksheet.addRow([
                    format(dateObj, 'eeee, d MMMM yyyy'),
                    format(dateObj, 'hh:mm a'),
                    getVolunteerName(m.assignments.Lector1), "", "", "", "", // L1
                    getVolunteerName(m.assignments.Lector2), "", "", "", "", // L2
                    getVolunteerName(m.assignments.Commentator), "", "", "", "" // Com
                ]);
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.alignment = { vertical: 'middle' };
                });
                lastDataRowNumber = row.number;
            });

            // APPLY BORDERS TO THE ENTIRE SECTION TABLE
            const tableStartRow = sectionRow.number;
            const tableEndRow = lastDataRowNumber;

            for (let r = tableStartRow; r <= tableEndRow; r++) {
                const row = worksheet.getRow(r);
                const nextRow = r < tableEndRow ? worksheet.getRow(r + 1) : null;

                // Check if date changes in the next row (only for data rows)
                let isDateEnd = false;
                if (r >= h2.number && nextRow && r < tableEndRow) {
                    const currentVal = row.getCell(1).value?.toString() || '';
                    const nextVal = nextRow.getCell(1).value?.toString() || '';
                    // Only trigger if we are in data rows and values are dates
                    if (currentVal.includes(',') && nextVal.includes(',') && currentVal !== nextVal) {
                        isDateEnd = true;
                    }
                }

                for (let c = 1; c <= 17; c++) {
                    const cell = row.getCell(c);

                    const borderStyle: any = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: isDateEnd ? { style: 'medium' } : { style: 'thin' },
                        right: { style: 'thin' }
                    };

                    // Thick Outer Perimeter
                    if (r === tableStartRow) borderStyle.top = { style: 'medium' };
                    if (r === tableEndRow) borderStyle.bottom = { style: 'medium' };
                    if (c === 1) borderStyle.left = { style: 'medium' };
                    if (c === 17) borderStyle.right = { style: 'medium' };

                    // Thick Group Dividers
                    if (c === 2 || c === 7 || c === 12) borderStyle.right = { style: 'medium' };
                    if (c === 3 || c === 8 || c === 13) borderStyle.left = { style: 'medium' };

                    cell.border = borderStyle;
                }
            }

            // Gap between sections
            worksheet.addRow([]);
            worksheet.addRow([]);
            worksheet.addRow([]);
            worksheet.addRow([]);
        });

        // Column Widths
        worksheet.columns = [
            { width: 25 }, { width: 12 }, // Date, Time
            { width: 15 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 10 }, // L1
            { width: 15 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 10 }, // L2
            { width: 15 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 10 }  // Com
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Mass_Schedule_${format(new Date(year, month - 1), 'MMMM_yyyy')}.xlsx`);
    };

    if (loading) return <div className="p-4 text-center">Loading volunteers...</div>;

    return (
        <div className="space-y-6">
            {/* Print Only Header */}
            <div className="only-print mb-4 w-full border-b border-gray-400 pb-2">
                <div className="flex justify-center items-center gap-6">
                    {/* Left Emblem */}
                    <img src="/parish-logo.png" alt="Parish Logo" className="w-16 h-16 object-contain" />

                    <div className="text-center px-4 flex flex-col gap-1">
                        <h1 className="text-base font-extrabold text-gray-700 tracking-wider uppercase">Ministry of Lectors, Commentators and Psalmists</h1>
                        <p className="text-base font-extrabold text-black leading-tight tracking-tight uppercase">OUR LADY OF THE PILLAR PARISH</p>
                        <h2 className="text-xs font-bold text-gray-500 mt-1 italic">Volunteer Summary - {format(new Date(year, month - 1), 'MMMM yyyy')}</h2>
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

            {/* Download Buttons - Positioned at Bottom */}
            <div className="flex flex-col sm:flex-row justify-center gap-4 no-print mt-8">
                <button
                    onClick={() => window.print()}
                    className="px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg flex items-center justify-center gap-2 text-sm font-medium shadow-md hover:shadow-lg transition-all"
                    title="Print / Download PDF"
                >
                    <Printer className="w-5 h-5" />
                    <span>Download PDF Summary</span>
                </button>
                <button
                    onClick={handleDownloadExcel}
                    className="px-6 py-3 bg-green-600 text-white hover:bg-green-700 rounded-lg flex items-center justify-center gap-2 text-sm font-medium shadow-md hover:shadow-lg transition-all"
                    title="Download Excel"
                >
                    <FileDown className="w-5 h-5" />
                    <span>Download Excel Summary</span>
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
                                                { label: 'L1', name: getVolunteerName(mass.assignments.Lector1) },
                                                (mass.type === 'Sunday' && mass.assignments.Lector2) ? { label: 'L2', name: getVolunteerName(mass.assignments.Lector2) } : null,
                                                { label: 'C', name: getVolunteerName(mass.assignments.Commentator) }
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
                    L1 = Lector 1 • L2 = Lector 2 • C = Commentator
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
