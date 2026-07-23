import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const BASE_PATH = path.resolve(process.env.STORAGE_PATH || '/mnt/storage-ssd');
const META_DIR = path.join(BASE_PATH, '.meta');
const DB_PATH = path.join(META_DIR, 'storage.db');

export type ResourceType = 'file' | 'folder';

export interface OwnerRow {
  path: string;
  owner_id: string;
  owner_username: string;
  created_at: string;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(META_DIR)) {
    fs.mkdirSync(META_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_meta (
      path TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_username TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folder_meta (
      path TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_username TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type TEXT NOT NULL CHECK(resource_type IN ('file', 'folder')),
      resource_path TEXT NOT NULL,
      grantee_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(resource_type, resource_path, grantee_id)
    );

    CREATE INDEX IF NOT EXISTS idx_grants_lookup ON grants(resource_type, resource_path);
    CREATE INDEX IF NOT EXISTS idx_grants_grantee ON grants(grantee_id);
  `);

  return db;
}

/** Cierra la conexión (uso en tests, para poder limpiar el fichero en disco). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Ownership ─────────────────────────────────────────────────────────────

export function getOwner(type: ResourceType, relativePath: string): OwnerRow | undefined {
  const table = type === 'file' ? 'file_meta' : 'folder_meta';
  return getDb()
    .prepare(`SELECT * FROM ${table} WHERE path = ?`)
    .get(relativePath) as OwnerRow | undefined;
}

export function setOwner(
  type: ResourceType,
  relativePath: string,
  ownerId: string,
  ownerUsername: string,
): void {
  const table = type === 'file' ? 'file_meta' : 'folder_meta';
  getDb()
    .prepare(
      `INSERT INTO ${table} (path, owner_id, owner_username, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET owner_id = excluded.owner_id, owner_username = excluded.owner_username`,
    )
    .run(relativePath, ownerId, ownerUsername, new Date().toISOString());
}

export function deleteOwner(type: ResourceType, relativePath: string): void {
  const table = type === 'file' ? 'file_meta' : 'folder_meta';
  getDb().prepare(`DELETE FROM ${table} WHERE path = ?`).run(relativePath);
}

export function updateResourcePath(
  type: ResourceType,
  oldPath: string,
  newPath: string,
): void {
  const table = type === 'file' ? 'file_meta' : 'folder_meta';
  getDb().prepare(`UPDATE ${table} SET path = ? WHERE path = ?`).run(newPath, oldPath);
  getDb()
    .prepare(`UPDATE grants SET resource_path = ? WHERE resource_type = ? AND resource_path = ?`)
    .run(newPath, type, oldPath);
}

/**
 * Reescribe el prefijo de ruta de todo lo que cuelgue de oldPrefix (el propio
 * recurso y todos sus descendientes) tras un rename/move de carpeta que
 * arrastra el subárbol completo en disco.
 */
export function renamePathPrefix(oldPrefix: string, newPrefix: string): void {
  const database = getDb();
  const rewrite = (table: 'file_meta' | 'folder_meta' | 'grants', column: string) => {
    const rows = database
      .prepare(`SELECT rowid AS rid, ${column} AS p FROM ${table} WHERE ${column} = ? OR ${column} LIKE ?`)
      .all(oldPrefix, `${oldPrefix}/%`) as { rid: number; p: string }[];
    const stmt = database.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
    for (const row of rows) {
      const rewritten = row.p === oldPrefix ? newPrefix : newPrefix + row.p.slice(oldPrefix.length);
      stmt.run(rewritten, row.rid);
    }
  };
  rewrite('file_meta', 'path');
  rewrite('folder_meta', 'path');
  rewrite('grants', 'resource_path');
}

// ── Grants ────────────────────────────────────────────────────────────────

export function getGrantees(type: ResourceType, relativePath: string): string[] {
  const rows = getDb()
    .prepare(`SELECT grantee_id FROM grants WHERE resource_type = ? AND resource_path = ?`)
    .all(type, relativePath) as { grantee_id: string }[];
  return rows.map((r) => r.grantee_id);
}

export function setGrantees(
  type: ResourceType,
  relativePath: string,
  granteeIds: string[],
  grantedBy: string,
): void {
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(`DELETE FROM grants WHERE resource_type = ? AND resource_path = ?`)
      .run(type, relativePath);
    const insert = database.prepare(
      `INSERT INTO grants (resource_type, resource_path, grantee_id, granted_by, created_at) VALUES (?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    for (const granteeId of granteeIds) {
      insert.run(type, relativePath, granteeId, grantedBy, now);
    }
  });
  tx();
}

export function deleteGrants(type: ResourceType, relativePath: string): void {
  getDb()
    .prepare(`DELETE FROM grants WHERE resource_type = ? AND resource_path = ?`)
    .run(type, relativePath);
}

/** ¿Existe un grant directo hacia userSub sobre este recurso exacto? */
export function hasDirectGrant(type: ResourceType, relativePath: string, userSub: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM grants WHERE resource_type = ? AND resource_path = ? AND grantee_id = ? LIMIT 1`,
    )
    .get(type, relativePath, userSub);
  return row !== undefined;
}

/** ¿Existe un grant de carpeta hacia userSub sobre alguna de estas rutas (ancestros incluidos)? */
export function hasFolderGrantOnAny(folderPaths: string[], userSub: string): boolean {
  if (folderPaths.length === 0) return false;
  const placeholders = folderPaths.map(() => '?').join(',');
  const row = getDb()
    .prepare(
      `SELECT 1 FROM grants WHERE resource_type = 'folder' AND grantee_id = ? AND resource_path IN (${placeholders}) LIMIT 1`,
    )
    .get(userSub, ...folderPaths);
  return row !== undefined;
}
