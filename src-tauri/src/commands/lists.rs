use crate::commands::auth::AgentState;
use crate::error::AppError;
use crate::session::get_stored_session;
use bsky_sdk::api::app::bsky::graph::defs::ListPurpose;
use bsky_sdk::api::app::bsky::graph::list::RecordData as ListRecordData;
use bsky_sdk::api::app::bsky::graph::listitem::RecordData as ListItemRecordData;
use bsky_sdk::api::com::atproto::repo::{create_record, delete_record, put_record};
use bsky_sdk::api::types::string::{AtIdentifier, Datetime, Did, RecordKey};
use bsky_sdk::api::types::LimitedNonZeroU8;
use bsky_sdk::api::types::TryIntoUnknown;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri::State;

fn parse_rkey_from_uri(uri: &str) -> Result<String, AppError> {
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

fn max_list_fetch_limit() -> Result<LimitedNonZeroU8<100>, AppError> {
    LimitedNonZeroU8::<100>::try_from(100_u8)
        .map_err(|_| AppError::InternalError("Invalid static list fetch limit".into()))
}

#[derive(Serialize)]
pub struct ListInfo {
    pub uri: String,
    pub cid: String,
    pub name: String,
    pub purpose: String,
    pub description: Option<String>,
    pub avatar: Option<String>,
    pub creator_did: String,
    pub creator_handle: String,
    pub creator_display_name: Option<String>,
    pub creator_avatar: Option<String>,
    pub member_count: u32,
}

#[derive(Serialize)]
pub struct ListMember {
    pub uri: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Serialize)]
pub struct ActorListsResponse {
    pub lists: Vec<ListInfo>,
    pub cursor: Option<String>,
}

/// Get lists created by an actor
#[tauri::command]
pub async fn get_actor_lists(
    agent_state: State<'_, AgentState>,
    actor: String,
    cursor: Option<String>,
) -> Result<ActorListsResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let response = agent
        .api
        .app
        .bsky
        .graph
        .get_lists(
            bsky_sdk::api::app::bsky::graph::get_lists::ParametersData {
                actor: actor
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid actor".into()))?,
                cursor,
                limit: None,
                purposes: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let lists: Vec<ListInfo> = response
        .data
        .lists
        .iter()
        .map(|l| {
            let purpose = l.purpose.as_str();

            ListInfo {
                uri: l.uri.to_string(),
                cid: l.cid.as_ref().to_string(),
                name: l.name.clone(),
                purpose: purpose.to_string(),
                description: l.description.clone(),
                avatar: l.avatar.clone(),
                creator_did: l.creator.did.to_string(),
                creator_handle: l.creator.handle.to_string(),
                creator_display_name: l.creator.display_name.clone(),
                creator_avatar: l.creator.avatar.clone(),
                member_count: l.list_item_count.unwrap_or(0) as u32,
            }
        })
        .collect();

    Ok(ActorListsResponse {
        lists,
        cursor: response.data.cursor,
    })
}

#[derive(Deserialize)]
pub struct GetListRequest {
    pub list_uri: String,
    pub cursor: Option<String>,
}

#[derive(Serialize)]
pub struct ListDetailsResponse {
    pub list: ListInfo,
    pub members: Vec<ListMember>,
    pub cursor: Option<String>,
}

/// Get list details and members
#[tauri::command]
pub async fn get_list(
    agent_state: State<'_, AgentState>,
    request: GetListRequest,
) -> Result<ListDetailsResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let response = agent
        .api
        .app
        .bsky
        .graph
        .get_list(
            bsky_sdk::api::app::bsky::graph::get_list::ParametersData {
                list: request
                    .list_uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid list URI".into()))?,
                cursor: request.cursor,
                limit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let l = &response.data.list;
    let purpose = l.purpose.as_str();

    let list = ListInfo {
        uri: l.uri.to_string(),
        cid: l.cid.as_ref().to_string(),
        name: l.name.clone(),
        purpose: purpose.to_string(),
        description: l.description.clone(),
        avatar: l.avatar.clone(),
        creator_did: l.creator.did.to_string(),
        creator_handle: l.creator.handle.to_string(),
        creator_display_name: l.creator.display_name.clone(),
        creator_avatar: l.creator.avatar.clone(),
        member_count: l.list_item_count.unwrap_or(0) as u32,
    };

    let members: Vec<ListMember> = response
        .data
        .items
        .iter()
        .map(|item| ListMember {
            uri: item.uri.to_string(),
            did: item.subject.did.to_string(),
            handle: item.subject.handle.to_string(),
            display_name: item.subject.display_name.clone(),
            avatar: item.subject.avatar.clone(),
        })
        .collect();

    Ok(ListDetailsResponse {
        list,
        members,
        cursor: response.data.cursor,
    })
}

#[derive(Serialize)]
pub struct ListMembership {
    pub list_uri: String,
    pub listitem_uri: String,
}

#[derive(Serialize)]
pub struct SubjectMembershipsResponse {
    pub memberships: Vec<ListMembership>,
}

/// Check which of the current user's lists contain a specific subject
#[tauri::command]
pub async fn get_subject_list_memberships(
    agent_state: State<'_, AgentState>,
    subject_did: String,
) -> Result<SubjectMembershipsResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let current_did = current_repo_did()?;

    // Get all lists owned by the current user
    let lists_response = agent
        .api
        .app
        .bsky
        .graph
        .get_lists(
            bsky_sdk::api::app::bsky::graph::get_lists::ParametersData {
                actor: current_did.clone().into(),
                cursor: None,
                limit: Some(max_list_fetch_limit()?),
                purposes: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let mut memberships = Vec::new();

    // For each list, check if subject is a member
    for list in lists_response.data.lists {
        let list_details = agent
            .api
            .app
            .bsky
            .graph
            .get_list(
                bsky_sdk::api::app::bsky::graph::get_list::ParametersData {
                    list: list.uri.clone(),
                    cursor: None,
                    limit: Some(max_list_fetch_limit()?),
                }
                .into(),
            )
            .await
            .map_err(|e| AppError::ApiError(e.to_string()))?;

        // Find the subject in this list's members
        for item in list_details.data.items {
            if item.subject.did.to_string() == subject_did {
                memberships.push(ListMembership {
                    list_uri: list.uri.to_string(),
                    listitem_uri: item.uri.to_string(),
                });
                break;
            }
        }
    }

    Ok(SubjectMembershipsResponse { memberships })
}

#[derive(Deserialize)]
pub struct CreateListRequest {
    pub name: String,
    pub purpose: String,
    pub description: Option<String>,
}

#[derive(Serialize)]
pub struct CreateListResponse {
    pub uri: String,
    pub cid: String,
}

/// Create a new list
#[tauri::command]
pub async fn create_list(
    agent_state: State<'_, AgentState>,
    request: CreateListRequest,
) -> Result<CreateListResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let purpose: ListPurpose = match request.purpose.as_str() {
        "modlist" => "app.bsky.graph.defs#modlist",
        _ => "app.bsky.graph.defs#curatelist",
    }
    .parse()
    .map_err(|_| AppError::ApiError("Invalid list purpose".into()))?;

    let description = request.description.filter(|d| !d.is_empty());

    let record_data = ListRecordData {
        name: request.name,
        purpose,
        description,
        created_at: Datetime::now(),
        avatar: None,
        description_facets: None,
        labels: None,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let result = agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.graph.list"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid list NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(CreateListResponse {
        uri: result.data.uri.to_string(),
        cid: result.data.cid.as_ref().to_string(),
    })
}

#[derive(Deserialize)]
pub struct UpdateListRequest {
    pub list_uri: String,
    pub name: String,
    pub description: Option<String>,
}

/// Update an existing list
#[tauri::command]
pub async fn update_list(
    agent_state: State<'_, AgentState>,
    request: UpdateListRequest,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;
    let rkey_str = parse_rkey_from_uri(&request.list_uri)?;
    let rkey = RecordKey::from_str(&rkey_str)
        .map_err(|_| AppError::ApiError("Invalid record key".into()))?;

    // First get the existing record to preserve fields
    let existing = agent
        .api
        .app
        .bsky
        .graph
        .get_list(
            bsky_sdk::api::app::bsky::graph::get_list::ParametersData {
                list: request
                    .list_uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid list URI".into()))?,
                cursor: None,
                limit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let purpose = existing.data.list.purpose.clone();
    let description = request.description.filter(|d| !d.is_empty());

    let record_data = ListRecordData {
        name: request.name,
        purpose,
        description,
        created_at: Datetime::now(),
        avatar: None,
        description_facets: None,
        labels: None,
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    agent
        .api
        .com
        .atproto
        .repo
        .put_record(
            put_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.graph.list"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid list NSID".into()))?,
                record,
                rkey,
                swap_commit: None,
                swap_record: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

/// Delete a list
#[tauri::command]
pub async fn delete_list(
    agent_state: State<'_, AgentState>,
    list_uri: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;
    let rkey_str = parse_rkey_from_uri(&list_uri)?;
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
                collection: "app.bsky.graph.list"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid list NSID".into()))?,
                rkey,
                swap_commit: None,
                swap_record: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

#[derive(Deserialize)]
pub struct AddListMemberRequest {
    pub list_uri: String,
    pub subject_did: String,
}

#[derive(Serialize)]
pub struct AddListMemberResponse {
    pub uri: String,
}

/// Add a member to a list
#[tauri::command]
pub async fn add_list_member(
    agent_state: State<'_, AgentState>,
    request: AddListMemberRequest,
) -> Result<AddListMemberResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;

    let record_data = ListItemRecordData {
        list: request
            .list_uri
            .parse()
            .map_err(|_| AppError::ApiError("Invalid list URI".into()))?,
        subject: request
            .subject_did
            .parse()
            .map_err(|_| AppError::ApiError("Invalid subject DID".into()))?,
        created_at: Datetime::now(),
    };

    let record = record_data
        .try_into_unknown()
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let result = agent
        .api
        .com
        .atproto
        .repo
        .create_record(
            create_record::InputData {
                repo: AtIdentifier::Did(did),
                collection: "app.bsky.graph.listitem"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid listitem NSID".into()))?,
                record,
                rkey: None,
                swap_commit: None,
                validate: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(AddListMemberResponse {
        uri: result.data.uri.to_string(),
    })
}

/// Remove a member from a list
#[tauri::command]
pub async fn remove_list_member(
    agent_state: State<'_, AgentState>,
    listitem_uri: String,
) -> Result<(), AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let did = current_repo_did()?;
    let rkey_str = parse_rkey_from_uri(&listitem_uri)?;
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
                collection: "app.bsky.graph.listitem"
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid listitem NSID".into()))?,
                rkey,
                swap_commit: None,
                swap_record: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(())
}

#[derive(Deserialize)]
pub struct GetListFeedRequest {
    pub list_uri: String,
    #[serde(default = "default_feed_limit")]
    pub limit: u8,
    pub cursor: Option<String>,
}

fn default_feed_limit() -> u8 {
    50
}

#[derive(Serialize)]
pub struct ListFeedPost {
    pub uri: String,
    pub cid: String,
    pub author_did: String,
    pub author_handle: String,
    pub author_display_name: Option<String>,
    pub author_avatar: Option<String>,
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
}

#[derive(Serialize)]
pub struct ListFeedResponse {
    pub posts: Vec<ListFeedPost>,
    pub cursor: Option<String>,
}

fn extract_post_text(post: &bsky_sdk::api::app::bsky::feed::defs::PostView) -> String {
    if let Ok(json) = serde_json::to_value(&post.record) {
        if let Some(text) = json.get("text").and_then(|v| v.as_str()) {
            return text.to_string();
        }
    }
    String::new()
}

fn extract_created_at(post: &bsky_sdk::api::app::bsky::feed::defs::PostView) -> String {
    if let Ok(json) = serde_json::to_value(&post.record) {
        if let Some(created) = json.get("createdAt").and_then(|v| v.as_str()) {
            return created.to_string();
        }
    }
    String::new()
}

/// Get feed of posts from list members
#[tauri::command]
pub async fn get_list_feed(
    agent_state: State<'_, AgentState>,
    request: GetListFeedRequest,
) -> Result<ListFeedResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    let limit_val = request.limit.max(1).min(100);
    let limit = bsky_sdk::api::types::LimitedNonZeroU8::<100>::try_from(limit_val).ok();

    let response = agent
        .api
        .app
        .bsky
        .feed
        .get_list_feed(
            bsky_sdk::api::app::bsky::feed::get_list_feed::ParametersData {
                list: request
                    .list_uri
                    .parse()
                    .map_err(|_| AppError::ApiError("Invalid list URI".into()))?,
                cursor: request.cursor,
                limit,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let posts: Vec<ListFeedPost> = response
        .data
        .feed
        .iter()
        .map(|feed_view| {
            let post = &feed_view.post;
            let (is_repost, reposted_by_handle, reposted_by_display_name) =
                super::timeline::extract_repost_context(feed_view);
            ListFeedPost {
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
            }
        })
        .collect();

    Ok(ListFeedResponse {
        posts,
        cursor: response.data.cursor,
    })
}
