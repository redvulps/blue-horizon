use crate::commands::auth::AgentState;
use crate::error::AppError;
use crate::media;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Serialize)]
pub struct FeedInfo {
    pub uri: String,
    pub cid: String,
    pub did: String,
    pub creator_did: String,
    pub creator_handle: String,
    pub creator_display_name: Option<String>,
    pub creator_avatar: Option<String>,
    pub display_name: String,
    pub description: Option<String>,
    pub avatar: Option<String>,
    pub like_count: u32,
    pub is_saved: bool,
}

#[derive(Serialize)]
pub struct SuggestedFeedsResponse {
    pub feeds: Vec<FeedInfo>,
    pub cursor: Option<String>,
}

/// Get suggested feeds for discovery
#[tauri::command]
pub async fn get_suggested_feeds(
    agent_state: State<'_, AgentState>,
    cursor: Option<String>,
) -> Result<SuggestedFeedsResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let response = agent
        .api
        .app
        .bsky
        .feed
        .get_suggested_feeds(
            bsky_sdk::api::app::bsky::feed::get_suggested_feeds::ParametersData {
                cursor,
                limit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let feeds: Vec<FeedInfo> = response
        .data
        .feeds
        .iter()
        .map(|f| FeedInfo {
            uri: f.uri.to_string(),
            cid: f.cid.as_ref().to_string(),
            did: f.did.to_string(),
            creator_did: f.creator.did.to_string(),
            creator_handle: f.creator.handle.to_string(),
            creator_display_name: f.creator.display_name.clone(),
            creator_avatar: f.creator.avatar.clone(),
            display_name: f.display_name.clone(),
            description: f.description.clone(),
            avatar: f.avatar.clone(),
            like_count: f.like_count.unwrap_or(0) as u32,
            is_saved: f.viewer.as_ref().and_then(|v| v.like.as_ref()).is_some(),
        })
        .collect();

    Ok(SuggestedFeedsResponse {
        feeds,
        cursor: response.data.cursor,
    })
}

#[derive(Deserialize)]
pub struct GetFeedRequest {
    pub feed_uri: String,
    pub limit: Option<u8>,
    pub cursor: Option<String>,
}

#[derive(Serialize)]
pub struct FeedPostsResponse {
    pub posts: Vec<super::timeline::TimelinePost>,
    pub cursor: Option<String>,
}

/// Get posts from a specific feed
#[tauri::command]
pub async fn get_feed(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    request: GetFeedRequest,
) -> Result<FeedPostsResponse, AppError> {
    println!("DEBUG: get_feed called with uri: {}", request.feed_uri);

    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit_val = request.limit.unwrap_or(50).max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let response = agent
        .api
        .app
        .bsky
        .feed
        .get_feed(
            bsky_sdk::api::app::bsky::feed::get_feed::ParametersData {
                feed: request
                    .feed_uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid feed URI".into()))?,
                cursor: request.cursor,
                limit,
            }
            .into(),
        )
        .await
        .map_err(|e| {
            println!("DEBUG: get_feed API error: {}", e);
            AppError::ApiError(e.to_string())
        })?;

    println!(
        "DEBUG: get_feed success, items: {}",
        response.data.feed.len()
    );

    let mut posts: Vec<super::timeline::TimelinePost> = Vec::new();
    for feed_view in &response.data.feed {
        let post = &feed_view.post;

        let text = if let Ok(json) = serde_json::to_value(&post.record) {
            json.get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        };

        let created_at = if let Ok(json) = serde_json::to_value(&post.record) {
            json.get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        };

        let embed = media::process_post_embed(post, &app).await?;
        let (is_repost, reposted_by_handle, reposted_by_display_name) =
            super::timeline::extract_repost_context(feed_view);

        posts.push(super::timeline::TimelinePost {
            uri: post.uri.to_string(),
            cid: post.cid.as_ref().to_string(),
            author_did: post.author.did.to_string(),
            author_handle: post.author.handle.to_string(),
            author_display_name: post.author.display_name.clone(),
            author_avatar: post.author.avatar.clone(),
            is_repost,
            reposted_by_handle,
            reposted_by_display_name,
            text,
            created_at,
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
            embed: embed.and_then(|value| serde_json::to_value(value).ok()),
        });
    }

    Ok(FeedPostsResponse {
        posts,
        cursor: response.data.cursor,
    })
}
