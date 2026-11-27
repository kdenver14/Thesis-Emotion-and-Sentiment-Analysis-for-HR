//! HTTP routes, same contract as deployment/server.py:
//! - POST /trigger  bearer token, {sessionId, videoUrl, ext, callbackUrl}
//! - POST /cancel   bearer token, {sessionId}
//! - POST /infer    multipart "file" upload, for curl testing
//!
//! Errors answer {"detail": "..."} like FastAPI.

use std::path::Path;
use std::sync::Arc;

use axum::Router;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Multipart, State};
use axum::http::{HeaderMap, StatusCode, header::AUTHORIZATION};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::post;
use serde_json::{Map, Value, json};
use tokio::io::AsyncWriteExt;

use crate::jobs::{self, ALLOWED_EXTENSIONS, Meta};

const MAX_UPLOAD_BYTES: usize = 100 * 1024 * 1024; // 100 MB (/infer)
const MULTIPART_OVERHEAD: usize = 1024 * 1024; // room for the form framing around the file

type AppState = Arc<jobs::State>;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/trigger", post(trigger))
        .route("/cancel", post(cancel))
        .route("/infer", post(infer).layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD)))
        .with_state(state)
}

/// FastAPI-style error: the status plus {"detail": message}.
struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"detail": self.1}))).into_response()
    }
}

fn error(status: StatusCode, message: impl Into<String>) -> ApiError {
    ApiError(status, message.into())
}

fn check_token(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let raw = headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()).unwrap_or("");
    let token = raw.strip_prefix("Bearer ").unwrap_or(raw).trim();
    if jobs::same_secret(token.as_bytes(), state.cfg.token.as_bytes()) {
        Ok(())
    } else {
        Err(error(StatusCode::UNAUTHORIZED, "Unauthorized"))
    }
}

fn json_object(body: &Bytes) -> Result<Map<String, Value>, ApiError> {
    match serde_json::from_slice(body) {
        Ok(Value::Object(map)) => Ok(map),
        _ => Err(error(StatusCode::UNPROCESSABLE_ENTITY, "Body must be a JSON object")),
    }
}

fn session_id(job: &Map<String, Value>) -> Result<String, ApiError> {
    match job.get("sessionId").and_then(Value::as_str) {
        Some(sid) if jobs::valid_session_id(sid) => Ok(sid.to_string()),
        _ => Err(error(StatusCode::BAD_REQUEST, "Invalid sessionId")),
    }
}

fn parse_job(job: &Map<String, Value>) -> Result<(Meta, String), ApiError> {
    let text = |key: &str| job.get(key).and_then(Value::as_str).filter(|s| !s.is_empty());
    for key in ["sessionId", "videoUrl", "callbackUrl"] {
        if text(key).is_none() {
            return Err(error(StatusCode::BAD_REQUEST, format!("Missing {key}")));
        }
    }
    let session_id = session_id(job)?;
    let ext = match job.get("ext") {
        None => ".mp4".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    };
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(error(StatusCode::BAD_REQUEST, format!("Unsupported file type: {ext}")));
    }
    let callback_url = text("callbackUrl").unwrap_or_default().to_string();
    Ok((Meta { session_id, ext, callback_url }, text("videoUrl").unwrap_or_default().to_string()))
}

async fn trigger(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Result<Json<Value>, ApiError> {
    check_token(&state, &headers)?;
    let (meta, video_url) = parse_job(&json_object(&body)?)?;
    state.queue_download(meta, video_url);
    Ok(Json(json!({"queued": true})))
}

async fn cancel(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Result<Json<Value>, ApiError> {
    check_token(&state, &headers)?;
    let sid = session_id(&json_object(&body)?)?;
    let running = state.cancel(&sid);
    log_info!("Cancel requested for {sid} ({})", if running { "running, stopped" } else { "not running" });
    Ok(Json(json!({"cancelled": true})))
}

struct TempFile(std::path::PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn extension_of(filename: &str) -> String {
    Path::new(filename)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

/// Streams the upload to disk with a running byte cap, so a hostile body
/// cannot fill memory or disk.
async fn save_upload(field: &mut axum::extract::multipart::Field<'_>, dest: &Path) -> Result<(), ApiError> {
    let failed = |_| error(StatusCode::INTERNAL_SERVER_ERROR, "Inference failed");
    let mut file = tokio::fs::File::create(dest).await.map_err(failed)?;
    let mut total = 0usize;
    while let Some(chunk) = field.chunk().await.map_err(|_| error(StatusCode::BAD_REQUEST, "Upload failed"))? {
        total += chunk.len();
        if total > MAX_UPLOAD_BYTES {
            return Err(error(StatusCode::PAYLOAD_TOO_LARGE, "File exceeds the 100 MB upload limit"));
        }
        file.write_all(&chunk).await.map_err(failed)?;
    }
    file.flush().await.map_err(failed)
}

async fn infer(State(state): State<AppState>, mut form: Multipart) -> Result<Json<Value>, ApiError> {
    while let Ok(Some(mut field)) = form.next_field().await {
        if field.name() != Some("file") {
            continue;
        }
        let ext = extension_of(field.file_name().unwrap_or(""));
        if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
            return Err(error(StatusCode::BAD_REQUEST, format!("Unsupported file type: {ext}")));
        }
        // Removed when the handler ends, also if the client disconnects mid-way.
        let tmp = TempFile(std::env::temp_dir().join(format!("infer-{}{ext}", uuid::Uuid::new_v4())));
        save_upload(&mut field, &tmp.0).await?;
        // Same single analysis slot as /trigger jobs.
        let payload = state.infer(format!("infer:{}", uuid::Uuid::new_v4()), tmp.0.clone()).await;
        return match payload.as_ref().and_then(|p| p.get("result")) {
            Some(result) => Ok(Json(result.clone())),
            None => {
                let reason = payload.as_ref().and_then(|p| p.get("error")).map(Value::to_string).unwrap_or_default();
                log_error!("Inference failed: {reason}");
                Err(error(StatusCode::INTERNAL_SERVER_ERROR, "Inference failed"))
            }
        };
    }
    Err(error(StatusCode::UNPROCESSABLE_ENTITY, "Missing file"))
}

#[cfg(test)]
mod tests {
    use super::extension_of;

    #[test]
    fn extension_matches_python_splitext_lower() {
        assert_eq!(extension_of("Clip.MP4"), ".mp4");
        assert_eq!(extension_of("noext"), "");
        assert_eq!(extension_of(".mp4"), ""); // hidden file: no extension, like os.path.splitext
        assert_eq!(extension_of("a.tar.mov"), ".mov");
    }
}
