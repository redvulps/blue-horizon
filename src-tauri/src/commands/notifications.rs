use crate::commands::auth::AgentState;
use crate::db::DbState;
use crate::error::AppError;
use crate::session::get_stored_session;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Deserialize, Clone)]
pub struct NotificationInfo {
    pub uri: String,
    pub cid: String,
    pub author: NotificationAuthor,
    pub reason: String,
    pub reason_subject: Option<String>,
    pub is_read: bool,
    pub indexed_at: String,
    pub record: Option<NotificationRecord>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NotificationAuthor {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum NotificationRecord {
    Like(LikeRecord),
    Repost,
    Follow,
    Post(PostRecord),
    Reply(PostRecord),
    Quote(PostRecord),
    Unknown,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LikeRecord {
    // Likes don't usually need content, maybe subject
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PostRecord {
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NotificationsResponse {
    pub notifications: Vec<NotificationInfo>,
    pub cursor: Option<String>,
}

fn current_user_did() -> Result<String, AppError> {
    Ok(get_stored_session()?.did)
}

fn cursor_key(cursor: Option<&str>) -> String {
    cursor.unwrap_or_default().to_string()
}

async fn load_notifications_cache(
    db: &SqlitePool,
    user_did: &str,
    cursor: Option<&str>,
) -> Result<Option<NotificationsResponse>, AppError> {
    let payload = sqlx::query_scalar::<_, String>(
        r#"
        SELECT payload_json
        FROM notifications_cache
        WHERE user_did = ?1 AND cursor_key = ?2
        "#,
    )
    .bind(user_did)
    .bind(cursor_key(cursor))
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::InternalError(format!("notifications cache read failed: {e}")))?;

    payload
        .map(|raw| {
            serde_json::from_str::<NotificationsResponse>(&raw).map_err(|e| {
                AppError::InternalError(format!("notifications cache decode failed: {e}"))
            })
        })
        .transpose()
}

async fn save_notifications_cache(
    db: &SqlitePool,
    user_did: &str,
    cursor: Option<&str>,
    payload: &NotificationsResponse,
) -> Result<(), AppError> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| AppError::InternalError(format!("notifications cache encode failed: {e}")))?;

    sqlx::query(
        r#"
        INSERT INTO notifications_cache (user_did, cursor_key, payload_json, cached_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(user_did, cursor_key) DO UPDATE SET
            payload_json = excluded.payload_json,
            cached_at = excluded.cached_at
        "#,
    )
    .bind(user_did)
    .bind(cursor_key(cursor))
    .bind(payload_json)
    .bind(Utc::now().to_rfc3339())
    .execute(db)
    .await
    .map_err(|e| AppError::InternalError(format!("notifications cache write failed: {e}")))?;

    Ok(())
}

async fn fetch_notifications_remote(
    agent_state: &AgentState,
    cursor: Option<String>,
    limit: Option<u8>,
) -> Result<NotificationsResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit_val = bsky_sdk::api::types::LimitedNonZeroU8::try_from(limit.unwrap_or(25))
        .map_err(|_| AppError::ApiError("Limit must be between 1 and 100".into()))?;

    let response = agent
        .api
        .app
        .bsky
        .notification
        .list_notifications(
            bsky_sdk::api::app::bsky::notification::list_notifications::ParametersData {
                cursor,
                limit: Some(limit_val),
                seen_at: None,
                priority: None,
                reasons: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let notifications = response
        .data
        .notifications
        .iter()
        .map(|n| {
            let author = NotificationAuthor {
                did: n.author.did.to_string(),
                handle: n.author.handle.to_string(),
                display_name: n.author.display_name.clone(),
                avatar: n.author.avatar.clone(),
            };

            let mut record = NotificationRecord::Unknown;

            if n.reason == "like" {
                record = NotificationRecord::Like(LikeRecord {});
            } else if n.reason == "repost" {
                record = NotificationRecord::Repost;
            } else if n.reason == "follow" {
                record = NotificationRecord::Follow;
            } else if n.reason == "reply" || n.reason == "mention" || n.reason == "quote" {
                record = NotificationRecord::Post(PostRecord { text: "".into() });
            }

            NotificationInfo {
                uri: n.uri.clone(),
                cid: n.cid.as_ref().to_string(),
                author,
                reason: n.reason.clone(),
                reason_subject: n.reason_subject.as_ref().map(|s| s.to_string()),
                is_read: n.is_read,
                indexed_at: {
                    use chrono::DateTime;
                    let indexed_at_str = n.indexed_at.as_ref().to_string();
                    if let Ok(dt) = DateTime::parse_from_rfc3339(&indexed_at_str) {
                        dt.to_rfc3339()
                    } else if let Ok(dt) =
                        DateTime::parse_from_str(&indexed_at_str, "%Y-%m-%d %H:%M:%S%.f %z")
                    {
                        dt.to_rfc3339()
                    } else {
                        indexed_at_str
                    }
                },
                record: Some(record),
            }
        })
        .collect();

    Ok(NotificationsResponse {
        notifications,
        cursor: response.data.cursor,
    })
}

/// Get notifications
#[tauri::command]
pub async fn get_notifications(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    db: State<'_, DbState>,
    cursor: Option<String>,
    limit: Option<u8>,
) -> Result<NotificationsResponse, AppError> {
    let user_did = current_user_did()?;
    let db_pool = db.inner().clone();
    let cursor_for_cache = cursor.clone();

    if cursor.is_none() {
        if let Some(cached) = load_notifications_cache(db_pool.as_ref(), &user_did, None).await? {
            let refresh_app = app.clone();
            let refresh_agent_state = agent_state.inner().clone();
            let refresh_db = db_pool.clone();
            let refresh_cursor = cursor.clone();
            let refresh_limit = limit;
            let refresh_user_did = user_did.clone();

            tauri::async_runtime::spawn(async move {
                match fetch_notifications_remote(
                    &refresh_agent_state,
                    refresh_cursor,
                    refresh_limit,
                )
                .await
                {
                    Ok(remote) => {
                        if let Err(err) = save_notifications_cache(
                            refresh_db.as_ref(),
                            &refresh_user_did,
                            None,
                            &remote,
                        )
                        .await
                        {
                            eprintln!("[notifications-cache] refresh save failed: {err}");
                        }
                        if let Err(err) = refresh_app.emit("notifications_updated", &remote) {
                            eprintln!("[notifications-cache] emit refresh failed: {err}");
                        }
                    }
                    Err(err) => {
                        eprintln!("[notifications-cache] refresh fetch failed: {err}");
                    }
                }
            });

            return Ok(cached);
        }
    }

    match fetch_notifications_remote(agent_state.inner(), cursor.clone(), limit).await {
        Ok(remote) => {
            save_notifications_cache(
                db_pool.as_ref(),
                &user_did,
                cursor_for_cache.as_deref(),
                &remote,
            )
            .await?;
            Ok(remote)
        }
        Err(remote_err) => {
            if let Some(cached) =
                load_notifications_cache(db_pool.as_ref(), &user_did, cursor_for_cache.as_deref())
                    .await?
            {
                return Ok(cached);
            }

            Err(remote_err)
        }
    }
}

/// Get unread count
#[tauri::command]
pub async fn get_unread_count(agent_state: State<'_, AgentState>) -> Result<u32, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let response = agent
        .api
        .app
        .bsky
        .notification
        .get_unread_count(
            bsky_sdk::api::app::bsky::notification::get_unread_count::ParametersData {
                seen_at: None,
                priority: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(response.data.count as u32)
}

/// Mark notifications as read (update seen_at)
#[tauri::command]
pub async fn mark_notifications_read(agent_state: State<'_, AgentState>) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    agent
        .api
        .app
        .bsky
        .notification
        .update_seen(
            bsky_sdk::api::app::bsky::notification::update_seen::InputData {
                seen_at: bsky_sdk::api::types::string::Datetime::now(),
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}
