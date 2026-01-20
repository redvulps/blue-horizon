use crate::commands::auth::AgentState;
use crate::db::DbState;
use crate::error::AppError;
use crate::media::{self, EmbedView};
use crate::session::get_stored_session;
use bsky_sdk::api::app::bsky::actor::defs::ProfileView;
use bsky_sdk::api::app::bsky::actor::get_profile as get_actor_profile;
use bsky_sdk::api::app::bsky::feed::defs::{FeedViewPost, FeedViewPostReasonRefs, PostView};
use bsky_sdk::api::app::bsky::feed::get_actor_likes;
use bsky_sdk::api::app::bsky::feed::get_author_feed;
use bsky_sdk::api::app::bsky::graph::{get_followers, get_follows};
use bsky_sdk::api::types::string::AtIdentifier;
use bsky_sdk::api::types::Union;
use chrono::Utc;
use sqlx::SqlitePool;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Deserialize, Clone)]
pub struct TimelineRequest {
    #[serde(default = "default_limit")]
    pub limit: u8,
    pub cursor: Option<String>,
}

fn default_limit() -> u8 {
    50
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TimelinePost {
    pub uri: String,
    pub cid: String,
    pub author_did: String,
    pub author_handle: String,
    pub author_display_name: Option<String>,
    pub author_avatar: Option<String>,
    #[serde(default)]
    pub is_repost: bool,
    pub reposted_by_handle: Option<String>,
    pub reposted_by_display_name: Option<String>,
    pub text: String,
    pub created_at: String,
    pub reply_count: u32,
    pub repost_count: u32,
    pub like_count: u32,
    pub is_liked: bool,
    pub is_reposted: bool,
    pub viewer_like: Option<String>,
    pub viewer_repost: Option<String>,
    pub embed: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TimelineResponse {
    pub posts: Vec<TimelinePost>,
    pub cursor: Option<String>,
}

fn extract_post_text(post: &PostView) -> String {
    // Post record is stored as ipld_core::ipld::Ipld
    // We serialize it to JSON and extract text field
    if let Ok(json) = serde_json::to_value(&post.record) {
        if let Some(text) = json.get("text").and_then(|v| v.as_str()) {
            return text.to_string();
        }
    }
    String::new()
}

fn extract_created_at(post: &PostView) -> String {
    if let Ok(json) = serde_json::to_value(&post.record) {
        if let Some(created) = json.get("createdAt").and_then(|v| v.as_str()) {
            return created.to_string();
        }
    }
    String::new()
}

fn embed_to_json(embed: Option<EmbedView>) -> Option<serde_json::Value> {
    embed.and_then(|value| serde_json::to_value(value).ok())
}

pub(crate) fn extract_repost_context(
    feed_view: &FeedViewPost,
) -> (bool, Option<String>, Option<String>) {
    match feed_view.reason.as_ref() {
        Some(Union::Refs(FeedViewPostReasonRefs::ReasonRepost(reason))) => (
            true,
            Some(reason.by.handle.to_string()),
            reason.by.display_name.clone(),
        ),
        _ => (false, None, None),
    }
}

fn current_user_did() -> Result<String, AppError> {
    Ok(get_stored_session()?.did)
}

fn cursor_key(cursor: Option<&str>) -> String {
    cursor.unwrap_or_default().to_string()
}

async fn load_timeline_cache(
    db: &SqlitePool,
    user_did: &str,
    cursor: Option<&str>,
) -> Result<Option<TimelineResponse>, AppError> {
    let payload = sqlx::query_scalar::<_, String>(
        r#"
        SELECT payload_json
        FROM timeline_cache
        WHERE user_did = ?1 AND cursor_key = ?2
        "#,
    )
    .bind(user_did)
    .bind(cursor_key(cursor))
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::InternalError(format!("timeline cache read failed: {e}")))?;

    payload
        .map(|raw| {
            serde_json::from_str::<TimelineResponse>(&raw)
                .map_err(|e| AppError::InternalError(format!("timeline cache decode failed: {e}")))
        })
        .transpose()
}

async fn save_timeline_cache(
    db: &SqlitePool,
    user_did: &str,
    cursor: Option<&str>,
    payload: &TimelineResponse,
) -> Result<(), AppError> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| AppError::InternalError(format!("timeline cache encode failed: {e}")))?;

    sqlx::query(
        r#"
        INSERT INTO timeline_cache (user_did, cursor_key, payload_json, cached_at)
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
    .map_err(|e| AppError::InternalError(format!("timeline cache write failed: {e}")))?;

    Ok(())
}

async fn load_profile_cache(
    db: &SqlitePool,
    user_did: &str,
    handle: &str,
) -> Result<Option<ProfileResponse>, AppError> {
    let payload = sqlx::query_scalar::<_, String>(
        r#"
        SELECT payload_json
        FROM profile_cache
        WHERE user_did = ?1 AND handle = ?2
        "#,
    )
    .bind(user_did)
    .bind(handle)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::InternalError(format!("profile cache read failed: {e}")))?;

    payload
        .map(|raw| {
            serde_json::from_str::<ProfileResponse>(&raw)
                .map_err(|e| AppError::InternalError(format!("profile cache decode failed: {e}")))
        })
        .transpose()
}

async fn save_profile_cache(
    db: &SqlitePool,
    user_did: &str,
    handle: &str,
    payload: &ProfileResponse,
) -> Result<(), AppError> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| AppError::InternalError(format!("profile cache encode failed: {e}")))?;

    sqlx::query(
        r#"
        INSERT INTO profile_cache (user_did, handle, payload_json, cached_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(user_did, handle) DO UPDATE SET
            payload_json = excluded.payload_json,
            cached_at = excluded.cached_at
        "#,
    )
    .bind(user_did)
    .bind(handle)
    .bind(payload_json)
    .bind(Utc::now().to_rfc3339())
    .execute(db)
    .await
    .map_err(|e| AppError::InternalError(format!("profile cache write failed: {e}")))?;

    Ok(())
}

async fn fetch_timeline_remote(
    app: &AppHandle,
    agent_state: &AgentState,
    request: &TimelineRequest,
) -> Result<TimelineResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Create limit - clamp to valid range (1-100)
    let limit_val = request.limit.max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let timeline = agent
        .api
        .app
        .bsky
        .feed
        .get_timeline(
            bsky_sdk::api::app::bsky::feed::get_timeline::ParametersData {
                algorithm: None,
                cursor: request.cursor.clone(),
                limit,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let mut posts: Vec<TimelinePost> = Vec::new();
    for feed_view in &timeline.data.feed {
        let post = &feed_view.post;
        let embed = media::process_post_embed(post, app).await?;
        let (is_repost, reposted_by_handle, reposted_by_display_name) =
            extract_repost_context(feed_view);

        posts.push(TimelinePost {
            uri: post.uri.to_string(),
            cid: post.cid.as_ref().to_string(),
            author_did: post.author.did.to_string(),
            author_handle: post.author.handle.to_string(),
            author_display_name: post.author.display_name.clone(),
            author_avatar: post.author.avatar.clone(),
            is_repost,
            reposted_by_handle,
            reposted_by_display_name,
            text: extract_post_text(post),
            created_at: extract_created_at(post),
            reply_count: post.reply_count.unwrap_or(0) as u32,
            repost_count: post.repost_count.unwrap_or(0) as u32,
            like_count: post.like_count.unwrap_or(0) as u32,
            is_liked: post.viewer.as_ref().and_then(|v| v.like.as_ref()).is_some(),
            is_reposted: post
                .viewer
                .as_ref()
                .and_then(|v| v.repost.as_ref())
                .is_some(),
            viewer_like: post
                .viewer
                .as_ref()
                .and_then(|v| v.like.as_ref())
                .map(|u| u.to_string()),
            viewer_repost: post
                .viewer
                .as_ref()
                .and_then(|v| v.repost.as_ref())
                .map(|u| u.to_string()),
            embed: embed_to_json(embed),
        });
    }

    Ok(TimelineResponse {
        posts,
        cursor: timeline.data.cursor,
    })
}

async fn fetch_profile_remote(
    agent_state: &AgentState,
    handle: &str,
) -> Result<ProfileResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let profile = agent
        .api
        .app
        .bsky
        .actor
        .get_profile(
            bsky_sdk::api::app::bsky::actor::get_profile::ParametersData {
                actor: handle
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid handle".into()))?,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let data = profile.data;

    Ok(ProfileResponse {
        did: data.did.to_string(),
        handle: data.handle.to_string(),
        display_name: data.display_name,
        description: data.description,
        avatar: data.avatar,
        banner: data.banner,
        followers_count: data.followers_count.unwrap_or(0) as u32,
        follows_count: data.follows_count.unwrap_or(0) as u32,
        posts_count: data.posts_count.unwrap_or(0) as u32,
        is_following: data
            .viewer
            .as_ref()
            .and_then(|v| v.following.as_ref())
            .is_some(),
        is_followed_by: data
            .viewer
            .as_ref()
            .and_then(|v| v.followed_by.as_ref())
            .is_some(),
        viewer_following: data
            .viewer
            .as_ref()
            .and_then(|v| v.following.as_ref())
            .map(|u| u.to_string()),
        viewer_muted: data
            .viewer
            .as_ref()
            .map(|v| v.muted.unwrap_or(false))
            .unwrap_or(false),
        viewer_blocking: data
            .viewer
            .as_ref()
            .and_then(|v| v.blocking.as_ref())
            .map(|u| u.to_string()),
    })
}

/// Get home timeline
#[tauri::command]
pub async fn get_timeline(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    db: State<'_, DbState>,
    request: TimelineRequest,
) -> Result<TimelineResponse, AppError> {
    let user_did = current_user_did()?;
    let db_pool = db.inner().clone();
    let cursor_for_cache = request.cursor.clone();

    if request.cursor.is_none() {
        if let Some(cached) = load_timeline_cache(db_pool.as_ref(), &user_did, None).await? {
            let refresh_app = app.clone();
            let refresh_agent_state = agent_state.inner().clone();
            let refresh_db = db_pool.clone();
            let refresh_request = request.clone();
            let refresh_user_did = user_did.clone();

            tauri::async_runtime::spawn(async move {
                match fetch_timeline_remote(&refresh_app, &refresh_agent_state, &refresh_request)
                    .await
                {
                    Ok(remote) => {
                        if let Err(err) = save_timeline_cache(
                            refresh_db.as_ref(),
                            &refresh_user_did,
                            None,
                            &remote,
                        )
                        .await
                        {
                            eprintln!("[timeline-cache] refresh save failed: {err}");
                        }

                        if let Err(err) = refresh_app.emit("timeline_updated", &remote) {
                            eprintln!("[timeline-cache] emit refresh failed: {err}");
                        }
                    }
                    Err(err) => {
                        eprintln!("[timeline-cache] refresh fetch failed: {err}");
                    }
                }
            });

            return Ok(cached);
        }
    }

    match fetch_timeline_remote(&app, agent_state.inner(), &request).await {
        Ok(remote) => {
            save_timeline_cache(
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
                load_timeline_cache(db_pool.as_ref(), &user_did, cursor_for_cache.as_deref())
                    .await?
            {
                return Ok(cached);
            }

            Err(remote_err)
        }
    }
}

#[derive(Deserialize, Clone)]
pub struct ProfileRequest {
    pub handle: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfileResponse {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub avatar: Option<String>,
    pub banner: Option<String>,
    pub followers_count: u32,
    pub follows_count: u32,
    pub posts_count: u32,
    pub is_following: bool,
    pub is_followed_by: bool,
    pub viewer_following: Option<String>,
    pub viewer_muted: bool,
    pub viewer_blocking: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfileUpdatedEvent {
    pub handle: String,
    pub profile: ProfileResponse,
}

#[derive(Deserialize, Clone)]
pub struct FollowListRequest {
    pub actor: String,
    #[serde(default = "default_limit")]
    pub limit: u8,
    pub cursor: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FollowListItem {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub description: Option<String>,
    pub is_following: bool,
    pub is_followed_by: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FollowListResponse {
    pub items: Vec<FollowListItem>,
    pub cursor: Option<String>,
}

fn profile_view_to_follow_list_item(profile: &ProfileView) -> FollowListItem {
    FollowListItem {
        did: profile.did.to_string(),
        handle: profile.handle.to_string(),
        display_name: profile.display_name.clone(),
        avatar: profile.avatar.clone(),
        description: profile.description.clone(),
        is_following: profile
            .viewer
            .as_ref()
            .and_then(|v| v.following.as_ref())
            .is_some(),
        is_followed_by: profile
            .viewer
            .as_ref()
            .and_then(|v| v.followed_by.as_ref())
            .is_some(),
    }
}

async fn fetch_actor_likes_via_appview(
    actor: &str,
    limit: u8,
    cursor: Option<&str>,
) -> Result<get_actor_likes::Output, AppError> {
    const APPVIEW_ENDPOINTS: [&str; 2] = ["https://api.bsky.app", "https://public.api.bsky.app"];

    let access_jwt = get_stored_session().ok().map(|s| s.access_jwt);
    let client = reqwest::Client::new();
    let mut last_error = String::from("no appview attempts made");

    for endpoint in APPVIEW_ENDPOINTS {
        let url = format!("{endpoint}/xrpc/app.bsky.feed.getActorLikes");
        let mut request = client
            .get(&url)
            .query(&[("actor", actor)])
            .query(&[("limit", limit.to_string())]);

        if let Some(cursor) = cursor {
            request = request.query(&[("cursor", cursor)]);
        }

        if let Some(token) = access_jwt.as_deref() {
            request = request.bearer_auth(token);
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(err) => {
                last_error = format!("{endpoint} request failed: {err}");
                continue;
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            last_error = format!("{endpoint} status={status} body={body}");
            continue;
        }

        match response.json::<get_actor_likes::Output>().await {
            Ok(parsed) => return Ok(parsed),
            Err(err) => {
                last_error = format!("{endpoint} decode failed: {err}");
            }
        }
    }

    Err(AppError::ApiError(format!(
        "Failed to fetch likes via appview: {last_error}"
    )))
}

/// Get user profile
#[tauri::command]
pub async fn get_profile(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    db: State<'_, DbState>,
    request: ProfileRequest,
) -> Result<ProfileResponse, AppError> {
    let user_did = current_user_did()?;
    let db_pool = db.inner().clone();
    let handle = request.handle.trim().to_lowercase();

    if let Some(cached) = load_profile_cache(db_pool.as_ref(), &user_did, &handle).await? {
        let refresh_app = app.clone();
        let refresh_agent_state = agent_state.inner().clone();
        let refresh_db = db_pool.clone();
        let refresh_user_did = user_did.clone();
        let refresh_handle = handle.clone();

        tauri::async_runtime::spawn(async move {
            match fetch_profile_remote(&refresh_agent_state, &refresh_handle).await {
                Ok(profile) => {
                    if let Err(err) = save_profile_cache(
                        refresh_db.as_ref(),
                        &refresh_user_did,
                        &refresh_handle,
                        &profile,
                    )
                    .await
                    {
                        eprintln!("[profile-cache] refresh save failed: {err}");
                    }

                    let payload = ProfileUpdatedEvent {
                        handle: refresh_handle,
                        profile,
                    };

                    if let Err(err) = refresh_app.emit("profile_updated", payload) {
                        eprintln!("[profile-cache] emit refresh failed: {err}");
                    }
                }
                Err(err) => {
                    eprintln!("[profile-cache] refresh fetch failed: {err}");
                }
            }
        });

        return Ok(cached);
    }

    match fetch_profile_remote(agent_state.inner(), &handle).await {
        Ok(profile) => {
            save_profile_cache(db_pool.as_ref(), &user_did, &handle, &profile).await?;
            Ok(profile)
        }
        Err(remote_err) => {
            if let Some(cached) = load_profile_cache(db_pool.as_ref(), &user_did, &handle).await? {
                return Ok(cached);
            }
            Err(remote_err)
        }
    }
}

/// Get profile followers
#[tauri::command]
pub async fn get_followers(
    agent_state: State<'_, AgentState>,
    request: FollowListRequest,
) -> Result<FollowListResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit_val = request.limit.max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let actor = request
        .actor
        .trim()
        .parse()
        .map_err(|_| AppError::ApiError("Invalid actor identifier".into()))?;

    let response = agent
        .api
        .app
        .bsky
        .graph
        .get_followers(
            get_followers::ParametersData {
                actor,
                cursor: request.cursor,
                limit,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(FollowListResponse {
        items: response
            .data
            .followers
            .iter()
            .map(profile_view_to_follow_list_item)
            .collect(),
        cursor: response.data.cursor,
    })
}

/// Get profiles followed by actor
#[tauri::command]
pub async fn get_follows(
    agent_state: State<'_, AgentState>,
    request: FollowListRequest,
) -> Result<FollowListResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit_val = request.limit.max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let actor = request
        .actor
        .trim()
        .parse()
        .map_err(|_| AppError::ApiError("Invalid actor identifier".into()))?;

    let response = agent
        .api
        .app
        .bsky
        .graph
        .get_follows(
            get_follows::ParametersData {
                actor,
                cursor: request.cursor,
                limit,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(FollowListResponse {
        items: response
            .data
            .follows
            .iter()
            .map(profile_view_to_follow_list_item)
            .collect(),
        cursor: response.data.cursor,
    })
}

#[derive(Deserialize)]
pub struct PostThreadRequest {
    pub uri: String,
    pub depth: Option<u8>,
}

#[derive(Serialize)]
pub struct ThreadPost {
    pub uri: String,
    pub cid: String,
    pub author_did: String,
    pub author_handle: String,
    pub author_display_name: Option<String>,
    pub author_avatar: Option<String>,
    pub text: String,
    pub created_at: String,
    pub reply_count: u32,
    pub repost_count: u32,
    pub like_count: u32,
    pub is_liked: bool,
    pub is_reposted: bool,
    pub viewer_like: Option<String>,
    pub viewer_repost: Option<String>,
    pub embed: Option<EmbedView>,
}

#[derive(Serialize)]
pub struct ThreadResponse {
    pub post: ThreadPost,
    pub parent: Option<Box<ThreadResponse>>,
    pub replies: Vec<ThreadResponse>,
}

fn post_view_to_thread_post(post: &PostView, embed: Option<EmbedView>) -> ThreadPost {
    ThreadPost {
        uri: post.uri.to_string(),
        cid: post.cid.as_ref().to_string(),
        author_did: post.author.did.to_string(),
        author_handle: post.author.handle.to_string(),
        author_display_name: post.author.display_name.clone(),
        author_avatar: post.author.avatar.clone(),
        text: extract_post_text(post),
        created_at: extract_created_at(post),
        reply_count: post.reply_count.unwrap_or(0) as u32,
        repost_count: post.repost_count.unwrap_or(0) as u32,
        like_count: post.like_count.unwrap_or(0) as u32,
        is_liked: post.viewer.as_ref().and_then(|v| v.like.as_ref()).is_some(),
        is_reposted: post
            .viewer
            .as_ref()
            .and_then(|v| v.repost.as_ref())
            .is_some(),
        viewer_like: post
            .viewer
            .as_ref()
            .and_then(|v| v.like.as_ref())
            .map(|u| u.to_string()),
        viewer_repost: post
            .viewer
            .as_ref()
            .and_then(|v| v.repost.as_ref())
            .map(|u| u.to_string()),
        embed,
    }
}

/// Get a post thread with parent and replies
#[tauri::command]
pub async fn get_post_thread(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    request: PostThreadRequest,
) -> Result<ThreadResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let depth = request.depth.unwrap_or(6).max(1).min(100) as u16;
    let depth_limit = bsky_sdk::api::types::LimitedU16::<1000>::try_from(depth).ok();

    let thread = agent
        .api
        .app
        .bsky
        .feed
        .get_post_thread(
            bsky_sdk::api::app::bsky::feed::get_post_thread::ParametersData {
                uri: request
                    .uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid URI".into()))?,
                depth: depth_limit,
                parent_height: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    use bsky_sdk::api::app::bsky::feed::defs::{
        ThreadViewPostParentRefs, ThreadViewPostRepliesItem,
    };
    use bsky_sdk::api::app::bsky::feed::get_post_thread::OutputThreadRefs;
    use bsky_sdk::api::types::Union;
    use futures::future::BoxFuture;
    use futures::FutureExt;

    fn parse_parent<'a>(
        view: &'a Union<ThreadViewPostParentRefs>,
        app: &'a AppHandle,
    ) -> BoxFuture<'a, Result<Option<ThreadResponse>, AppError>> {
        async move {
            match view {
                Union::Refs(ThreadViewPostParentRefs::ThreadViewPost(tv)) => {
                    let embed = media::process_post_embed(&tv.post, app).await?;
                    let post = post_view_to_thread_post(&tv.post, embed);
                    let parent = if let Some(p) = &tv.parent {
                        parse_parent(p, app).await?.map(Box::new)
                    } else {
                        None
                    };
                    Ok(Some(ThreadResponse {
                        post,
                        parent,
                        replies: Vec::new(),
                    }))
                }
                _ => Ok(None),
            }
        }
        .boxed()
    }

    fn parse_reply<'a>(
        view: &'a Union<ThreadViewPostRepliesItem>,
        app: &'a AppHandle,
    ) -> BoxFuture<'a, Result<Option<ThreadResponse>, AppError>> {
        async move {
            match view {
                Union::Refs(ThreadViewPostRepliesItem::ThreadViewPost(tv)) => {
                    let embed = media::process_post_embed(&tv.post, app).await?;
                    let post = post_view_to_thread_post(&tv.post, embed);
                    let mut replies: Vec<ThreadResponse> = Vec::new();
                    if let Some(ref reply_list) = tv.replies {
                        for reply in reply_list {
                            if let Some(parsed) = parse_reply(reply, app).await? {
                                replies.push(parsed);
                            }
                        }
                    }
                    Ok(Some(ThreadResponse {
                        post,
                        parent: None,
                        replies,
                    }))
                }
                _ => Ok(None),
            }
        }
        .boxed()
    }

    // Parse main thread
    match &thread.data.thread {
        Union::Refs(OutputThreadRefs::AppBskyFeedDefsThreadViewPost(tv)) => {
            let embed = media::process_post_embed(&tv.post, &app).await?;
            let post = post_view_to_thread_post(&tv.post, embed);
            let parent = if let Some(p) = &tv.parent {
                parse_parent(p, &app).await?.map(Box::new)
            } else {
                None
            };
            let mut replies: Vec<ThreadResponse> = Vec::new();
            if let Some(ref reply_list) = tv.replies {
                for reply in reply_list {
                    if let Some(parsed) = parse_reply(reply, &app).await? {
                        replies.push(parsed);
                    }
                }
            }
            Ok(ThreadResponse {
                post,
                parent,
                replies,
            })
        }
        _ => Err(AppError::ApiError("Thread not found or blocked".into())),
    }
}

#[derive(Deserialize)]
pub struct AuthorFeedRequest {
    pub handle: String,
    #[serde(default = "default_limit")]
    pub limit: u8,
    pub cursor: Option<String>,
    pub filter: Option<String>, // "posts", "replies", "likes"
}

/// Get author's posts feed
#[tauri::command]
pub async fn get_author_feed(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    request: AuthorFeedRequest,
) -> Result<TimelineResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Create limit - clamp to valid range (1-100)
    let limit_val = request.limit.max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    // For now, we'll implement basic filtering by using different API calls
    let mut posts: Vec<TimelinePost> = Vec::new();
    let cursor: Option<String>;

    if request.filter.as_deref() == Some("likes") {
        // Use get_actor_likes for likes.
        // If the first request fails, resolve profile and retry with canonical handle/DID.
        let actor: AtIdentifier = request
            .handle
            .trim()
            .parse()
            .map_err(|_| AppError::ApiError("Invalid handle".into()))?;

        let likes_feed = match agent
            .api
            .app
            .bsky
            .feed
            .get_actor_likes(
                get_actor_likes::ParametersData {
                    actor: actor.clone(),
                    cursor: request.cursor.clone(),
                    limit: limit.clone(),
                }
                .into(),
            )
            .await
        {
            Ok(feed) => feed,
            Err(primary_err) => {
                let primary_message = primary_err.to_string();

                match fetch_actor_likes_via_appview(
                    actor.as_ref(),
                    limit_val,
                    request.cursor.as_deref(),
                )
                .await
                {
                    Ok(feed) => feed,
                    Err(_) => {
                        let resolved_profile = match agent
                            .api
                            .app
                            .bsky
                            .actor
                            .get_profile(
                                get_actor_profile::ParametersData {
                                    actor: actor.clone(),
                                }
                                .into(),
                            )
                            .await
                        {
                            Ok(response) => response.data,
                            Err(_) => return Err(AppError::ApiError(primary_message)),
                        };

                        let retry_candidates: [AtIdentifier; 2] = [
                            AtIdentifier::Handle(resolved_profile.handle.clone()),
                            AtIdentifier::Did(resolved_profile.did.clone()),
                        ];

                        let mut last_error = primary_message;
                        let mut recovered_feed = None;

                        for candidate in retry_candidates {
                            if candidate.as_ref() == actor.as_ref() {
                                continue;
                            }

                            let candidate_label = candidate.as_ref().to_string();
                            match agent
                                .api
                                .app
                                .bsky
                                .feed
                                .get_actor_likes(
                                    get_actor_likes::ParametersData {
                                        actor: candidate.clone(),
                                        cursor: request.cursor.clone(),
                                        limit: limit.clone(),
                                    }
                                    .into(),
                                )
                                .await
                            {
                                Ok(feed) => {
                                    recovered_feed = Some(feed);
                                    break;
                                }
                                Err(err) => last_error = err.to_string(),
                            }

                            match fetch_actor_likes_via_appview(
                                &candidate_label,
                                limit_val,
                                request.cursor.as_deref(),
                            )
                            .await
                            {
                                Ok(feed) => {
                                    recovered_feed = Some(feed);
                                    break;
                                }
                                Err(err) => last_error = err.to_string(),
                            }
                        }

                        recovered_feed.ok_or(AppError::ApiError(last_error))?
                    }
                }
            }
        };

        for like_item in &likes_feed.data.feed {
            let post = &like_item.post;
            let embed = media::process_post_embed(post, &app).await?;
            let (is_repost, reposted_by_handle, reposted_by_display_name) =
                extract_repost_context(like_item);

            posts.push(TimelinePost {
                uri: post.uri.to_string(),
                cid: post.cid.as_ref().to_string(),
                author_did: post.author.did.to_string(),
                author_handle: post.author.handle.to_string(),
                author_display_name: post.author.display_name.clone(),
                author_avatar: post.author.avatar.clone(),
                is_repost,
                reposted_by_handle,
                reposted_by_display_name,
                text: extract_post_text(post),
                created_at: extract_created_at(post),
                reply_count: post.reply_count.unwrap_or(0) as u32,
                repost_count: post.repost_count.unwrap_or(0) as u32,
                like_count: post.like_count.unwrap_or(0) as u32,
                is_liked: post.viewer.as_ref().and_then(|v| v.like.as_ref()).is_some(),
                is_reposted: post
                    .viewer
                    .as_ref()
                    .and_then(|v| v.repost.as_ref())
                    .is_some(),
                viewer_like: post
                    .viewer
                    .as_ref()
                    .and_then(|v| v.like.as_ref())
                    .map(|u| u.to_string()),
                viewer_repost: post
                    .viewer
                    .as_ref()
                    .and_then(|v| v.repost.as_ref())
                    .map(|u| u.to_string()),
                embed: embed_to_json(embed),
            });
        }
        cursor = likes_feed.data.cursor;
    } else {
        // For posts and replies, use get_author_feed
        let filter_param = match request.filter.as_deref() {
            Some("posts") => Some("posts_no_replies".to_string()),
            Some("replies") => Some("posts_with_replies".to_string()),
            _ => Some("posts_no_replies".to_string()),
        };

        let author_feed = agent
            .api
            .app
            .bsky
            .feed
            .get_author_feed(
                get_author_feed::ParametersData {
                    actor: request
                        .handle
                        .parse()
                        .map_err(|_| AppError::ApiError("Invalid handle".into()))?,
                    cursor: request.cursor,
                    limit,
                    filter: filter_param.clone(),
                    include_pins: Some(false),
                }
                .into(),
            )
            .await
            .map_err(|e| AppError::ApiError(e.to_string()))?;

        for feed_view in &author_feed.data.feed {
            let post = &feed_view.post;

            let is_reply_record = if let Ok(json) = serde_json::to_value(&post.record) {
                json.get("reply").is_some()
            } else {
                false
            };

            // If we are specifically asking for "replies" tab, filter out non-replies
            // "posts_with_replies" API returns everything, so we filter manually to match UI expectation
            if request.filter.as_deref() == Some("replies") && !is_reply_record {
                continue;
            }

            let embed = media::process_post_embed(post, &app).await?;
            let (is_repost, reposted_by_handle, reposted_by_display_name) =
                extract_repost_context(feed_view);

            posts.push(TimelinePost {
                uri: post.uri.to_string(),
                cid: post.cid.as_ref().to_string(),
                author_did: post.author.did.to_string(),
                author_handle: post.author.handle.to_string(),
                author_display_name: post.author.display_name.clone(),
                author_avatar: post.author.avatar.clone(),
                is_repost,
                reposted_by_handle,
                reposted_by_display_name,
                text: extract_post_text(post),
                created_at: extract_created_at(post),
                reply_count: post.reply_count.unwrap_or(0) as u32,
                repost_count: post.repost_count.unwrap_or(0) as u32,
                like_count: post.like_count.unwrap_or(0) as u32,
                is_liked: post.viewer.as_ref().and_then(|v| v.like.as_ref()).is_some(),
                is_reposted: post
                    .viewer
                    .as_ref()
                    .and_then(|v| v.repost.as_ref())
                    .is_some(),
                viewer_like: post
                    .viewer
                    .as_ref()
                    .and_then(|v| v.like.as_ref())
                    .map(|u| u.to_string()),
                viewer_repost: post
                    .viewer
                    .as_ref()
                    .and_then(|v| v.repost.as_ref())
                    .map(|u| u.to_string()),
                embed: embed_to_json(embed),
            });
        }
        cursor = author_feed.data.cursor;
    }

    Ok(TimelineResponse { posts, cursor })
}
