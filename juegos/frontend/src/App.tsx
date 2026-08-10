import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import HubPage from './pages/HubPage';
import PassAndPlayImpostor from './games/impostor/PassAndPlayImpostor';
import YoNunca from './games/yonunca/YoNunca';
import VerdadOReto from './games/verdadoreto/VerdadOReto';
import Tabu from './games/tabu/Tabu';
import Mimica from './games/mimica/Mimica';
import RoomLobby from './games/live/RoomLobby';
import ImpostorLive from './games/live/ImpostorLive';
import TriviaLive from './games/live/TriviaLive';
import BombParty from './games/bombparty/BombParty';
import QuienEsMasProbable from './games/quienesmasprobable/QuienEsMasProbable';
import DiezDeDiez from './games/diezdediez/DiezDeDiez';
import RespuestasFalsasLive from './games/live/RespuestasFalsasLive';
import StopLive from './games/live/StopLive';
import CoupLive from './games/live/CoupLive';
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
          <Route path="/bomb-party" element={<BombParty />} />
          <Route path="/quien-es-mas-probable" element={<QuienEsMasProbable />} />
          <Route path="/diez-de-diez" element={<DiezDeDiez />} />
          <Route path="/tabu" element={<Tabu />} />
          <Route path="/mimica" element={<Mimica />} />
          <Route path="/live" element={<RoomLobby />} />
          <Route path="/live/impostor/:code" element={<ImpostorLive />} />
          <Route path="/live/trivia/:code" element={<TriviaLive />} />
          <Route path="/live/respuestas-falsas/:code" element={<RespuestasFalsasLive />} />
          <Route path="/live/stop/:code" element={<StopLive />} />
          <Route path="/live/coup/:code" element={<CoupLive />} />
          <Route path="/live/hombre-lobo/:code" element={<HombreLoboLive />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
