export interface FileItem {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  createdAt: string;
  folder: string | null;
}

export interface Folder {
  name: string;
  fileCount: number;
}
