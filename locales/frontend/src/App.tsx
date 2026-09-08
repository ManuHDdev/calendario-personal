import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LocalesPage from './pages/LocalesPage';

export default function App() {
  return (
    <BrowserRouter basename="/locales">
      <Routes>
        <Route path="/" element={<LocalesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
