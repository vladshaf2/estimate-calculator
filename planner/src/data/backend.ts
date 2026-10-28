import type { Snapshot, TableName, Tables } from './types';

export type ChangeType = 'upsert' | 'delete';
export type ChangeHandler = <K extends TableName>(table: K, type: ChangeType, row: Partial<Tables[K]> & { id: string }) => void;

/**
 * Everything the UI needs from storage. Two implementations:
 * Supabase (real, shared, realtime) and Demo (this browser only, for trying things out and for tests).
 */
export interface Backend {
  kind: 'supabase' | 'demo';
  /** Email of the signed-in user, or null. */
  getSessionEmail(): Promise<string | null>;
  onAuthChange(cb: (email: string | null) => void): () => void;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  loadAll(): Promise<Snapshot>;
  /** Live changes from the other user (and echoes of our own). `onReconnect` should trigger a full reload. */
  subscribe(onChange: ChangeHandler, onReconnect: () => void): () => void;
  insert<K extends TableName>(table: K, row: Partial<Tables[K]> & { id: string }): Promise<Tables[K]>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>;
  remove(table: TableName, id: string): Promise<void>;
  /** Web Push (Supabase only). */
  push?: PushApi;
  /** Files of the production board (private bucket). */
  files: FilesApi;
}

export interface FilesApi {
  upload(path: string, file: Blob, contentType: string): Promise<void>;
  /** Short-lived URLs to show files, by path. Missing paths are left out. */
  urls(paths: string[]): Promise<Record<string, string>>;
  remove(paths: string[]): Promise<void>;
}

export interface PushApi {
  /** VAPID public key (base64url), or null before the server is initialised. */
  publicKey(): Promise<string | null>;
  save(sub: PushSubscriptionJSON): Promise<void>;
  /** Queue a test notification to all of my devices. */
  test(): Promise<void>;
}
