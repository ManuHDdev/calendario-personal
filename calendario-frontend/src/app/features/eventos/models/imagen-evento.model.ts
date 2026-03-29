export interface ImagenEvento {
  id: number;
  url: string;
  nombreFichero: string;
  tipo: 'imagen' | 'pdf';
  createdAt: string;
}
