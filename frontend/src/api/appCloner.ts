import { buildApiUrl, parseJsonResponse } from "./client";

export type AppCloneStatus = {
  running: boolean;
  status: string;
  message: string;
  repo_url: string | null;
  destination_parent: string | null;
  clone_path: string | null;
  started_at: string | null;
  finished_at: string | null;
  git_exit_code: number | null;
  npm_start_pid: number | null;
  log_path: string;
  last_lines: string[];
};

export type AppCloneDefaults = {
  repo_url: string | null;
};

export type AppCloneRequest = {
  repo_url: string;
  destination_parent: string;
  directory_name?: string | null;
  run_npm_start: boolean;
};

export async function getAppCloneDefaults() {
  const response = await fetch(await buildApiUrl("/api/app-cloner/defaults"));
  return parseJsonResponse<AppCloneDefaults>(response);
}

export async function getAppCloneStatus() {
  const response = await fetch(await buildApiUrl("/api/app-cloner/status"));
  return parseJsonResponse<AppCloneStatus>(response);
}

export async function cloneApp(payload: AppCloneRequest) {
  const response = await fetch(await buildApiUrl("/api/app-cloner/clone"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<AppCloneStatus>(response);
}
