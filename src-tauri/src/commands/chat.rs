use crate::commands::auth::AgentState;
use crate::error::AppError;
use bsky_sdk::api::types::string::Did;
use bsky_sdk::api::types::LimitedNonZeroU8;
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use tauri::State;

const CHAT_PROXY_DID: &str = "did:web:api.bsky.chat";
const CHAT_SERVICE_TYPE: &str = "bsky_chat";

/// Convert datetime string to ISO 8601 format for JavaScript Date parsing
fn format_datetime_for_js(dt_str: &str) -> String {
    // The Bluesky SDK's Datetime type should already be in ISO 8601 format
    // Try to parse and reformat to ensure it's valid
    if let Ok(dt) = DateTime::parse_from_rfc3339(dt_str) {
        return dt.to_rfc3339();
    }
    // Try the format used by some Bluesky API responses (same as notifications fix)
    if let Ok(dt) = DateTime::parse_from_str(dt_str, "%Y-%m-%d %H:%M:%S%.f %z") {
        return dt.to_rfc3339();
    }
    // If it's already in a format JavaScript can parse, return it as-is
    // Common ISO 8601 formats
    if dt_str.contains('T')
        && (dt_str.ends_with('Z') || dt_str.contains('+') || dt_str.contains('-'))
    {
        return dt_str.to_string();
    }
    // Try other formats
    if let Ok(dt) = DateTime::parse_from_rfc2822(dt_str) {
        return dt.to_rfc3339();
    }
    // Last resort: return original
    dt_str.to_string()
}

#[derive(Serialize)]
pub struct ConversationInfo {
    pub id: String,
    pub rev: String,
    pub members: Vec<ConversationMember>,
    pub last_message: Option<MessageInfo>,
    pub unread_count: u32,
    pub muted: bool,
}

#[derive(Serialize)]
pub struct ConversationMember {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Serialize)]
pub struct MessageInfo {
    pub id: String,
    pub rev: String,
    pub sender_did: String,
    pub text: String,
    pub sent_at: String,
}

#[derive(Serialize)]
pub struct ConversationsResponse {
    pub conversations: Vec<ConversationInfo>,
    pub cursor: Option<String>,
}

/// Get list of DM conversations
#[tauri::command]
pub async fn get_conversations(
    agent_state: State<'_, AgentState>,
    cursor: Option<String>,
) -> Result<ConversationsResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);

    let response = chat_api
        .chat
        .bsky
        .convo
        .list_convos(
            bsky_sdk::api::chat::bsky::convo::list_convos::ParametersData {
                cursor,
                limit: None,
                read_state: None,
                status: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let conversations: Vec<ConversationInfo> = response
        .data
        .convos
        .iter()
        .map(|c| {
            let members: Vec<ConversationMember> = c
                .members
                .iter()
                .map(|m| ConversationMember {
                    did: m.did.to_string(),
                    handle: m.handle.to_string(),
                    display_name: m.display_name.clone(),
                    avatar: m.avatar.clone(),
                })
                .collect();

            let last_message = c.last_message.as_ref().and_then(|lm| {
                use bsky_sdk::api::chat::bsky::convo::defs::ConvoViewLastMessageRefs;
                use bsky_sdk::api::types::Union;

                match lm {
                    Union::Refs(ConvoViewLastMessageRefs::MessageView(mv)) => Some(MessageInfo {
                        id: mv.id.clone(),
                        rev: mv.rev.clone(),
                        sender_did: mv.sender.did.to_string(),
                        text: mv.text.clone(),
                        sent_at: format_datetime_for_js(&mv.sent_at.as_ref().to_string()),
                    }),
                    _ => None,
                }
            });

            ConversationInfo {
                id: c.id.clone(),
                rev: c.rev.clone(),
                members,
                last_message,
                unread_count: c.unread_count as u32,
                muted: c.muted,
            }
        })
        .collect();

    Ok(ConversationsResponse {
        conversations,
        cursor: response.data.cursor,
    })
}

#[derive(Deserialize)]
pub struct GetMessagesRequest {
    pub convo_id: String,
    pub cursor: Option<String>,
}

#[derive(Serialize)]
pub struct MessagesResponse {
    pub messages: Vec<MessageInfo>,
    pub cursor: Option<String>,
}

/// Get messages in a conversation
#[tauri::command]
pub async fn get_messages(
    agent_state: State<'_, AgentState>,
    request: GetMessagesRequest,
) -> Result<MessagesResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);

    let response = chat_api
        .chat
        .bsky
        .convo
        .get_messages(
            bsky_sdk::api::chat::bsky::convo::get_messages::ParametersData {
                convo_id: request.convo_id,
                cursor: request.cursor,
                limit: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    use bsky_sdk::api::chat::bsky::convo::get_messages::OutputMessagesItem;
    use bsky_sdk::api::types::Union;

    let messages: Vec<MessageInfo> = response
        .data
        .messages
        .iter()
        .filter_map(|m| match m {
            Union::Refs(OutputMessagesItem::ChatBskyConvoDefsMessageView(mv)) => {
                Some(MessageInfo {
                    id: mv.id.clone(),
                    rev: mv.rev.clone(),
                    sender_did: mv.sender.did.to_string(),
                    text: mv.text.clone(),
                    sent_at: format_datetime_for_js(&mv.sent_at.as_ref().to_string()),
                })
            }
            _ => None,
        })
        .collect();

    Ok(MessagesResponse {
        messages,
        cursor: response.data.cursor,
    })
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub convo_id: String,
    pub text: String,
}

/// Send a message in a conversation
#[tauri::command]
pub async fn send_message(
    agent_state: State<'_, AgentState>,
    request: SendMessageRequest,
) -> Result<MessageInfo, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);

    let response = chat_api
        .chat
        .bsky
        .convo
        .send_message(
            bsky_sdk::api::chat::bsky::convo::send_message::InputData {
                convo_id: request.convo_id,
                message: bsky_sdk::api::chat::bsky::convo::defs::MessageInputData {
                    embed: None,
                    facets: None,
                    text: request.text,
                }
                .into(),
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(MessageInfo {
        id: response.data.id,
        rev: response.data.rev,
        sender_did: response.data.sender.did.to_string(),
        text: response.data.text,
        sent_at: format_datetime_for_js(&response.data.sent_at.as_ref().to_string()),
    })
}

#[derive(Deserialize)]
pub struct GetConvoForMembersRequest {
    pub members: Vec<String>,
}

/// Get or create a conversation with specific members
#[tauri::command]
pub async fn get_convo_for_members(
    agent_state: State<'_, AgentState>,
    request: GetConvoForMembersRequest,
) -> Result<ConversationInfo, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);

    // Parse member DIDs
    let member_dids: Vec<Did> = request
        .members
        .iter()
        .map(|m| {
            m.parse()
                .map_err(|_| AppError::ApiError(format!("Invalid DID: {}", m)))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let response = chat_api
        .chat
        .bsky
        .convo
        .get_convo_for_members(
            bsky_sdk::api::chat::bsky::convo::get_convo_for_members::ParametersData {
                members: member_dids,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let members: Vec<ConversationMember> = response
        .data
        .convo
        .members
        .iter()
        .map(|m| ConversationMember {
            did: m.did.to_string(),
            handle: m.handle.to_string(),
            display_name: m.display_name.clone(),
            avatar: m.avatar.clone(),
        })
        .collect();

    let last_message = response.data.convo.last_message.as_ref().and_then(|lm| {
        use bsky_sdk::api::chat::bsky::convo::defs::ConvoViewLastMessageRefs;
        use bsky_sdk::api::types::Union;

        match lm {
            Union::Refs(ConvoViewLastMessageRefs::MessageView(mv)) => Some(MessageInfo {
                id: mv.id.clone(),
                rev: mv.rev.clone(),
                sender_did: mv.sender.did.to_string(),
                text: mv.text.clone(),
                sent_at: format_datetime_for_js(&mv.sent_at.as_ref().to_string()),
            }),
            _ => None,
        }
    });

    Ok(ConversationInfo {
        id: response.data.convo.id.clone(),
        rev: response.data.convo.rev.clone(),
        members,
        last_message,
        unread_count: response.data.convo.unread_count as u32,
        muted: response.data.convo.muted,
    })
}

#[derive(Deserialize)]
pub struct GetConvoRequest {
    pub convo_id: String,
}

/// Get a specific conversation by ID
#[tauri::command]
pub async fn get_convo(
    agent_state: State<'_, AgentState>,
    request: GetConvoRequest,
) -> Result<ConversationInfo, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);

    let response = chat_api
        .chat
        .bsky
        .convo
        .get_convo(
            bsky_sdk::api::chat::bsky::convo::get_convo::ParametersData {
                convo_id: request.convo_id,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let members: Vec<ConversationMember> = response
        .data
        .convo
        .members
        .iter()
        .map(|m| ConversationMember {
            did: m.did.to_string(),
            handle: m.handle.to_string(),
            display_name: m.display_name.clone(),
            avatar: m.avatar.clone(),
        })
        .collect();

    let last_message = response.data.convo.last_message.as_ref().and_then(|lm| {
        use bsky_sdk::api::chat::bsky::convo::defs::ConvoViewLastMessageRefs;
        use bsky_sdk::api::types::Union;

        match lm {
            Union::Refs(ConvoViewLastMessageRefs::MessageView(mv)) => Some(MessageInfo {
                id: mv.id.clone(),
                rev: mv.rev.clone(),
                sender_did: mv.sender.did.to_string(),
                text: mv.text.clone(),
                sent_at: format_datetime_for_js(&mv.sent_at.as_ref().to_string()),
            }),
            _ => None,
        }
    });

    Ok(ConversationInfo {
        id: response.data.convo.id.clone(),
        rev: response.data.convo.rev.clone(),
        members,
        last_message,
        unread_count: response.data.convo.unread_count as u32,
        muted: response.data.convo.muted,
    })
}

#[derive(Deserialize)]
pub struct UpdateReadRequest {
    pub convo_id: String,
    pub message_id: String,
}

#[derive(Serialize)]
pub struct UpdateReadResponse {
    pub convo_id: String,
    pub unread_count: u32,
}

/// Mark a conversation as read up to a specific message
#[tauri::command]
pub async fn update_read(
    agent_state: State<'_, AgentState>,
    request: UpdateReadRequest,
) -> Result<UpdateReadResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);

    let response = chat_api
        .chat
        .bsky
        .convo
        .update_read(
            bsky_sdk::api::chat::bsky::convo::update_read::InputData {
                convo_id: request.convo_id.clone(),
                message_id: Some(request.message_id),
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    Ok(UpdateReadResponse {
        convo_id: response.data.convo.id.clone(),
        unread_count: response.data.convo.unread_count as u32,
    })
}

#[derive(Serialize)]
pub struct ChatUnreadCountResponse {
    pub count: u32,
}

/// Get total unread message count across all conversations
#[tauri::command]
pub async fn get_chat_unread_count(
    agent_state: State<'_, AgentState>,
) -> Result<ChatUnreadCountResponse, AppError> {
    let guard = agent_state.lock().await;
    let agent = guard.as_ref().ok_or(AppError::SessionNotFound)?;

    // Use api_with_proxy to get a service with proxy header set (avoids polluting shared agent state)
    let chat_did: Did = CHAT_PROXY_DID
        .parse()
        .map_err(|_| AppError::ApiError("Invalid chat proxy DID".into()))?;
    let chat_api = agent.api_with_proxy(chat_did, CHAT_SERVICE_TYPE);
    let max_limit = LimitedNonZeroU8::<100>::try_from(100_u8)
        .map_err(|_| AppError::InternalError("Invalid static chat unread limit".into()))?;

    // Fetch conversations and sum unread counts
    let response = chat_api
        .chat
        .bsky
        .convo
        .list_convos(
            bsky_sdk::api::chat::bsky::convo::list_convos::ParametersData {
                cursor: None,
                limit: Some(max_limit),
                read_state: None,
                status: None,
            }
            .into(),
        )
        .await
        .map_err(|e| AppError::ApiError(e.to_string()))?;

    let total_unread: u32 = response
        .data
        .convos
        .iter()
        .map(|c| c.unread_count as u32)
        .sum();

    Ok(ChatUnreadCountResponse {
        count: total_unread,
    })
}
