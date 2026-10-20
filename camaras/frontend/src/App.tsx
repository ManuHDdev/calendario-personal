import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import CamarasPage from './pages/CamarasPage';

export default function App() {
  return (
    <BrowserRouter basename="/camaras">
      <Routes>
        <Route path="/" element={<CamarasPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
