import { User as UserIcon, LogOut, Mail, ShieldCheck, Smartphone, UserPlus, Trash2, ShieldAlert, Moon, Sun, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth, useManagers, useMassTimings } from '../lib/hooks';
import { MassTimingsModal } from './SchedulePage';

export default function ProfilePage() {
    const { user, loading, isManager } = useAuth();
    const { managers, addManager, removeManager } = useManagers();
    const { defaultTimings, updateDefaultTimings } = useMassTimings();
    const [newManagerEmail, setNewManagerEmail] = useState('');
    const [isDefaultTimingsOpen, setIsDefaultTimingsOpen] = useState(false);

    // Theme State
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // Initial state from DOM or local storage to match current reality
        return document.documentElement.classList.contains('dark');
    });

    useEffect(() => {
        // Sync with user preference if loaded
        if (user?.darkMode !== undefined) {
            setIsDarkMode(user.darkMode);
        }
    }, [user?.darkMode]);

    const toggleTheme = async () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);

        // Instant Apply
        document.documentElement.classList.toggle('dark', newMode);
        localStorage.setItem('theme', newMode ? 'dark' : 'light');

        // Persist for Manager
        if (isManager && user?.email) {
            try {
                const ref = doc(db, 'managers', user.email);
                // We use updateDoc assuming the doc exists (checked in useAuth)
                await updateDoc(ref, { darkMode: newMode });
            } catch (error) {
                console.error("Failed to save theme preference", error);
            }
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleAddManager = (e: React.FormEvent) => {
        e.preventDefault();
        if (newManagerEmail.trim()) {
            addManager(newManagerEmail);
            setNewManagerEmail('');
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center p-12">
            <div className="text-gray-500">Loading profile...</div>
        </div>
    );

    if (!user) return null;

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Profile Header */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors duration-200">
                <div className="h-32 bg-indigo-600 relative">
                    <div className="absolute -bottom-12 left-8">
                        {user.photoURL ? (
                            <img
                                src={user.photoURL}
                                alt={user.displayName || 'User'}
                                className="w-24 h-24 rounded-2xl border-4 border-white dark:border-gray-800 bg-white dark:bg-gray-800 shadow-md"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-2xl border-4 border-white dark:border-gray-800 bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-md">
                                <UserIcon className="w-12 h-12" />
                            </div>
                        )}
                    </div>
                </div>
                <div className="pt-16 pb-6 px-8 flex justify-between items-end">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{user.displayName || 'Volunteer Admin'}</h2>
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mt-1">
                            <Mail className="w-4 h-4" />
                            <span className="text-sm">{user.email}</span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Account Details & Role */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 transition-colors duration-200">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900 dark:text-white">Account Access</h3>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Role</p>
                        <div className="flex items-center gap-2">
                            <span className={clsx(
                                "px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                                user.role === 'Admin' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
                                    user.role === 'Manager' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            )}>
                                {user.role}
                            </span>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Status</p>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Active Session</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 transition-colors duration-200">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Smartphone className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900 dark:text-white">App Information</h3>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Version</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">v1.3.0 (RBAC Enabled)</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                        <div className="text-xs text-gray-400 uppercase font-bold tracking-wider">Appearance</div>
                        <button
                            onClick={toggleTheme}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-xs"
                        >
                            {isDarkMode ? (
                                <>
                                    <Moon className="w-4 h-4" />
                                    <span>Dark Mode</span>
                                </>
                            ) : (
                                <>
                                    <Sun className="w-4 h-4" />
                                    <span>Light Mode</span>
                                </>
                            )}
                        </button>
                    </div>

                    <button
                        onClick={async () => {
                            if ('serviceWorker' in navigator) {
                                const registrations = await navigator.serviceWorker.getRegistrations();
                                for (const registration of registrations) {
                                    await registration.update();
                                }
                            }
                            // Clear all caches
                            if ('caches' in window) {
                                const keys = await caches.keys();
                                for (const key of keys) {
                                    await caches.delete(key);
                                }
                            }
                            window.location.reload();
                        }}
                        className="w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                    >
                        Update App
                    </button>
                </div>
            </div>

            {/* Default Mass Timings Section (Only for Admins and Managers) */}
            {isManager && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors duration-200">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-600 text-white rounded-lg">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">Default Mass Timings</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Set the base schedule for new month generation</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-6">
                        <button
                            onClick={() => setIsDefaultTimingsOpen(true)}
                            className="w-full py-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors flex items-center justify-center gap-2"
                        >
                            <Clock className="w-4 h-4" />
                            Configure Default Timings
                        </button>
                    </div>
                </div>
            )}

            {/* Manage Managers Section (Only for Admins and Managers) */}
            {isManager && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors duration-200">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 text-white rounded-lg">
                                <ShieldAlert className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">Manage Access</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Add or remove managers from the system</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-6 space-y-6">
                        <form onSubmit={handleAddManager} className="flex gap-2">
                            <div className="relative flex-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="email"
                                    value={newManagerEmail}
                                    onChange={e => setNewManagerEmail(e.target.value)}
                                    placeholder="Enter manager's email"
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
                            >
                                <UserPlus className="w-4 h-4" />
                                Add
                            </button>
                        </form>

                        <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">Current Managers</p>
                            <div className="divide-y divide-gray-50 dark:divide-gray-700 border border-gray-50 dark:border-gray-700 rounded-xl overflow-hidden">
                                {managers.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-gray-500 italic">No additional managers added.</div>
                                ) : (
                                    managers.map((manager) => (
                                        <div key={manager.email} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                                                    {manager.email[0].toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{manager.email}</span>
                                            </div>
                                            <button
                                                onClick={() => removeManager(manager.email)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDefaultTimingsOpen && (
                <MassTimingsModal
                    onClose={() => setIsDefaultTimingsOpen(false)}
                    currentTimings={defaultTimings}
                    onSave={async (timings) => {
                        await updateDefaultTimings(timings);
                        setIsDefaultTimingsOpen(false);
                    }}
                    title="Configure Default Mass Timings"
                />
            )}
        </div>
    );
}
