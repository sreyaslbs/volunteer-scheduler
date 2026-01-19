import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Calendar, Users, Home, HelpCircle, ShieldAlert, User as UserIcon } from 'lucide-react';
import clsx from 'clsx';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useAuth } from '../lib/hooks';

export default function Layout() {
    const location = useLocation();
    const { user, loading } = useAuth();

    // Theme Management
    useEffect(() => {
        const applyTheme = (isDark: boolean) => {
            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        if (user && (user.role === 'Manager' || user.role === 'Admin')) {
            // Manager: Trust DB preference (if explicit), fallback to local, then DEFAULT DARK
            if (typeof user.darkMode === 'boolean') {
                applyTheme(user.darkMode);
                localStorage.setItem('theme', user.darkMode ? 'dark' : 'light');
            } else {
                const localTheme = localStorage.getItem('theme');
                // Default to DARK if no local theme
                applyTheme(localTheme ? localTheme === 'dark' : true);
            }
        } else {
            // Non-manager: Local storage or DEFAULT DARK
            const localTheme = localStorage.getItem('theme');
            if (localTheme) {
                applyTheme(localTheme === 'dark');
            } else {
                applyTheme(true);
            }
        }
    }, [user]);

    const login = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Login failed", error);
            alert("Login failed. Please try again.");
        }
    };



    const navItems = [
        { name: 'Dashboard', path: '/', icon: Home, roles: ['Admin', 'Manager', 'Volunteer'] },
        { name: 'Schedule', path: '/schedule', icon: Calendar, roles: ['Admin', 'Manager'] },
        { name: 'Availability', path: '/availability', icon: ShieldAlert, roles: ['Admin', 'Manager'] },
        { name: 'Summary', path: '/volunteers', icon: Users, roles: ['Admin', 'Manager', 'Volunteer'] },
        { name: 'Profile', path: '/profile', icon: UserIcon, roles: ['Admin', 'Manager', 'Volunteer'] },
        { name: 'Help', path: '/help', icon: HelpCircle, roles: ['Admin', 'Manager'] },
    ].filter(item => item.roles.includes(user?.role || 'Volunteer'));

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
                <div className="text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors duration-200">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center transition-colors duration-200">
                    <div className="mx-auto w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mb-4 transition-colors duration-200">
                        <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome Back</h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-8">Please sign in to access the Volunteer Scheduler</p>

                    <button
                        onClick={login}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                        Sign in with Google
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-100 flex flex-col font-sans text-gray-900 relative transition-colors duration-200">
            {/* Watermark */}
            <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-5 overflow-hidden">
                <img src="/parish-logo.png" className="w-[500px] h-[500px] md:w-[800px] md:h-[800px] object-contain grayscale" alt="Watermark" />
            </div>

            <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 flex flex-col transition-colors duration-200">
                {/* Top Brand Section - Centered with Logos */}
                <div className="w-full bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 py-4 transition-colors duration-200">
                    <div className="max-w-5xl mx-auto px-4 flex justify-center items-center gap-3 md:gap-6">

                        {/* Left Emblem - Parish Logo */}
                        <div className="flex-shrink-0">
                            <img src="/parish-logo.png" alt="Parish Logo" className="w-16 h-16 md:w-28 md:h-28 object-contain" />
                        </div>

                        {/* Center Text */}
                        <div className="text-center px-2 flex flex-col gap-1">
                            <h1 className="text-xs md:text-lg font-extrabold text-indigo-600 dark:text-indigo-300 tracking-wider uppercase mb-0">Ministry of Lectors, Commentators and Psalmists</h1>
                            <p className="text-xs md:text-lg font-extrabold text-indigo-900 dark:text-indigo-400 leading-tight tracking-tight mt-0">OUR LADY OF THE PILLAR PARISH</p>
                        </div>

                        {/* Right Emblem - Ministry Logo */}
                        <div className="flex-shrink-0">
                            <img src="/ministry-logo.png" alt="Ministry Logo" className="w-16 h-16 md:w-28 md:h-28 object-contain" />
                        </div>

                    </div>
                </div>

                {/* Desktop Navigation Tabs - Below Header */}
                <div className="hidden md:block bg-white/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
                    <div className="max-w-4xl mx-auto px-4">
                        <nav className="flex justify-center space-x-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={clsx(
                                        "flex items-center space-x-2 px-6 py-3 text-sm font-medium transition-all border-b-2",
                                        location.pathname === item.path
                                            ? "text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 bg-indigo-50/30 dark:bg-indigo-900/20"
                                            : "text-gray-500 dark:text-gray-400 border-transparent hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    )}
                                >
                                    <item.icon className="w-4 h-4" />
                                    <span>{item.name}</span>
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-4xl mx-auto w-full p-4 pb-20 md:pb-4">
                <Outlet />
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-20 pb-safe transition-colors duration-200">
                <div className="flex justify-around items-center h-16">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                location.pathname === item.path ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="text-[10px] uppercase font-semibold">{item.name}</span>
                        </Link>
                    ))}

                </div>
            </nav>
        </div>
    );
}

