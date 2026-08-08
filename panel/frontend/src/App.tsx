import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PanelPage from './pages/PanelPage';
import MyAccountPage from './pages/MyAccountPage';

interface Props {
  isAdmin: boolean;
}

export default function App({ isAdmin }: Props) {
  return (
    <BrowserRouter basename="/panel">
      <Routes>
        <Route path="/" element={isAdmin ? <PanelPage /> : <MyAccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
