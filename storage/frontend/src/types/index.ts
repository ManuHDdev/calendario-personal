export interface FileItem {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  createdAt: string;
  folder: string | null;
  /** Ausente si el archivo es anterior a la función de permisos (legado, visible para todos) */
  ownerId?: string;
  ownerUsername?: string;
}

export interface Folder {
  name: string;
  fileCount: number;
}

export interface FolderEntry {
  path: string;
  /** Ausente si la carpeta es anterior a la función de permisos (legado, visible para todos) */
  ownerId?: string;
  ownerUsername?: string;
}

export interface AppUser {
  id: string;
  username: string;
}

export type PermissionsResourceType = 'file' | 'folder';
