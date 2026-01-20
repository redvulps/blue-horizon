//! Custom session store that persists to the OS keyring.
//!
//! This ensures that session tokens (including refreshed tokens) are always
//! persisted to the keyring, allowing sessions to survive app restarts and
//! automatic token refreshes.

use crate::error::AppError;
use crate::session::{store_session, StoredSession};
use atrium_common::store::Store;
use atrium_xrpc::types::AuthorizationToken;
use bsky_sdk::api::agent::atp_agent::store::AtpSessionStore;
use bsky_sdk::api::agent::atp_agent::AtpSession;
use bsky_sdk::api::agent::AuthorizationProvider;
use bsky_sdk::api::types::string::{Did, Handle};
use std::sync::Arc;
use tokio::sync::RwLock;

/// A session store that persists to the OS keyring.
///
/// This store:
/// - Keeps session in memory for fast access
/// - Persists session to keyring on every update (including token refresh)
/// - Loads initial session from keyring when created
pub struct KeyringSessionStore {
    /// In-memory cache of the current session
    session: Arc<RwLock<Option<AtpSession>>>,
    /// Service URL for this session (needed for keyring serialization)
    service_url: Arc<RwLock<String>>,
}

impl KeyringSessionStore {
    /// Create a new KeyringSessionStore, optionally loading an existing session from keyring.
    pub fn new() -> Self {
        Self {
            session: Arc::new(RwLock::new(None)),
            service_url: Arc::new(RwLock::new("https://bsky.social".to_string())),
        }
    }

    /// Create a KeyringSessionStore with an initial session loaded from keyring.
    pub fn from_stored_session(stored: &StoredSession) -> Result<(Self, AtpSession), AppError> {
        let did: Did = stored
            .did
            .parse()
            .map_err(|e| AppError::InternalError(format!("Invalid DID: {:?}", e)))?;
        let handle: Handle = stored
            .handle
            .parse()
            .map_err(|e| AppError::InternalError(format!("Invalid handle: {:?}", e)))?;

        let session = AtpSession {
            data: bsky_sdk::api::com::atproto::server::create_session::OutputData {
                access_jwt: stored.access_jwt.clone(),
                refresh_jwt: stored.refresh_jwt.clone(),
                did,
                handle,
                active: Some(true),
                did_doc: None,
                email: None,
                email_auth_factor: None,
                email_confirmed: None,
                status: None,
            },
            extra_data: ipld_core::ipld::Ipld::Null,
        };

        let store = Self {
            session: Arc::new(RwLock::new(Some(session.clone()))),
            service_url: Arc::new(RwLock::new(stored.service_url.clone())),
        };

        Ok((store, session))
    }

    /// Set the service URL (needed for persisting to keyring)
    pub async fn set_service_url(&self, url: String) {
        let mut service_url = self.service_url.write().await;
        *service_url = url;
    }

    /// Persist current session to keyring
    async fn persist_to_keyring(&self, session: &AtpSession) -> Result<(), AppError> {
        let service_url = self.service_url.read().await.clone();

        let stored = StoredSession {
            did: session.data.did.to_string(),
            handle: session.data.handle.to_string(),
            access_jwt: session.data.access_jwt.clone(),
            refresh_jwt: session.data.refresh_jwt.clone(),
            service_url,
        };

        println!(
            "KeyringSessionStore: persisting session to keyring for {}",
            stored.handle
        );
        store_session(&stored)?;
        println!("KeyringSessionStore: session persisted successfully");

        Ok(())
    }
}

impl Default for KeyringSessionStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Custom error type for the store
#[derive(Debug, Clone)]
pub struct StoreError(pub String);

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "StoreError: {}", self.0)
    }
}

impl std::error::Error for StoreError {}

impl Store<(), AtpSession> for KeyringSessionStore {
    type Error = StoreError;

    async fn get(&self, _key: &()) -> Result<Option<AtpSession>, Self::Error> {
        let session = self.session.read().await;
        Ok(session.clone())
    }

    async fn set(&self, _key: (), value: AtpSession) -> Result<(), Self::Error> {
        println!("KeyringSessionStore::set() called - persisting updated tokens");

        // Persist to keyring first
        if let Err(e) = self.persist_to_keyring(&value).await {
            println!("KeyringSessionStore: failed to persist to keyring: {}", e);
            return Err(StoreError(e.to_string()));
        }

        // Update in-memory cache
        let mut session = self.session.write().await;
        *session = Some(value);

        Ok(())
    }

    async fn del(&self, _key: &()) -> Result<(), Self::Error> {
        let mut session = self.session.write().await;
        *session = None;
        // Note: We don't clear keyring here - that's handled by logout
        Ok(())
    }

    async fn clear(&self) -> Result<(), Self::Error> {
        let mut session = self.session.write().await;
        *session = None;
        Ok(())
    }
}

impl AuthorizationProvider for KeyringSessionStore {
    async fn authorization_token(&self, is_refresh: bool) -> Option<AuthorizationToken> {
        let session = self.session.read().await;
        session.as_ref().map(|s| {
            let token = if is_refresh {
                s.data.refresh_jwt.clone()
            } else {
                s.data.access_jwt.clone()
            };
            AuthorizationToken::Bearer(token)
        })
    }
}

impl AtpSessionStore for KeyringSessionStore {}
