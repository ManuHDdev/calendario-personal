import { useCallback, useEffect, useRef, useState } from 'react';
import { imagenUrl, refreshToken } from '../services/api';

interface Props {
  id: number;
  alt: string;
  /** Cada cuántos segundos se vuelve a pedir la imagen mientras está a la vista. */
  refrescoSegundos?: number;
  /** Cámaras que no tienen imagen fija (solo enlace a una página). */
  sinImagen?: boolean;
  /**
   * Botón «Reintentar» en el aviso de sin señal. Desactivarlo cuando la imagen va
   * dentro de un <button> (un botón dentro de otro no es HTML válido): el refresco
   * automático reintenta solo.
   */
  reintentable?: boolean;
}

type Estado = 'cargando' | 'ok' | 'error';

/**
 * Imagen en vivo de una cámara: pide la captura solo mientras el componente está
 * en pantalla Y la pestaña visible, y la refresca cada `refrescoSegundos`. Un
 * refresco que falla conserva la última imagen buena pero lo dice ("sin señal"):
 * una captura vieja nunca debe pasar por actual.
 */
export default function CamaraImagen({ id, alt, refrescoSegundos = 60, sinImagen = false, reintentable = true }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [capturadaEn, setCapturadaEn] = useState<Date | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver((entradas) => setVisible(entradas.some((e) => e.isIntersecting)), {
      rootMargin: '120px',
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cargar = useCallback(async (cancelado: () => boolean) => {
    await refreshToken(60);
    if (cancelado()) return;
    const url = imagenUrl(id);
    const precarga = new Image();
    precarga.onload = () => {
      if (cancelado()) return;
      setSrc(url);
      setEstado('ok');
      setCapturadaEn(new Date());
    };
    precarga.onerror = () => {
      if (cancelado()) return;
      setEstado('error');
    };
    precarga.src = url;
  }, [id]);

  useEffect(() => {
    if (sinImagen || !visible) return;
    let cancelado = false;
    const esCancelado = () => cancelado;
    const siVisiblePestana = () => {
      if (document.visibilityState === 'visible') void cargar(esCancelado);
    };

    siVisiblePestana();
    const temporizador = window.setInterval(siVisiblePestana, refrescoSegundos * 1000);
    document.addEventListener('visibilitychange', siVisiblePestana);
    return () => {
      cancelado = true;
      window.clearInterval(temporizador);
      document.removeEventListener('visibilitychange', siVisiblePestana);
    };
  }, [cargar, refrescoSegundos, sinImagen, visible, intento]);

  if (sinImagen) {
    return (
      <div ref={contenedor} className="cam-img cam-img--vacia">
        <span>Sin imagen fija</span>
      </div>
    );
  }

  return (
    <div ref={contenedor} className="cam-img">
      {src && <img src={src} alt={alt} className={estado === 'error' ? 'cam-img__obsoleta' : undefined} draggable={false} />}
      {estado === 'cargando' && !src && <span className="cam-img__estado">Cargando…</span>}
      {estado === 'error' && (
        <div className="cam-img__sinsenal" role="status">
          <span>{src ? 'Sin señal · imagen anterior' : 'Sin señal'}</span>
          {reintentable && (
            <button type="button" className="cam-img__reintentar" onClick={() => { setEstado('cargando'); setIntento((n) => n + 1); }}>
              Reintentar
            </button>
          )}
        </div>
      )}
      {estado === 'ok' && capturadaEn && (
        <span className="cam-img__hora" title="Hora de la última captura recibida">
          {capturadaEn.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
