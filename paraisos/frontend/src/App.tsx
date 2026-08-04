import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ParaisosPage from './pages/ParaisosPage';

export default function App() {
  return (
    <BrowserRouter basename="/paraisos">
      <Routes>
        <Route path="/" element={<ParaisosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
