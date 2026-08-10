import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import HubPage from './pages/HubPage';
import PassAndPlayImpostor from './games/impostor/PassAndPlayImpostor';
import YoNunca from './games/yonunca/YoNunca';
import VerdadOReto from './games/verdadoreto/VerdadOReto';
import RoomLobby from './games/live/RoomLobby';
import ImpostorLive from './games/live/ImpostorLive';
import TriviaLive from './games/live/TriviaLive';
import HombreLoboLive from './games/live/HombreLoboLive';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/juegos">
        <Routes>
          <Route path="/" element={<HubPage />} />
          <Route path="/impostor" element={<PassAndPlayImpostor />} />
          <Route path="/yo-nunca" element={<YoNunca />} />
          <Route path="/verdad-o-reto" element={<VerdadOReto />} />
          <Route path="/live" element={<RoomLobby />} />
          <Route path="/live/impostor/:code" element={<ImpostorLive />} />
          <Route path="/live/trivia/:code" element={<TriviaLive />} />
          <Route path="/live/hombre-lobo/:code" element={<HombreLoboLive />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
