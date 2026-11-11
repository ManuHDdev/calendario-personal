import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProductRepository } from '../db/repository';
import type { FileStore } from '../services/fileStore';
import type { BotFetcher, SyncConfig } from '../services/syncService';
import type { ReadStream, Stats } from 'fs';

export type Hook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** FileStore plus the read side used by the serving routes. */
export interface ServableStore extends FileStore {
  stat(asin: string, filename: string): Promise<Stats>;
  open(asin: string, filename: string, range?: { start: number; end: number }): ReadStream;
}

export interface AppDeps {
  repo: ProductRepository;
  store: ServableStore;
  fetcher: BotFetcher;
  syncConfig: () => SyncConfig;
  auth: {
    /** UI read roles, header only. */
    read: Hook;
    /** UI read roles, header or ?token= (for <img>/<video>). */
    readMedia: Hook;
    /** UI write roles. */
    write: Hook;
    /** Static bearer token for the Claude API. */
    api: Hook;
  };
  logger?: boolean;
}
