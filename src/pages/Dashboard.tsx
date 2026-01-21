import { Link } from 'react-router-dom';
import { Calendar, Users, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/hooks';

export default function Dashboard() {
    const { user, isManager } = useAuth();

    return (
        <div className="space-y-6">
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                <h2 className="text-2xl font-bold mb-2">Welcome Back, {user?.displayName || 'Volunteer'}!</h2>
                <p className="opacity-90">Manage your mass schedules and volunteer assignments easily.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isManager && (
                    <Link to="/schedule" className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all flex items-center space-x-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Manage Schedule</h3>
                            <p className="text-sm text-gray-500">Generate, edit, and adjust masses</p>
                        </div>
                    </Link>
                )}

                <Link to="/volunteers" className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all flex items-center space-x-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">Summary</h3>
                        <p className="text-sm text-gray-500">View assignments and export</p>
                    </div>
                </Link>

                {isManager && (
                    <Link to="/availability" className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all flex items-center space-x-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-100">
                            <ClipboardCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Update Availability</h3>
                            <p className="text-sm text-gray-500">Mark unavailable dates</p>
                        </div>
                    </Link>
                )}
                {/* Managers Access - Only for Admins/Managers */}
                {isManager && (
                    <Link to="/profile" className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all flex items-center space-x-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Managers</h3>
                            <p className="text-sm text-gray-500">Manage access and roles</p>
                        </div>
                    </Link>
                )}
            </div>
        </div>
    );
}
