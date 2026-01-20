use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Session not found")]
    SessionNotFound,

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Keyring error: {0}")]
    KeyringError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

// Serializable error for frontend
#[derive(Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

impl From<AppError> for ErrorResponse {
    fn from(error: AppError) -> Self {
        let code = match &error {
            AppError::AuthenticationFailed(_) => "AUTH_FAILED",
            AppError::SessionNotFound => "SESSION_NOT_FOUND",
            AppError::NetworkError(_) => "NETWORK_ERROR",
            AppError::ApiError(_) => "API_ERROR",
            AppError::KeyringError(_) => "KEYRING_ERROR",
            AppError::InternalError(_) => "INTERNAL_ERROR",
        };

        ErrorResponse {
            code: code.to_string(),
            message: error.to_string(),
        }
    }
}

impl From<keyring::Error> for AppError {
    fn from(error: keyring::Error) -> Self {
        AppError::KeyringError(error.to_string())
    }
}

// Make AppError work with Tauri commands
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let response: ErrorResponse = self.clone().into();
        response.serialize(serializer)
    }
}

impl Clone for AppError {
    fn clone(&self) -> Self {
        match self {
            AppError::AuthenticationFailed(s) => AppError::AuthenticationFailed(s.clone()),
            AppError::SessionNotFound => AppError::SessionNotFound,
            AppError::NetworkError(s) => AppError::NetworkError(s.clone()),
            AppError::ApiError(s) => AppError::ApiError(s.clone()),
            AppError::KeyringError(s) => AppError::KeyringError(s.clone()),
            AppError::InternalError(s) => AppError::InternalError(s.clone()),
        }
    }
}
