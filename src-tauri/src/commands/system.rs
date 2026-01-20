use tauri::{AppHandle, Manager, Theme};

#[tauri::command]
pub async fn get_system_theme(app: AppHandle) -> String {
    let window = app.get_webview_window("main");
    if let Some(window) = window {
        match window.theme() {
            Ok(theme) => match theme {
                Theme::Dark => "dark".to_string(),
                Theme::Light => "light".to_string(),
                _ => "light".to_string(), // Default fallback
            },
            Err(_) => "light".to_string(),
        }
    } else {
        "light".to_string()
    }
}
