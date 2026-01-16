import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SchedulePage from './pages/SchedulePage';
import VolunteersPage from './pages/VolunteersPage';
import AvailabilityPage from './pages/AvailabilityPage';
import HelpPage from './pages/HelpPage';
import ProfilePage from './pages/ProfilePage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="volunteers" element={<VolunteersPage />} />
        <Route path="availability" element={<AvailabilityPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}

export default App;
