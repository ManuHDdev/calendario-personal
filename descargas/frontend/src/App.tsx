import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DescargasPage from './pages/DescargasPage';

export default function App() {
  return (
    <BrowserRouter basename="/descargas">
      <Routes>
        <Route path="/" element={<DescargasPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
