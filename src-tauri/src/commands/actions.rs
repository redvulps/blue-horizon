use crate::commands::auth::AgentState;
use crate::db::DbState;
use crate::error::AppError;
use crate::session::get_stored_session;
use crate::session_store::KeyringSessionStore;
use bsky_sdk::api::app::bsky::feed::like::RecordData as LikeRecordData;
use bsky_sdk::api::app::bsky::feed::repost::RecordData as RepostRecordData;
use bsky_sdk::api::com::atproto::repo::create_record;
use bsky_sdk::api::com::atproto::repo::delete_record;
use bsky_sdk::api::com::atproto::repo::strong_ref;
use bsky_sdk::api::types::string::{AtIdentifier, Did, RecordKey};
use bsky_sdk::api::types::TryIntoUnknown;
use bsky_sdk::BskyAgent;
use chrono::{Duration, Utc};
use ipld_core::ipld::Ipld;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

type AppAgent = BskyAgent<atrium_xrpc_client::reqwest::ReqwestClient, KeyringSessionStore>;

fn parse_rkey_from_uri(uri: &str) -> Result<String, AppError> {
    // at://did:example/app.bsky.feed.like/<rkey>
    uri.split('/')
        .last()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::ApiError("Invalid record URI".into()))
}

fn current_repo_did() -> Result<Did, AppError> {
    let stored = get_stored_session()?;
    stored
        .did
        .parse()
        .map_err(|_| AppError::ApiError("Invalid stored DID".into()))
}

/// Like a post (creates app.bsky.feed.like record)
#[tauri::command]
pub async fn like_post(
    agent_state: State<'_, AgentState>,
    uri: String,
    cid: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let record_data = LikeRecordData {
        created_at: bsky_sdk::api::types::string::Datetime::now(),
        subject: strong_ref::Main {
            data: strong_ref::MainData {
                uri: uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid post URI".into()))?,
                cid: cid
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid post CID".into()))?,
            },
            extra_data: Ipld::Null,
        },
        via: None,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.feed.like"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid like NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Unlike a post (deletes the like record)
#[tauri::command]
pub async fn unlike_post(
    agent_state: State<'_, AgentState>,
    like_uri: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let rkey_str = parse_rkey_from_uri(&like_uri)?;
    let rkey = RecordKey::from_str(&rkey_str)
        .map_err(|_| AppError::ApiError("Invalid record key".into()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .delete_record(
            delete_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.feed.like"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid like NSID".into()))?,
                rkey,
                swap_record: None,
                swap_commit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Repost a post (creates app.bsky.feed.repost record)
#[tauri::command]
pub async fn repost_post(
    agent_state: State<'_, AgentState>,
    uri: String,
    cid: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let record_data = RepostRecordData {
        created_at: bsky_sdk::api::types::string::Datetime::now(),
        subject: strong_ref::Main {
            data: strong_ref::MainData {
                uri: uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid post URI".into()))?,
                cid: cid
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid post CID".into()))?,
            },
            extra_data: Ipld::Null,
        },
        via: None,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.feed.repost"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid repost NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Unrepost a post (deletes the repost record)
#[tauri::command]
pub async fn unrepost_post(
    agent_state: State<'_, AgentState>,
    repost_uri: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let rkey_str = parse_rkey_from_uri(&repost_uri)?;
    let rkey = RecordKey::from_str(&rkey_str)
        .map_err(|_| AppError::ApiError("Invalid record key".into()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .delete_record(
            delete_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.feed.repost"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid repost NSID".into()))?,
                rkey,
                swap_record: None,
                swap_commit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

#[derive(Deserialize, Serialize, Clone)]
pub struct ImageInput {
    pub path: String,
    pub alt: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct CreatePostPayload {
    pub text: String,
    pub reply_to: Option<String>,
    pub quote_uri: Option<String>,
    pub quote_cid: Option<String>,
    pub images: Vec<ImageInput>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PostDraft {
    pub text: String,
    pub reply_to: Option<String>,
    pub quote_uri: Option<String>,
    pub quote_cid: Option<String>,
    pub images: Vec<ImageInput>,
    pub updated_at: String,
}

#[derive(Serialize, Clone)]
pub struct RetryQueueEvent {
    pub id: String,
}

fn draft_key(reply_to: Option<&str>, quote_uri: Option<&str>) -> String {
    if let Some(reply) = reply_to {
        return format!("reply:{reply}");
    }
    if let Some(quote) = quote_uri {
        return format!("quote:{quote}");
    }
    "post:new".to_string()
}

fn should_enqueue_retry(error: &AppError) -> bool {
    matches!(
        error,
        AppError::SessionNotFound | AppError::NetworkError(_) | AppError::ApiError(_)
    )
}

fn compute_next_retry_at(attempts: i64) -> String {
    let capped_attempts = attempts.clamp(1, 8);
    let backoff_secs = 15_i64 * 2_i64.pow(capped_attempts as u32);
    (Utc::now() + Duration::seconds(backoff_secs.min(1800))).to_rfc3339()
}

async fn save_draft_payload(
    db: &SqlitePool,
    reply_to: Option<&str>,
    quote_uri: Option<&str>,
    payload: &CreatePostPayload,
) -> Result<(), AppError> {
    let key = draft_key(reply_to, quote_uri);
    let now = Utc::now().to_rfc3339();
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| AppError::InternalError(format!("draft encode failed: {e}")))?;

    sqlx::query(
        r#"
        INSERT INTO post_drafts (draft_key, payload_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(draft_key) DO UPDATE SET
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(key)
    .bind(payload_json)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|e| AppError::InternalError(format!("draft save failed: {e}")))?;

    Ok(())
}

async fn load_draft_payload(
    db: &SqlitePool,
    reply_to: Option<&str>,
    quote_uri: Option<&str>,
) -> Result<Option<PostDraft>, AppError> {
    let key = draft_key(reply_to, quote_uri);

    let row = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT payload_json, updated_at
        FROM post_drafts
        WHERE draft_key = ?1
        "#,
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::InternalError(format!("draft load failed: {e}")))?;

    row.map(|(payload_json, updated_at)| {
        let payload = serde_json::from_str::<CreatePostPayload>(&payload_json)
            .map_err(|e| AppError::InternalError(format!("draft decode failed: {e}")))?;

        Ok(PostDraft {
            text: payload.text,
            reply_to: payload.reply_to,
            quote_uri: payload.quote_uri,
            quote_cid: payload.quote_cid,
            images: payload.images,
            updated_at,
        })
    })
    .transpose()
}

async fn clear_draft_payload(
    db: &SqlitePool,
    reply_to: Option<&str>,
    quote_uri: Option<&str>,
) -> Result<(), AppError> {
    let key = draft_key(reply_to, quote_uri);

    sqlx::query(
        r#"
        DELETE FROM post_drafts
        WHERE draft_key = ?1
        "#,
    )
    .bind(key)
    .execute(db)
    .await
    .map_err(|e| AppError::InternalError(format!("draft clear failed: {e}")))?;

    Ok(())
}

async fn enqueue_post_retry(
    db: &SqlitePool,
    user_did: &str,
    payload: &CreatePostPayload,
    error: &AppError,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| AppError::InternalError(format!("retry payload encode failed: {e}")))?;
    let next_retry_at = now.clone();

    sqlx::query(
        r#"
        INSERT INTO post_retry_queue (
            id, user_did, payload_json, status, attempts, next_retry_at,
            last_error, created_at, updated_at, sent_at
        )
        VALUES (?1, ?2, ?3, 'queued', 1, ?4, ?5, ?6, ?7, NULL)
        "#,
    )
    .bind(&id)
    .bind(user_did)
    .bind(payload_json)
    .bind(next_retry_at)
    .bind(error.to_string())
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|e| AppError::InternalError(format!("enqueue retry failed: {e}")))?;

    Ok(id)
}

/// Create a new post
async fn send_post_via_agent(
    agent: &AppAgent,
    did: &Did,
    payload: &CreatePostPayload,
) -> Result<(), AppError> {
    use bsky_sdk::api::app::bsky::embed::images::{
        Image, ImageData, Main as ImagesMain, MainData as ImagesMainData,
    };
    use bsky_sdk::api::app::bsky::embed::record::{Main as RecordMain, MainData as RecordMainData};
    use bsky_sdk::api::app::bsky::embed::record_with_media::{
        Main as RecordWithMediaMain, MainData as RecordWithMediaMainData,
    };
    use bsky_sdk::api::app::bsky::feed::post::{
        Record as PostRecord, RecordEmbedRefs, ReplyRef, ReplyRefData,
    };
    use bsky_sdk::api::types::Union;

    let mut image_blobs = Vec::new();
    for img in &payload.images {
        let path = std::path::PathBuf::from(&img.path);
        if !path.exists() {
            continue;
        }

        let bytes = std::fs::read(&path)
            .map_err(|e| AppError::InternalError(format!("Failed to read image: {e}")))?;

        let upload = agent
            .api
            .com
            .atproto
            .repo
            .upload_blob(bytes.to_vec())
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to upload blob: {e}")))?;

        image_blobs.push(Image {
            data: ImageData {
                alt: img.alt.clone(),
                image: upload.data.blob,
                aspect_ratio: None,
            },
            extra_data: Ipld::Null,
        });
    }

    let quote_embed = if let (Some(q_uri), Some(q_cid)) =
        (payload.quote_uri.clone(), payload.quote_cid.clone())
    {
        if let Ok(cid) = q_cid.parse() {
            Some(RecordMain {
                data: RecordMainData {
                    record: strong_ref::Main {
                        data: strong_ref::MainData { uri: q_uri, cid },
                        extra_data: Ipld::Null,
                    },
                },
                extra_data: Ipld::Null,
            })
        } else {
            None
        }
    } else {
        None
    };

    let images_embed = if !image_blobs.is_empty() {
        Some(ImagesMain {
            data: ImagesMainData {
                images: image_blobs,
            },
            extra_data: Ipld::Null,
        })
    } else {
        None
    };

    let embed = match (images_embed, quote_embed) {
        (Some(imgs), Some(quote)) => Some(Union::Refs(
            RecordEmbedRefs::AppBskyEmbedRecordWithMediaMain(Box::new(RecordWithMediaMain {
                data: RecordWithMediaMainData {
                    media: Union::Refs(
                        bsky_sdk::api::app::bsky::embed::record_with_media::MainMediaRefs::AppBskyEmbedImagesMain(
                            Box::new(imgs),
                        ),
                    ),
                    record: quote,
                },
                extra_data: Ipld::Null,
            })),
        )),
        (Some(imgs), None) => Some(Union::Refs(RecordEmbedRefs::AppBskyEmbedImagesMain(
            Box::new(imgs),
        ))),
        (None, Some(quote)) => Some(Union::Refs(RecordEmbedRefs::AppBskyEmbedRecordMain(
            Box::new(quote),
        ))),
        (None, None) => None,
    };

    let reply = if let Some(reply_uri) = payload.reply_to.clone() {
        let post_res = agent
            .api
            .app
            .bsky
            .feed
            .get_posts(
                bsky_sdk::api::app::bsky::feed::get_posts::ParametersData {
                    uris: vec![reply_uri.clone()],
                }
                .into(),
            )
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to fetch reply parent: {e}")))?;

        if let Some(parent_post) = post_res.data.posts.first() {
            let parent_uri = parent_post.uri.clone();
            let parent_cid = parent_post.cid.clone();

            let root = if let Ok(record) = serde_json::from_value::<PostRecord>(
                serde_json::to_value(&parent_post.record).unwrap_or(serde_json::Value::Null),
            ) {
                if let Some(reply_ref) = &record.reply {
                    reply_ref.data.root.clone()
                } else {
                    strong_ref::Main {
                        data: strong_ref::MainData {
                            uri: parent_uri.clone(),
                            cid: parent_cid.clone(),
                        },
                        extra_data: Ipld::Null,
                    }
                }
            } else {
                strong_ref::Main {
                    data: strong_ref::MainData {
                        uri: parent_uri.clone(),
                        cid: parent_cid.clone(),
                    },
                    extra_data: Ipld::Null,
                }
            };

            let parent = strong_ref::Main {
                data: strong_ref::MainData {
                    uri: parent_uri,
                    cid: parent_cid,
                },
                extra_data: Ipld::Null,
            };

            Some(ReplyRef {
                data: ReplyRefData { root, parent },
                extra_data: Ipld::Null,
            })
        } else {
            None
        }
    } else {
        None
    };

    let record_data = bsky_sdk::api::app::bsky::feed::post::RecordData {
        created_at: bsky_sdk::api::types::string::Datetime::now(),
        text: payload.text.clone(),
        embed,
        entities: None,
        facets: None,
        labels: None,
        langs: None,
        reply,
        tags: None,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(did.clone()),
                collection: "app.bsky.feed.post"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid post NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub async fn create_post(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    db: State<'_, DbState>,
    text: String,
    reply_to: Option<String>,
    quote_uri: Option<String>,
    quote_cid: Option<String>,
    images: Vec<ImageInput>,
) -> Result<(), AppError> {
    let did = current_repo_did()?;
    let db_pool = db.inner().clone();
    let payload = CreatePostPayload {
        text,
        reply_to,
        quote_uri,
        quote_cid,
        images,
    };

    let send_result = {
        let guard = agent_state.lock().await;
        let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;
        send_post_via_agent(agent, &did, &payload).await
    };

    match send_result {
        Ok(()) => {
            if let Err(err) = clear_draft_payload(
                db_pool.as_ref(),
                payload.reply_to.as_deref(),
                payload.quote_uri.as_deref(),
            )
            .await
            {
                eprintln!("[drafts] failed to clear after send: {err}");
            }
            Ok(())
        }
        Err(err) => {
            if !should_enqueue_retry(&err) {
                return Err(err);
            }

            let retry_id =
                enqueue_post_retry(db_pool.as_ref(), &did.to_string(), &payload, &err).await?;

            if let Err(emit_err) = app.emit("post_retry_queued", RetryQueueEvent { id: retry_id }) {
                eprintln!("[retry-queue] emit queue event failed: {emit_err}");
            }

            if let Err(clear_err) = clear_draft_payload(
                db_pool.as_ref(),
                payload.reply_to.as_deref(),
                payload.quote_uri.as_deref(),
            )
            .await
            {
                eprintln!("[drafts] failed to clear queued draft: {clear_err}");
            }

            Ok(())
        }
    }
}

#[tauri::command]
pub async fn save_post_draft(
    db: State<'_, DbState>,
    text: String,
    reply_to: Option<String>,
    quote_uri: Option<String>,
    quote_cid: Option<String>,
    images: Vec<ImageInput>,
) -> Result<(), AppError> {
    let db_pool = db.inner().clone();

    let is_empty = text.trim().is_empty() && images.is_empty();
    if is_empty {
        return clear_draft_payload(db_pool.as_ref(), reply_to.as_deref(), quote_uri.as_deref())
            .await;
    }

    let payload = CreatePostPayload {
        text,
        reply_to,
        quote_uri,
        quote_cid,
        images,
    };

    save_draft_payload(
        db_pool.as_ref(),
        payload.reply_to.as_deref(),
        payload.quote_uri.as_deref(),
        &payload,
    )
    .await
}

#[tauri::command]
pub async fn get_post_draft(
    db: State<'_, DbState>,
    reply_to: Option<String>,
    quote_uri: Option<String>,
) -> Result<Option<PostDraft>, AppError> {
    let db_pool = db.inner().clone();
    load_draft_payload(db_pool.as_ref(), reply_to.as_deref(), quote_uri.as_deref()).await
}

#[tauri::command]
pub async fn clear_post_draft(
    db: State<'_, DbState>,
    reply_to: Option<String>,
    quote_uri: Option<String>,
) -> Result<(), AppError> {
    let db_pool = db.inner().clone();
    clear_draft_payload(db_pool.as_ref(), reply_to.as_deref(), quote_uri.as_deref()).await
}

pub async fn retry_queued_posts(
    app: AppHandle,
    agent_state: AgentState,
    db: DbState,
) -> Result<(), AppError> {
    let did = match current_repo_did() {
        Ok(value) => value,
        Err(AppError::SessionNotFound) => return Ok(()),
        Err(_) => return Ok(()),
    };
    let did_str = did.to_string();
    let now = Utc::now().to_rfc3339();

    let queued_rows = sqlx::query_as::<_, (String, String, i64)>(
        r#"
        SELECT id, payload_json, attempts
        FROM post_retry_queue
        WHERE user_did = ?1
          AND status IN ('queued', 'retrying')
          AND next_retry_at <= ?2
        ORDER BY created_at ASC
        LIMIT 10
        "#,
    )
    .bind(&did_str)
    .bind(&now)
    .fetch_all(db.as_ref())
    .await
    .map_err(|e| AppError::InternalError(format!("retry queue read failed: {e}")))?;

    if queued_rows.is_empty() {
        return Ok(());
    }

    let guard = agent_state.lock().await;
    let agent = match guard.as_ref() {
        Some(value) => value,
        None => return Ok(()),
    };

    for (id, payload_json, attempts) in queued_rows {
        let payload = match serde_json::from_str::<CreatePostPayload>(&payload_json) {
            Ok(value) => value,
            Err(err) => {
                let updated_at = Utc::now().to_rfc3339();
                sqlx::query(
                    r#"
                    UPDATE post_retry_queue
                    SET status = 'failed',
                        attempts = ?2,
                        last_error = ?3,
                        updated_at = ?4
                    WHERE id = ?1
                    "#,
                )
                .bind(&id)
                .bind(attempts + 1)
                .bind(format!("Invalid retry payload: {err}"))
                .bind(updated_at)
                .execute(db.as_ref())
                .await
                .map_err(|e| AppError::InternalError(format!("retry queue update failed: {e}")))?;
                continue;
            }
        };

        sqlx::query(
            r#"
            UPDATE post_retry_queue
            SET status = 'retrying',
                updated_at = ?2
            WHERE id = ?1
            "#,
        )
        .bind(&id)
        .bind(Utc::now().to_rfc3339())
        .execute(db.as_ref())
        .await
        .map_err(|e| AppError::InternalError(format!("retry queue update failed: {e}")))?;

        match send_post_via_agent(agent, &did, &payload).await {
            Ok(()) => {
                let sent_at = Utc::now().to_rfc3339();
                sqlx::query(
                    r#"
                    UPDATE post_retry_queue
                    SET status = 'sent',
                        sent_at = ?2,
                        updated_at = ?2
                    WHERE id = ?1
                    "#,
                )
                .bind(&id)
                .bind(&sent_at)
                .execute(db.as_ref())
                .await
                .map_err(|e| AppError::InternalError(format!("retry queue update failed: {e}")))?;

                let _ = app.emit("post_retry_sent", RetryQueueEvent { id: id.clone() });
            }
            Err(err) => {
                let next_attempts = attempts + 1;
                let status = if next_attempts >= 8 {
                    "failed"
                } else {
                    "queued"
                };
                let next_retry = if status == "queued" {
                    compute_next_retry_at(next_attempts)
                } else {
                    // Keep timestamp valid even when terminally failed.
                    Utc::now().to_rfc3339()
                };

                sqlx::query(
                    r#"
                    UPDATE post_retry_queue
                    SET status = ?2,
                        attempts = ?3,
                        next_retry_at = ?4,
                        last_error = ?5,
                        updated_at = ?6
                    WHERE id = ?1
                    "#,
                )
                .bind(&id)
                .bind(status)
                .bind(next_attempts)
                .bind(next_retry)
                .bind(err.to_string())
                .bind(Utc::now().to_rfc3339())
                .execute(db.as_ref())
                .await
                .map_err(|e| AppError::InternalError(format!("retry queue update failed: {e}")))?;
            }
        }
    }

    Ok(())
}

pub fn trigger_retry_now(app: AppHandle, agent_state: AgentState, db: DbState) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = retry_queued_posts(app, agent_state, db).await {
            eprintln!("[retry-queue] immediate retry failed: {err}");
        }
    });
}

/// Follow a user (creates app.bsky.graph.follow record)
#[tauri::command]
pub async fn follow_user(
    agent_state: State<'_, AgentState>,
    did: String,
) -> Result<String, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let current_did = current_repo_did()?;

    use bsky_sdk::api::app::bsky::graph::follow::RecordData as FollowRecordData;

    let record_data = FollowRecordData {
        created_at: bsky_sdk::api::types::string::Datetime::now(),
        subject: did
            .parse()
            .map_err(|_| AppError::ApiError("Invalid DID".into()))?,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let response = agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(current_did),
                collection: "app.bsky.graph.follow"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid follow NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(response.data.uri.to_string())
}

/// Unfollow a user (deletes the follow record)
#[tauri::command]
pub async fn unfollow_user(
    agent_state: State<'_, AgentState>,
    follow_uri: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let rkey_str = parse_rkey_from_uri(&follow_uri)?;
    let rkey = RecordKey::from_str(&rkey_str)
        .map_err(|_| AppError::ApiError("Invalid record key".into()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .delete_record(
            delete_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.graph.follow"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid follow NSID".into()))?,
                rkey,
                swap_record: None,
                swap_commit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Mute a user
#[tauri::command]
pub async fn mute_actor(agent_state: State<'_, AgentState>, did: String) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    agent
        .api
        .app
        .bsky
        .graph
        .mute_actor(
            bsky_sdk::api::app::bsky::graph::mute_actor::InputData {
                actor: did
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid actor identifier".into()))?,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Unmute a user
#[tauri::command]
pub async fn unmute_actor(agent_state: State<'_, AgentState>, did: String) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    agent
        .api
        .app
        .bsky
        .graph
        .unmute_actor(
            bsky_sdk::api::app::bsky::graph::unmute_actor::InputData {
                actor: did
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid actor identifier".into()))?,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Block a user (creates app.bsky.graph.block record)
#[tauri::command]
pub async fn block_actor(
    agent_state: State<'_, AgentState>,
    did: String,
) -> Result<String, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let current_did = current_repo_did()?;

    use bsky_sdk::api::app::bsky::graph::block::RecordData as BlockRecordData;

    let record_data = BlockRecordData {
        created_at: bsky_sdk::api::types::string::Datetime::now(),
        subject: did
            .parse()
            .map_err(|_| AppError::ApiError("Invalid DID".into()))?,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let response = agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(current_did),
                collection: "app.bsky.graph.block"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid block NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(response.data.uri.to_string())
}

/// Unblock a user (deletes the block record)
#[tauri::command]
pub async fn unblock_actor(
    agent_state: State<'_, AgentState>,
    block_uri: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let rkey_str = parse_rkey_from_uri(&block_uri)?;
    let rkey = RecordKey::from_str(&rkey_str)
        .map_err(|_| AppError::ApiError("Invalid record key".into()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .delete_record(
            delete_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.graph.block"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid block NSID".into()))?,
                rkey,
                swap_record: None,
                swap_commit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}
