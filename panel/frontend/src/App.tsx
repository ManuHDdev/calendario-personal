import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PanelPage from './pages/PanelPage';

export default function App() {
  return (
    <BrowserRouter basename="/panel">
      <Routes>
        <Route path="/" element={<PanelPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
