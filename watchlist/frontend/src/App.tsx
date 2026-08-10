import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import WatchlistPage from './pages/WatchlistPage';

export default function App() {
  return (
    <BrowserRouter basename="/watchlist">
      <Routes>
        <Route path="/" element={<WatchlistPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
