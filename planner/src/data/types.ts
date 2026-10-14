export type Lang = 'en' | 'ru';

export interface Member {
  id: string;
  email: string;
  name_en: string;
  name_ru: string;
  color: string;
  lang: Lang;
  created_at?: string;
}

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

export interface Tables {
  members: Member;
  workspaces: Workspace;
  projects: Project;
  statuses: Status;
  work_types: WorkType;
  tasks: Task;
}
export type TableName = keyof Tables;
export const TABLES: TableName[] = ['members', 'workspaces', 'projects', 'statuses', 'work_types', 'tasks'];

/** All data of the team, keyed by id. */
export type Snapshot = { [K in TableName]: Record<string, Tables[K]> };

export function emptySnapshot(): Snapshot {
  return { members: {}, workspaces: {}, projects: {}, statuses: {}, work_types: {}, tasks: {} };
}

/** Fields the database manages itself; never sent on insert/update. */
export const SERVER_FIELDS = ['created_at', 'updated_at', 'completed_at', 'created_by'] as const;
