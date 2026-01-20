use crate::db::DbState;
use crate::error::AppError;
use crate::session::{
    clear_session, get_stored_session, store_session, SessionInfo, StoredSession,
};
use crate::session_store::KeyringSessionStore;
use bsky_sdk::agent::config::Config;
use bsky_sdk::api::types::Object;
use bsky_sdk::BskyAgent;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

// BskyAgent with KeyringSessionStore for persistent session management
// Using atrium_xrpc_client::reqwest::ReqwestClient as the HTTP client
// Mutex serializes all access to the agent
pub type AgentState =
    Arc<Mutex<Option<BskyAgent<atrium_xrpc_client::reqwest::ReqwestClient, KeyringSessionStore>>>>;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub identifier: String,
    pub password: String,
    #[serde(default = "default_service")]
    pub service: String,
}

fn default_service() -> String {
    "https://bsky.social".to_string()
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub did: String,
    pub handle: String,
    pub service: String,
}

/// Login to AT Protocol
#[tauri::command]
pub async fn login(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
    request: LoginRequest,
) -> Result<LoginResponse, AppError> {
    // Create a new KeyringSessionStore for this agent
    let store = KeyringSessionStore::new();
    store.set_service_url(request.service.clone()).await;

    // Create config (proxy_header is set dynamically per-request for chat calls)
    let config = Config {
        endpoint: request.service.clone(),
        session: None,
        labelers_header: None,
        proxy_header: None,
    };

    // Create agent with KeyringSessionStore for persistent session management
    let agent = BskyAgent::builder()
        .config(config)
        .store(store)
        .build()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    // Attempt login - this will automatically persist the session via KeyringSessionStore
    let session = agent
        .login(&request.identifier, &request.password)
        .await
        .map_err(|e| AppError::AuthenticationFailed(e.to_string()))?;

    // Also manually store in our existing format for get_session() to work
    let stored = StoredSession {
        did: session.did.to_string(),
        handle: session.handle.to_string(),
        access_jwt: session.access_jwt.clone(),
        refresh_jwt: session.refresh_jwt.clone(),
        service_url: request.service.clone(),
    };
    store_session(&stored)?;
    println!("Login successful, session stored.");

    // Update agent state
    let mut state = agent_state.lock().await;
    *state = Some(agent);
    drop(state);

    let db = app.state::<DbState>().inner().clone();
    crate::commands::actions::trigger_retry_now(app.clone(), agent_state.inner().clone(), db);

    Ok(LoginResponse {
        did: session.did.to_string(),
        handle: session.handle.to_string(),
        service: request.service,
    })
}

/// Logout and clear session
#[tauri::command]
pub async fn logout(agent_state: State<'_, AgentState>) -> Result<(), AppError> {
    println!("Logout command called");
    clear_session()?;

    let mut state = agent_state.lock().await;
    *state = None;

    Ok(())
}

/// Get current session info (no agent needed)
#[tauri::command]
pub async fn get_session() -> Result<Option<SessionInfo>, AppError> {
    match get_stored_session() {
        Ok(session) => Ok(Some(SessionInfo::from(&session))),
        Err(AppError::SessionNotFound) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Resume session from stored credentials
/// Recreates the agent with the stored access/refresh tokens using KeyringSessionStore
/// which will automatically persist any token refreshes
#[tauri::command]
pub async fn resume_session(
    app: AppHandle,
    agent_state: State<'_, AgentState>,
) -> Result<SessionInfo, AppError> {
    println!("resume_session command called");

    let stored = match get_stored_session() {
        Ok(s) => s,
        Err(e) => {
            println!("resume_session: failed to get stored session: {}", e);
            return Err(e);
        }
    };

    println!("resume_session: found stored session for {}", stored.handle);

    // Create KeyringSessionStore from stored session
    let (store, session) = KeyringSessionStore::from_stored_session(&stored).map_err(|e| {
        println!("resume_session: failed to create session store: {}", e);
        e
    })?;

    // Create config (proxy_header is set dynamically per-request for chat calls)
    let config = Config {
        endpoint: stored.service_url.clone(),
        session: Some(Object::from(session.clone())),
        labelers_header: None,
        proxy_header: None,
    };

    println!("resume_session: rebuilding agent with KeyringSessionStore...");

    // Build the agent with KeyringSessionStore - this enables automatic token refresh
    // and persistence of refreshed tokens
    let agent = BskyAgent::builder()
        .config(config)
        .store(store)
        .build()
        .await
        .map_err(|e| {
            println!("resume_session: failed to build agent: {}", e);
            AppError::AuthenticationFailed(format!("Failed to resume session: {}", e))
        })?;

    // Update agent state
    let mut state = agent_state.lock().await;
    *state = Some(agent);
    drop(state);

    let db = app.state::<DbState>().inner().clone();
    crate::commands::actions::trigger_retry_now(app.clone(), agent_state.inner().clone(), db);

    println!("resume_session: successfully resumed session with persistent token storage");

    Ok(SessionInfo::from(&stored))
}
