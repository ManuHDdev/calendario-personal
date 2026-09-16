import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MensajeriaPage from './pages/MensajeriaPage';

export default function App() {
  return (
    <BrowserRouter basename="/mensajeria">
      <Routes>
        <Route path="/" element={<MensajeriaPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
