import { Outlet, Link, useLocation } from 'react-router-dom';
import { Calendar, Users, Home, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import Auth from './Auth';

export default function Layout() {
    const location = useLocation();

    const navItems = [
        { name: 'Dashboard', path: '/', icon: Home },
        { name: 'Schedule', path: '/schedule', icon: Calendar },
        { name: 'Summary', path: '/volunteers', icon: Users },
        { name: 'Help', path: '/help', icon: HelpCircle },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-indigo-600">Volunteer Sched</h1>
                    <div className="flex items-center gap-4">
                        <nav className="hidden md:flex space-x-6">
                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={clsx(
                                        "flex items-center space-x-2 text-sm font-medium transition-colors hover:text-indigo-600",
                                        location.pathname === item.path ? "text-indigo-600" : "text-gray-500"
                                    )}
                                >
                                    <item.icon className="w-4 h-4" />
                                    <span>{item.name}</span>
                                </Link>
                            ))}
                        </nav>
                        <Auth />
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-4xl mx-auto w-full p-4 pb-20 md:pb-4">
                <Outlet />
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-20 pb-safe">
                <div className="flex justify-around items-center h-16">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                location.pathname === item.path ? "text-indigo-600" : "text-gray-400"
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="text-[10px] uppercase font-semibold">{item.name}</span>
                        </Link>
                    ))}
                </div>
            </nav>
        </div >
    );
}
