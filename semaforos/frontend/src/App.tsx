import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SemaforosPage from './pages/SemaforosPage';

export default function App() {
  return (
    <BrowserRouter basename="/semaforos">
      <Routes>
        <Route path="/" element={<SemaforosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
