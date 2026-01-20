use crate::commands::auth::AgentState;
use crate::error::AppError;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultAuthor {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultPost {
    pub uri: String,
    pub cid: String,
    pub author: SearchResultAuthor,
    pub text: String,
    pub indexed_at: String,
    pub like_count: u32,
    pub repost_count: u32,
    pub reply_count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub actors: Vec<SearchResultAuthor>,
    pub posts: Vec<SearchResultPost>,
    pub cursor: Option<String>,
}

/// Search for actors (users) by query
#[tauri::command]
pub async fn search_actors(
    agent_state: State<'_, AgentState>,
    query: String,
    limit: Option<u8>,
    cursor: Option<String>,
) -> Result<SearchResults, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit_val = limit.unwrap_or(25).max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let response = agent
        .api
        .app
        .bsky
        .actor
        .search_actors(
            bsky_sdk::api::app::bsky::actor::search_actors::ParametersData {
                q: Some(query),
                term: None, // Deprecated, use q instead
                limit,
                cursor,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let actors: Vec<SearchResultAuthor> = response
        .data
        .actors
        .into_iter()
        .map(|actor| SearchResultAuthor {
            did: actor.did.to_string(),
            handle: actor.handle.to_string(),
            display_name: actor.display_name.clone(),
            avatar: actor.avatar.clone(),
            description: actor.description.clone(),
        })
        .collect();

    Ok(SearchResults {
        actors,
        posts: vec![],
        cursor: response.data.cursor,
    })
}

/// Search for posts by query
#[tauri::command]
pub async fn search_posts(
    agent_state: State<'_, AgentState>,
    query: String,
    limit: Option<u8>,
    cursor: Option<String>,
    sort: Option<String>,
    author: Option<String>,
) -> Result<SearchResults, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let sort_order = sort.as_deref().unwrap_or("latest");
    let limit_val = limit.unwrap_or(25).max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let response = agent
        .api
        .app
        .bsky
        .feed
        .search_posts(
            bsky_sdk::api::app::bsky::feed::search_posts::ParametersData {
                q: query,
                limit,
                cursor,
                sort: Some(sort_order.to_string()),
                author: author.map(|a| a.parse().ok()).flatten(),
                domain: None,
                lang: None,
                mentions: None,
                since: None,
                tag: None,
                until: None,
                url: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let posts: Vec<SearchResultPost> = response
        .data
        .posts
        .into_iter()
        .map(|post| {
            let text = if let Ok(json) = serde_json::to_value(&post.record) {
                json.get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string()
            } else {
                String::new()
            };

            SearchResultPost {
                uri: post.uri.to_string(),
                cid: post.cid.as_ref().to_string(),
                author: SearchResultAuthor {
                    did: post.author.did.to_string(),
                    handle: post.author.handle.to_string(),
                    display_name: post.author.display_name.clone(),
                    avatar: post.author.avatar.clone(),
                    description: None, // ProfileViewBasic doesn't have description
                },
                text,
                indexed_at: post.indexed_at.as_ref().to_string(),
                like_count: post.like_count.unwrap_or(0) as u32,
                repost_count: post.repost_count.unwrap_or(0) as u32,
                reply_count: post.reply_count.unwrap_or(0) as u32,
            }
        })
        .collect();

    Ok(SearchResults {
        actors: vec![],
        posts,
        cursor: response.data.cursor,
    })
}

/// Combined search for both actors and posts (quick search)
#[tauri::command]
pub async fn search(
    agent_state: State<'_, AgentState>,
    query: String,
) -> Result<SearchResults, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(5_u8).ok();

    // Search actors (limit 5 for quick search)
    let actors_response = agent
        .api
        .app
        .bsky
        .actor
        .search_actors(
            bsky_sdk::api::app::bsky::actor::search_actors::ParametersData {
                q: Some(query.clone()),
                term: None,
                limit,
                cursor: None,
            }
            .into(),
        )
        .await;

    let actors: Vec<SearchResultAuthor> = actors_response
        .map(|r| {
            r.data
                .actors
                .into_iter()
                .map(|actor| SearchResultAuthor {
                    did: actor.did.to_string(),
                    handle: actor.handle.to_string(),
                    display_name: actor.display_name.clone(),
                    avatar: actor.avatar.clone(),
                    description: actor.description.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    // Search posts (limit 5 for quick search)
    let posts_response = agent
        .api
        .app
        .bsky
        .feed
        .search_posts(
            bsky_sdk::api::app::bsky::feed::search_posts::ParametersData {
                q: query,
                limit,
                cursor: None,
                sort: Some("latest".to_string()),
                author: None,
                domain: None,
                lang: None,
                mentions: None,
                since: None,
                tag: None,
                until: None,
                url: None,
            }
            .into(),
        )
        .await;

    let posts: Vec<SearchResultPost> = posts_response
        .map(|r| {
            r.data
                .posts
                .into_iter()
                .map(|post| {
                    let text = if let Ok(json) = serde_json::to_value(&post.record) {
                        json.get("text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string()
                    } else {
                        String::new()
                    };

                    SearchResultPost {
                        uri: post.uri.to_string(),
                        cid: post.cid.as_ref().to_string(),
                        author: SearchResultAuthor {
                            did: post.author.did.to_string(),
                            handle: post.author.handle.to_string(),
                            display_name: post.author.display_name.clone(),
                            avatar: post.author.avatar.clone(),
                            description: None,
                        },
                        text,
                        indexed_at: post.indexed_at.as_ref().to_string(),
                        like_count: post.like_count.unwrap_or(0) as u32,
                        repost_count: post.repost_count.unwrap_or(0) as u32,
                        reply_count: post.reply_count.unwrap_or(0) as u32,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(SearchResults {
        actors,
        posts,
        cursor: None,
    })
}
