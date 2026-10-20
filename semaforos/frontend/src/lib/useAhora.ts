import { useEffect, useState } from 'react';

/** Reloj que avanza cada `ms`; hace avanzar las cuentas atras sin pedir nada al servidor. */
export function useAhora(ms = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return ahora;
}
