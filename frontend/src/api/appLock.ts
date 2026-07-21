import { buildApiUrl, parseJsonResponse } from "./client";

export type AppLockStatus = { enabled: boolean; unlocked: boolean; message?: string };

async function request(path: string, body?: Record<string, string>): Promise<AppLockStatus> {
  const response = await fetch(await buildApiUrl(`/api/app-lock${path}`), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseJsonResponse<AppLockStatus>(response);
}

export const getAppLockStatus = () => request("/status");
export const enableAppLock = (password: string, confirmPassword: string) => request("/enable", { password, confirm_password: confirmPassword });
export const unlockApp = (password: string) => request("/unlock", { password });
export const changeAppLockPassword = (currentPassword: string, newPassword: string, confirmPassword: string) => request("/change-password", { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword });
export const disableAppLock = (currentPassword: string) => request("/disable", { current_password: currentPassword });
export const lockApp = () => request("/lock", {});
