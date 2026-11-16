export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { "X-Minerva": "1" }, credentials: "same-origin" };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const r = await fetch(url, init);
  const data = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
  if (!r.ok) throw new ApiError(r.status, data?.error ?? r.statusText);
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>("GET", url),
  post: <T>(url: string, body?: unknown) => call<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => call<T>("PUT", url, body ?? {}),
  del: <T>(url: string) => call<T>("DELETE", url),
};

export interface Me {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  is_admin: boolean;
  auth_source: string;
  prefs: Prefs;
}

export interface Prefs {
  theme?: string;
  width?: "narrow" | "standard" | "wide" | "full";
  density?: "compact" | "comfortable" | "spacious";
  editorMode?: "visual" | "markdown";
}

export interface Meta {
  siteName: string;
  version: string;
  providers: { id: string; type: "password" | "redirect"; label: string; loginPath?: string }[];
}

export interface Space {
  id: number;
  key: string;
  name: string;
  description: string;
  color: string;
  home_page_id: number | null;
  page_count?: number;
  updated_at?: string;
}

export interface TreeNode {
  id: number;
  parent_id: number | null;
  title: string;
  position: number;
}

export interface Page {
  id: number;
  space_id: number;
  space_key: string;
  space_name: string;
  parent_id: number | null;
  title: string;
  body: unknown | null;
  body_md: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  ancestors: { id: number; title: string }[];
  children: { id: number; title: string }[];
}

export const pageUrl = (spaceKey: string, id: number) => `/s/${spaceKey}/p/${id}`;

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}
