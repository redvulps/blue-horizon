import { invoke } from "@tauri-apps/api/core";

/** Minimize the application window */
export async function minimizeWindow(): Promise<void> {
  await invoke("minimize_window");
}

/** Toggle maximize/restore the application window */
export async function maximizeWindow(): Promise<void> {
  await invoke("maximize_window");
}

/** Close the application window */
export async function closeWindow(): Promise<void> {
  await invoke("close_window");
}

/** Check if window is currently maximized */
export async function isMaximized(): Promise<boolean> {
  return await invoke("is_maximized");
}
