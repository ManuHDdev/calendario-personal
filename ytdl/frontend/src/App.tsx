import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import YtdlPage from './pages/YtdlPage';

export default function App() {
  return (
    <BrowserRouter basename="/ytdl">
      <Routes>
        <Route path="/" element={<YtdlPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
