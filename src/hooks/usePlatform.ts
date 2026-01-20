import { platform, type Platform } from "@tauri-apps/plugin-os";

const MOBILE_PLATFORMS = new Set<Platform>(["android", "ios"]);

export function usePlatform(): Platform {
  return platform();
}

export function useIsPlatform(target: Platform): boolean {
  return usePlatform() === target;
}

export function useIsDesktopPlatform(): boolean {
  return !MOBILE_PLATFORMS.has(usePlatform());
}

export function useIsMobilePlatform(): boolean {
  return MOBILE_PLATFORMS.has(usePlatform());
}

export function useIsWindowsPlatform(): boolean {
  return useIsPlatform("windows");
}

export function useIsMacPlatform(): boolean {
  return useIsPlatform("macos");
}

export function useIsLinuxPlatform(): boolean {
  return useIsPlatform("linux");
}

export function useIsAndroidPlatform(): boolean {
  return useIsPlatform("android");
}

export function useIsIosPlatform(): boolean {
  return useIsPlatform("ios");
}
