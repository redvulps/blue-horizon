use crate::error::AppError;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "blue-horizon";
const SESSION_KEY: &str = "session";

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub did: String,
    pub handle: String,
    pub access_jwt: String,
    pub refresh_jwt: String,
    pub service_url: String,
}

#[derive(Clone, Serialize)]
pub struct SessionInfo {
    pub did: String,
    pub handle: String,
    pub service_url: String,
    pub is_authenticated: bool,
}

impl From<&StoredSession> for SessionInfo {
    fn from(session: &StoredSession) -> Self {
        SessionInfo {
            did: session.did.clone(),
            handle: session.handle.clone(),
            service_url: session.service_url.clone(),
            is_authenticated: true,
        }
    }
}

/// Initialize keyring to use persistent storage on Linux
/// This must be called early in the application startup
#[cfg(target_os = "linux")]
pub fn init_keyring() {
    use keyring::credential::CredentialBuilderApi;
    use keyring::secret_service::SsCredentialBuilder;

    let builder = SsCredentialBuilder::default();

    // CredentialPersistence values: 0 = EntryOnly, 1 = ProcessOnly, 2 = UntilLogout, 3 = UntilDelete
    let persistence = builder.persistence();
    println!(
        "Keyring persistence level: {} (3=UntilDelete is persistent)",
        persistence as u8
    );

    // Set the default credential builder for all Entry::new() calls
    keyring::set_default_credential_builder(Box::new(builder));

    println!("Keyring initialized. Target collection: 'default' (persistent)");
}

#[cfg(not(target_os = "linux"))]
pub fn init_keyring() {
    // No special initialization needed on other platforms
}

/// Store session credentials securely in the OS keyring
pub fn store_session(session: &StoredSession) -> Result<(), AppError> {
    println!("Storing session for user: {}", session.handle);

    let json =
        serde_json::to_string(session).map_err(|e| AppError::InternalError(e.to_string()))?;

    println!("Session JSON size: {} bytes", json.len());

    // Use new_with_target to explicitly specify the "default" collection
    // This ensures the credential is stored in the persistent collection
    let entry =
        keyring::Entry::new_with_target("default", SERVICE_NAME, SESSION_KEY).map_err(|e| {
            println!("Failed to create keyring entry: {}", e);
            AppError::KeyringError(e.to_string())
        })?;

    match entry.set_password(&json) {
        Ok(_) => {
            println!("Session stored successfully in keyring");
            // Verify by reading it back immediately
            match entry.get_password() {
                Ok(retrieved) if retrieved == json => {
                    println!("Verification: Successfully retrieved stored session");
                }
                Ok(retrieved) => {
                    println!("Warning: Retrieved data differs from stored data (stored: {}, retrieved: {})", json.len(), retrieved.len());
                }
                Err(e) => {
                    println!("Warning: Could not verify stored session: {}", e);
                }
            }
            Ok(())
        }
        Err(e) => {
            println!("Failed to set password in keyring: {}", e);
            Err(AppError::KeyringError(e.to_string()))
        }
    }
}

/// Retrieve session from OS keyring
pub fn get_stored_session() -> Result<StoredSession, AppError> {
    println!("Attempting to retrieve session from keyring");
    // Use same target to ensure we look in the right collection
    let entry =
        keyring::Entry::new_with_target("default", SERVICE_NAME, SESSION_KEY).map_err(|e| {
            println!("Failed to create keyring entry: {}", e);
            AppError::KeyringError(e.to_string())
        })?;

    match entry.get_password() {
        Ok(json) => {
            println!("Session retrieved from keyring");
            serde_json::from_str(&json).map_err(|e| {
                println!("Failed to parse session json: {}", e);
                AppError::InternalError(e.to_string())
            })
        }
        Err(keyring::Error::NoEntry) => {
            println!("No session found in keyring (NoEntry)");
            Err(AppError::SessionNotFound)
        }
        Err(e) => {
            println!("Failed to get password from keyring: {}", e);
            Err(AppError::SessionNotFound)
        }
    }
}

/// Clear session from OS keyring
pub fn clear_session() -> Result<(), AppError> {
    let entry = keyring::Entry::new_with_target("default", SERVICE_NAME, SESSION_KEY)
        .map_err(|e| AppError::KeyringError(e.to_string()))?;

    // Ignore error if entry doesn't exist
    let _ = entry.delete_credential();

    Ok(())
}
