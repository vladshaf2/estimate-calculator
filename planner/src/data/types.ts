export type Lang = 'en' | 'ru';

export interface Member {
  id: string;
  email: string;
  name_en: string;
  name_ru: string;
  color: string;
  lang: Lang;
  /** Push notification switches per kind; missing = on. */
  notify?: Partial<Record<NotifyKind, boolean>>;
  /** Quiet hours in Prague time (hour 0–23); messages wait until `quiet_to`. */
  quiet_from?: number | null;
  quiet_to?: number | null;
  created_at?: string;
}

export type NotifyKind = 'remind' | 'due' | 'post' | 'assigned' | 'accepted';
export const NOTIFY_KINDS: NotifyKind[] = ['remind', 'due', 'post', 'assigned', 'accepted'];

export interface Workspace {
  id: string;
  key: string | null;
  name_en: string;
  name_ru: string;
  color: string;
  position: number;
  created_at?: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  client: string;
  color: string;
  archived: boolean;
  /** Shown in the Production tab. */
  production?: boolean;
  created_at?: string;
}

export interface Status {
  id: string;
  key: string | null;
  name_en: string;
  name_ru: string;
  color: string;
  position: number;
  is_done: boolean;
  created_at?: string;
}

export interface WorkType {
  id: string;
  key: string | null;
  name_en: string;
  name_ru: string;
  color: string;
  position: number;
  created_at?: string;
}

export interface TaskLink {
  label: string;
  url: string;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export type Platform = 'instagram' | 'tiktok' | 'youtube';

export interface Task {
  id: string;
  title: string;
  notes: string;
  workspace_id: string;
  project_id: string | null;
  status_id: string | null;
  work_type_ids: string[];
  assignee_id: string | null;
  priority: 0 | 1 | 2 | 3;
  due_at: string | null;
  due_all_day: boolean;
  remind_at: string | null;
  platform: Platform | null;
  publish_at: string | null;
  hook: string;
  caption: string;
  links: TaskLink[];
  checklist: CheckItem[];
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/* ---------- Production board ---------- */
export type ProdStatus = 'todo' | 'progress' | 'review' | 'done';
export const PROD_STATUSES: ProdStatus[] = ['todo', 'progress', 'review', 'done'];

export interface ProdScene {
  id: string; project_id: string; position: number; title: string; description: string;
  deleted_at: string | null; created_at?: string; updated_at?: string;
}
/** One line/shot of the script inside a scene. */
export interface ProdBlock {
  id: string; project_id: string; scene_id: string; position: number; text: string; status: ProdStatus; ai_note: string;
  assignee_id: string | null; deleted_at: string | null; created_at?: string; updated_at?: string;
}
export interface ProdVersion {
  id: string; project_id: string; block_id: string; number: number; note: string; created_by?: string; created_at?: string; updated_at?: string;
}
export type MediaKind = 'image' | 'video' | 'link';
export interface ProdMedia {
  id: string; project_id: string; version_id: string; kind: MediaKind;
  /** Storage paths (bucket "prod") for uploads; `url` for links. */
  path: string | null; thumb_path: string | null; url: string | null;
  name: string; mime: string; size: number | null; position: number; deleted_at: string | null;
  created_by?: string; created_at?: string; updated_at?: string;
}
export interface ProdRevision {
  id: string; project_id: string; version_id: string; text: string; image_path: string | null; done: boolean;
  author_id: string | null; task_id: string | null; created_at?: string; updated_at?: string;
}

export interface Tables {
  members: Member;
  workspaces: Workspace;
  projects: Project;
  statuses: Status;
  work_types: WorkType;
  tasks: Task;
  prod_scenes: ProdScene;
  prod_blocks: ProdBlock;
  prod_versions: ProdVersion;
  prod_media: ProdMedia;
  prod_revisions: ProdRevision;
}
export type TableName = keyof Tables;
export const TABLES: TableName[] = ['members', 'workspaces', 'projects', 'statuses', 'work_types', 'tasks', 'prod_scenes', 'prod_blocks', 'prod_versions', 'prod_media', 'prod_revisions'];

/** All data of the team, keyed by id. */
export type Snapshot = { [K in TableName]: Record<string, Tables[K]> };

export function emptySnapshot(): Snapshot {
  return { members: {}, workspaces: {}, projects: {}, statuses: {}, work_types: {}, tasks: {}, prod_scenes: {}, prod_blocks: {}, prod_versions: {}, prod_media: {}, prod_revisions: {} };
}

/** Fields the database manages itself; never sent on insert/update. */
export const SERVER_FIELDS = ['created_at', 'updated_at', 'completed_at', 'created_by'] as const;
