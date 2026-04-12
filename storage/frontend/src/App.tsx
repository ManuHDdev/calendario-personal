import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StoragePage from './pages/StoragePage';

export default function App() {
  return (
    <BrowserRouter basename="/storage">
      <Routes>
        <Route path="/" element={<StoragePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
