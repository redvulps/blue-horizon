use crate::error::AppError;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn minimize_window(app: AppHandle) -> Result<(), AppError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::InternalError("Main window not found".to_string()))?;

    window
        .minimize()
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn maximize_window(app: AppHandle) -> Result<(), AppError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::InternalError("Main window not found".to_string()))?;

    if window.is_maximized().unwrap_or(false) {
        window
            .unmaximize()
            .map_err(|e| AppError::InternalError(e.to_string()))?;
    } else {
        window
            .maximize()
            .map_err(|e| AppError::InternalError(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_window(app: AppHandle) -> Result<(), AppError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::InternalError("Main window not found".to_string()))?;

    window
        .close()
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn is_maximized(app: AppHandle) -> Result<bool, AppError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::InternalError("Main window not found".to_string()))?;

    window
        .is_maximized()
        .map_err(|e| AppError::InternalError(e.to_string()))
}
