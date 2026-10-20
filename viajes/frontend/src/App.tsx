import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import RequireAccess from './components/RequireAccess';
import TripsPage from './pages/TripsPage';
import TripPage from './pages/TripPage';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/viajes">
        <RequireAccess>
          <Routes>
            <Route path="/" element={<TripsPage />} />
            <Route path="/trips/:id" element={<TripPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RequireAccess>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
