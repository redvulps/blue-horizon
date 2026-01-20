use crate::error::AppError;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub type DbState = Arc<SqlitePool>;

pub async fn init_db_state(app: &AppHandle) -> Result<DbState, AppError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InternalError(format!("app data dir not available: {e}")))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| AppError::InternalError(format!("failed to create app data dir: {e}")))?;

    let db_path = data_dir.join("blue-horizon.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let connect_options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| AppError::InternalError(format!("invalid sqlite connection string: {e}")))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePool::connect_with(connect_options)
        .await
        .map_err(|e| AppError::InternalError(format!("failed to connect sqlite: {e}")))?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| AppError::InternalError(format!("failed to run sqlite migrations: {e}")))?;

    Ok(Arc::new(pool))
}
