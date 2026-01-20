import { invoke } from "@tauri-apps/api/core";

export interface LoginRequest {
  identifier: string;
  password: string;
  service?: string;
}

export interface LoginResponse {
  did: string;
  handle: string;
  service: string;
}

export interface SessionInfo {
  did: string;
  handle: string;
  service_url: string;
  is_authenticated: boolean;
}

export interface AppError {
  code: string;
  message: string;
}

/**
 * Login to Bluesky/AT Protocol
 */
export async function login(request: LoginRequest): Promise<LoginResponse> {
  return invoke<LoginResponse>("login", { request });
}

/**
 * Logout and clear session
 */
export async function logout(): Promise<void> {
  return invoke<void>("logout");
}

/**
 * Get current session info (if any)
 */
export async function getSession(): Promise<SessionInfo | null> {
  return invoke<SessionInfo | null>("get_session");
}

/**
 * Resume session from stored credentials
 */
export async function resumeSession(): Promise<SessionInfo> {
  return invoke<SessionInfo>("resume_session");
}
