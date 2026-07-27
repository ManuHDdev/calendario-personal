import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import OfertasPage from './pages/OfertasPage';

export default function App() {
  return (
    <BrowserRouter basename="/ofertas">
      <Routes>
        <Route path="/" element={<OfertasPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
