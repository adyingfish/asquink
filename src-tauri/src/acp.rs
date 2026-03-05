use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use crate::database::{CreateMessageRecord, Database, MessageRecord};

const ACP_PROTOCOL_VERSION: u32 = 1;
const REQUEST_TIMEOUT_SECONDS: u64 = 45;

#[derive(Clone)]
pub struct AcpManager {
    sessions: Arc<Mutex<HashMap<String, Arc<AcpSession>>>>,
}

#[derive(Clone, Copy)]
pub struct AcpRuntimeDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub executable_display: &'static str,
    pub install_probe: &'static str,
    pub runtime_probe: &'static str,
    pub supports_cwd_arg: bool,
    pub install_hint: &'static str,
    pub runtime_install_hint: Option<&'static str>,
}

#[derive(Debug, Clone)]
pub enum AcpLaunchTarget {
    Local,
    Wsl {
        distro: String,
        user: Option<String>,
    },
}

impl AcpLaunchTarget {
    pub fn install_target(&self) -> &'static str {
        match self {
            Self::Local => {
                if cfg!(target_os = "windows") {
                    "windows"
                } else {
                    "local"
                }
            }
            Self::Wsl { .. } => "wsl",
        }
    }

    pub fn location_key(&self) -> String {
        match self {
            Self::Local => self.install_target().to_string(),
            Self::Wsl { distro, .. } => format!("wsl:{distro}"),
        }
    }

    pub fn location_label(&self) -> String {
        match self {
            Self::Local => {
                if cfg!(target_os = "windows") {
                    "Windows".to_string()
                } else {
                    "Local".to_string()
                }
            }
            Self::Wsl { distro, .. } => format!("WSL · {distro}"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpRuntimeSummary {
    pub runtime_agent_id: String,
    pub status: String,
    pub protocol_version: Option<String>,
    pub runtime_version: Option<String>,
    pub last_error: Option<String>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpCreateSessionResult {
    pub session_id: String,
    pub runtime_agent_id: String,
    pub runtime_agent_name: String,
    pub acp_runtime_session_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpPromptResult {
    pub message_id: String,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionStatusPayload {
    pub session_id: String,
    pub status: String,
    pub runtime_agent_id: String,
    pub runtime_agent_name: String,
    pub protocol_version: Option<String>,
    pub runtime_version: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpMessageDeltaPayload {
    pub session_id: String,
    pub message_id: String,
    pub role: String,
    pub delta: String,
    pub content: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpMessageCompletePayload {
    pub session_id: String,
    pub message_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionErrorPayload {
    pub session_id: String,
    pub message: String,
    pub fatal: bool,
}

struct AcpSession {
    session_id: String,
    runtime_agent_id: String,
    runtime_agent_name: String,
    launch_target: AcpLaunchTarget,
    working_dir: String,
    db: Database,
    app_handle: AppHandle,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_request_id: AtomicU64,
    protocol_version: Mutex<Option<String>>,
    runtime_version: Mutex<Option<String>>,
    acp_session_id: Mutex<Option<String>>,
    status: Mutex<String>,
    last_error: Mutex<Option<String>>,
    active_assistant_message_id: Mutex<Option<String>>,
    active_assistant_content: Mutex<String>,
    pid: Option<u32>,
}

pub fn acp_runtime_definitions() -> &'static [AcpRuntimeDefinition] {
    &[
        AcpRuntimeDefinition {
            id: "claude",
            name: "Claude Code ACP",
            executable_display: "claude-code-acp",
            install_probe: "claude",
            runtime_probe: "claude-code-acp",
            supports_cwd_arg: false,
            install_hint: "npm install -g @anthropic-ai/claude-code",
            runtime_install_hint: Some("npm install -g @zed-industries/claude-code-acp"),
        },
        AcpRuntimeDefinition {
            id: "codex",
            name: "Codex ACP",
            executable_display: "codex-acp",
            install_probe: "codex",
            runtime_probe: "codex-acp",
            supports_cwd_arg: false,
            install_hint: "npm install -g @openai/codex",
            runtime_install_hint: Some("npm install -g @zed-industries/codex-acp"),
        },
        AcpRuntimeDefinition {
            id: "gemini",
            name: "Gemini ACP",
            executable_display: "gemini --experimental-acp",
            install_probe: "gemini",
            runtime_probe: "gemini",
            supports_cwd_arg: false,
            install_hint: "npm install -g @google/gemini-cli",
            runtime_install_hint: None,
        },
        AcpRuntimeDefinition {
            id: "opencode",
            name: "OpenCode ACP",
            executable_display: "opencode acp",
            install_probe: "opencode",
            runtime_probe: "opencode",
            supports_cwd_arg: true,
            install_hint: "npm install -g opencode",
            runtime_install_hint: None,
        },
    ]
}

pub fn acp_runtime_definition(id: &str) -> Option<AcpRuntimeDefinition> {
    acp_runtime_definitions()
        .iter()
        .copied()
        .find(|definition| definition.id == id)
}

impl AcpManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        session_id: String,
        runtime_agent_id: String,
        previous_acp_runtime_session_id: Option<String>,
        launch_target: AcpLaunchTarget,
        working_dir: String,
        db: Database,
        app_handle: AppHandle,
    ) -> Result<AcpCreateSessionResult, String> {
        if let Some(existing) = self.sessions.lock().await.get(&session_id).cloned() {
            let acp_runtime_session_id = existing
                .acp_session_id
                .lock()
                .await
                .clone()
                .ok_or("ACP session exists but runtime session id is unavailable".to_string())?;
            let status = existing.current_status().await;
            return Ok(AcpCreateSessionResult {
                session_id,
                runtime_agent_id: existing.runtime_agent_id.clone(),
                runtime_agent_name: existing.runtime_agent_name.clone(),
                acp_runtime_session_id,
                status,
            });
        }

        let runtime_definition = acp_runtime_definition(&runtime_agent_id)
            .ok_or_else(|| format!("Unsupported ACP runtime: {runtime_agent_id}"))?;

        let mut command = build_runtime_command(runtime_definition, &launch_target, &working_dir)?;
        let mut child = command
            .spawn()
            .map_err(|err| format!("Failed to start ACP runtime: {err}"))?;
        let pid = child.id();
        let stdin = child.stdin.take().ok_or("ACP runtime stdin unavailable")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("ACP runtime stdout unavailable")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("ACP runtime stderr unavailable")?;

        let session = Arc::new(AcpSession {
            session_id: session_id.clone(),
            runtime_agent_id: runtime_definition.id.to_string(),
            runtime_agent_name: runtime_definition.name.to_string(),
            launch_target,
            working_dir,
            db,
            app_handle,
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next_request_id: AtomicU64::new(1),
            protocol_version: Mutex::new(None),
            runtime_version: Mutex::new(None),
            acp_session_id: Mutex::new(None),
            status: Mutex::new("starting".to_string()),
            last_error: Mutex::new(None),
            active_assistant_message_id: Mutex::new(None),
            active_assistant_content: Mutex::new(String::new()),
            pid,
        });

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), Arc::clone(&session));

        session.emit_status().await;

        self.spawn_reader(Arc::clone(&session), stdout);
        self.spawn_stderr_reader(Arc::clone(&session), stderr);

        let handshake_result: Result<AcpCreateSessionResult, String> = async {
            session.set_status("handshaking").await;
            let reusable_acp_session_id = previous_acp_runtime_session_id
                .as_ref()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string());

            let initialize_result = session
                .request(
                    "initialize",
                    json!({
                        "protocolVersion": ACP_PROTOCOL_VERSION,
                        "clientInfo": {
                            "name": "ASquink",
                            "version": env!("CARGO_PKG_VERSION"),
                        },
                        "capabilities": {
                            "loadSession": reusable_acp_session_id.is_some(),
                            "promptCapabilities": {
                                "image": false,
                                "audio": false,
                            }
                        }
                    }),
                )
                .await?;
            let runtime_supports_load_session = bool_at(
                &initialize_result,
                &[
                    "agentCapabilities.loadSession",
                    "capabilities.loadSession",
                    "loadSession",
                ],
            )
            .unwrap_or(false);

            let protocol_version = string_at(
                &initialize_result,
                &["protocolVersion", "serverInfo.protocolVersion"],
            );
            let runtime_version = string_at(
                &initialize_result,
                &["agentInfo.version", "serverInfo.version", "version"],
            );
            {
                let mut stored = session.protocol_version.lock().await;
                *stored = protocol_version;
            }
            {
                let mut stored = session.runtime_version.lock().await;
                *stored = runtime_version;
            }

            let acp_session_id = if let Some(existing_acp_session_id) = reusable_acp_session_id
                .filter(|_| runtime_supports_load_session)
            {
                match session
                    .request(
                        "session/load",
                        json!({
                            "sessionId": existing_acp_session_id,
                            "cwd": session.working_dir.clone(),
                            "mcpServers": [],
                        }),
                    )
                    .await
                {
                    Ok(load_result) => {
                        string_at(&load_result, &["sessionId", "session.id", "id"]).unwrap_or(
                            existing_acp_session_id,
                        )
                    }
                    Err(_) => {
                        let new_session_result = session
                            .request(
                                "session/new",
                                json!({
                                    "cwd": session.working_dir.clone(),
                                    "mcpServers": [],
                                }),
                            )
                            .await?;

                        string_at(&new_session_result, &["sessionId", "session.id", "id"])
                            .ok_or("ACP runtime did not return a session id".to_string())?
                    }
                }
            } else {
                let new_session_result = session
                    .request(
                        "session/new",
                        json!({
                            "cwd": session.working_dir.clone(),
                            "mcpServers": [],
                        }),
                    )
                    .await?;

                string_at(&new_session_result, &["sessionId", "session.id", "id"])
                    .ok_or("ACP runtime did not return a session id".to_string())?
            };

            {
                let mut stored = session.acp_session_id.lock().await;
                *stored = Some(acp_session_id.clone());
            }
            session
                .db
                .set_acp_runtime_session_id(&session.session_id, Some(&acp_session_id))
                .await
                .map_err(|err| err.to_string())?;

            session.set_status("ready").await;

            Ok(AcpCreateSessionResult {
                session_id: session_id.clone(),
                runtime_agent_id: session.runtime_agent_id.clone(),
                runtime_agent_name: session.runtime_agent_name.clone(),
                acp_runtime_session_id: acp_session_id,
                status: "ready".to_string(),
            })
        }
        .await;

        match handshake_result {
            Ok(result) => Ok(result),
            Err(err) => {
                self.sessions.lock().await.remove(&session_id);
                session.set_error(err.clone(), true).await;
                let _ = session.close().await;
                Err(err)
            }
        }
    }

    pub async fn send_message(
        &self,
        session_id: &str,
        content: String,
    ) -> Result<AcpPromptResult, String> {
        let session = self.get_session(session_id).await?;
        session.send_message(content).await
    }

    pub async fn close_session(&self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .await
            .remove(session_id)
            .ok_or("ACP session not found".to_string())?;

        session.close().await
    }

    pub async fn list_messages(
        &self,
        db: &Database,
        session_id: &str,
    ) -> Result<Vec<MessageRecord>, String> {
        db.list_messages(session_id)
            .await
            .map_err(|err| err.to_string())
    }

    pub async fn runtime_summary(&self) -> HashMap<String, AcpRuntimeSummary> {
        let sessions = self.sessions.lock().await;
        let mut summary = HashMap::new();

        for session in sessions.values() {
            let status = session.status.lock().await.clone();
            let protocol_version = session.protocol_version.lock().await.clone();
            let runtime_version = session.runtime_version.lock().await.clone();
            let last_error = session.last_error.lock().await.clone();

            summary.insert(
                format!(
                    "{}::{}",
                    session.launch_target.location_key(),
                    session.runtime_agent_id
                ),
                AcpRuntimeSummary {
                    runtime_agent_id: session.runtime_agent_id.clone(),
                    status,
                    protocol_version,
                    runtime_version,
                    last_error,
                    pid: session.pid,
                },
            );
        }

        summary
    }

    fn spawn_reader(&self, session: Arc<AcpSession>, stdout: ChildStdout) {
        let sessions = Arc::clone(&self.sessions);
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();

            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if line.trim().is_empty() {
                            continue;
                        }

                        if let Err(err) = session.handle_incoming(&line).await {
                            session
                                .emit_error(format!("Failed to process ACP payload: {err}"), false)
                                .await;
                        }
                    }
                    Ok(None) => {
                        sessions.lock().await.remove(&session.session_id);
                        session.mark_closed(None).await;
                        break;
                    }
                    Err(err) => {
                        sessions.lock().await.remove(&session.session_id);
                        session
                            .mark_closed(Some(format!("ACP runtime stream error: {err}")))
                            .await;
                        break;
                    }
                }
            }
        });
    }

    fn spawn_stderr_reader(&self, session: Arc<AcpSession>, stderr: ChildStderr) {
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();

            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        if session.current_status().await == "error" {
                            continue;
                        }

                        let lower = trimmed.to_ascii_lowercase();
                        if lower.contains("error") && session.current_status().await != "ready" {
                            session.set_error(trimmed.to_string(), false).await;
                        }
                    }
                    Ok(None) | Err(_) => break,
                }
            }
        });
    }

    async fn get_session(&self, session_id: &str) -> Result<Arc<AcpSession>, String> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or("ACP session not found".to_string())
    }
}

impl AcpSession {
    async fn send_message(&self, content: String) -> Result<AcpPromptResult, String> {
        if self.current_status().await != "ready" {
            return Err("ACP session is not ready".to_string());
        }

        let user_message_id = Uuid::new_v4().to_string();
        self.db
            .create_message(&CreateMessageRecord {
                id: user_message_id,
                session_id: self.session_id.clone(),
                role: "user".to_string(),
                content: content.clone(),
                status: "done".to_string(),
            })
            .await
            .map_err(|err| err.to_string())?;

        let assistant_message_id = Uuid::new_v4().to_string();
        self.db
            .create_message(&CreateMessageRecord {
                id: assistant_message_id.clone(),
                session_id: self.session_id.clone(),
                role: "assistant".to_string(),
                content: String::new(),
                status: "streaming".to_string(),
            })
            .await
            .map_err(|err| err.to_string())?;

        {
            let mut message_id = self.active_assistant_message_id.lock().await;
            *message_id = Some(assistant_message_id.clone());
        }
        {
            let mut current_content = self.active_assistant_content.lock().await;
            current_content.clear();
        }

        let acp_session_id = self
            .acp_session_id
            .lock()
            .await
            .clone()
            .ok_or("ACP session id missing".to_string())?;

        let prompt_params = json!({
            "sessionId": acp_session_id,
            "prompt": [
                {
                    "type": "text",
                    "text": content.clone(),
                }
            ]
        });

        let result = match self.request("session/prompt", prompt_params).await {
            Ok(result) => result,
            Err(err) => {
                let fallback_params = json!({
                    "sessionId": acp_session_id,
                    "prompt": content,
                });
                match self.request("session/prompt", fallback_params).await {
                    Ok(result) => result,
                    Err(_) => {
                        self.db
                            .update_message(&assistant_message_id, "", "error")
                            .await
                            .map_err(|db_err| db_err.to_string())?;
                        self.emit_error(err.clone(), false).await;
                        return Err(err);
                    }
                }
            }
        };

        let stop_reason = string_at(&result, &["stopReason", "stop_reason"]);
        let final_content = self.active_assistant_content.lock().await.clone();
        self.db
            .update_message(&assistant_message_id, &final_content, "done")
            .await
            .map_err(|err| err.to_string())?;

        let _ = self.app_handle.emit(
            &format!("acp-message-complete-{}", self.session_id),
            AcpMessageCompletePayload {
                session_id: self.session_id.clone(),
                message_id: assistant_message_id.clone(),
                role: "assistant".to_string(),
                content: final_content,
                status: "done".to_string(),
                stop_reason: stop_reason.clone(),
            },
        );

        {
            let mut message_id = self.active_assistant_message_id.lock().await;
            *message_id = None;
        }

        Ok(AcpPromptResult {
            message_id: assistant_message_id,
            stop_reason,
        })
    }

    async fn close(&self) -> Result<(), String> {
        {
            let mut child = self.child.lock().await;
            let _ = child.kill().await;
        }

        self.mark_closed(None).await;
        Ok(())
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_request_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);

        let payload = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        self.write_json(&payload).await?;

        let response = timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), receiver)
            .await
            .map_err(|_| format!("ACP request timed out: {method}"))?
            .map_err(|_| format!("ACP response channel dropped: {method}"))?;

        if let Some(error) = response.get("error") {
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("ACP request failed");
            return Err(message.to_string());
        }

        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }

    async fn write_json(&self, payload: &Value) -> Result<(), String> {
        let serialized = serde_json::to_string(payload).map_err(|err| err.to_string())?;
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(serialized.as_bytes())
            .await
            .map_err(|err| err.to_string())?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|err| err.to_string())?;
        stdin.flush().await.map_err(|err| err.to_string())
    }

    async fn handle_incoming(&self, raw: &str) -> Result<(), String> {
        let payload: Value = serde_json::from_str(raw).map_err(|err| err.to_string())?;

        if payload.get("method").is_some() {
            if payload.get("id").is_some() {
                self.reply_method_not_found(&payload).await?;
            } else {
                self.handle_notification(&payload).await?;
            }
            return Ok(());
        }

        if let Some(id) = payload.get("id").and_then(Value::as_u64) {
            if let Some(sender) = self.pending.lock().await.remove(&id) {
                let _ = sender.send(payload);
            }
        }

        Ok(())
    }

    async fn reply_method_not_found(&self, payload: &Value) -> Result<(), String> {
        let id = payload.get("id").cloned().unwrap_or(Value::Null);
        let method = payload
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or("unknown");

        self.write_json(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32601,
                "message": format!("Method not supported by ASquink client: {method}"),
            }
        }))
        .await
    }

    async fn handle_notification(&self, payload: &Value) -> Result<(), String> {
        let method = payload
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();

        if method != "session/update" {
            return Ok(());
        }

        let params = payload.get("params").unwrap_or(&Value::Null);
        let update = params
            .get("update")
            .or_else(|| params.get("sessionUpdate"))
            .unwrap_or(params);
        let update_kind = update
            .get("sessionUpdate")
            .or_else(|| update.get("type"))
            .or_else(|| update.get("kind"))
            .and_then(Value::as_str)
            .unwrap_or_default();

        match update_kind {
            "agent_message_chunk" => self.handle_agent_chunk(update).await?,
            "error" => {
                let message = string_at(update, &["message", "error.message"])
                    .unwrap_or("ACP session update error".to_string());
                self.emit_error(message, false).await;
            }
            _ => {}
        }

        Ok(())
    }

    async fn handle_agent_chunk(&self, update: &Value) -> Result<(), String> {
        let delta = string_at(
            update,
            &[
                "delta.text",
                "content.text",
                "text",
                "message.delta.text",
                "message.content.0.text",
            ],
        )
        .unwrap_or_default();

        if delta.is_empty() {
            return Ok(());
        }

        let message_id = self
            .active_assistant_message_id
            .lock()
            .await
            .clone()
            .ok_or("Assistant message not initialized".to_string())?;

        let next_content = {
            let mut current = self.active_assistant_content.lock().await;
            current.push_str(&delta);
            current.clone()
        };

        self.db
            .update_message(&message_id, &next_content, "streaming")
            .await
            .map_err(|err| err.to_string())?;

        let _ = self.app_handle.emit(
            &format!("acp-message-delta-{}", self.session_id),
            AcpMessageDeltaPayload {
                session_id: self.session_id.clone(),
                message_id,
                role: "assistant".to_string(),
                delta,
                content: next_content,
                status: "streaming".to_string(),
            },
        );

        Ok(())
    }

    async fn set_status(&self, status: &str) {
        {
            let mut current = self.status.lock().await;
            *current = status.to_string();
        }

        if status != "error" {
            let mut last_error = self.last_error.lock().await;
            *last_error = None;
        }

        self.emit_status().await;
    }

    async fn set_error(&self, message: String, fatal: bool) {
        {
            let mut current = self.status.lock().await;
            *current = "error".to_string();
        }
        {
            let mut last_error = self.last_error.lock().await;
            *last_error = Some(message.clone());
        }

        self.emit_status().await;
        self.emit_error(message, fatal).await;
    }

    async fn emit_status(&self) {
        let _ = self.app_handle.emit(
            &format!("acp-session-status-{}", self.session_id),
            AcpSessionStatusPayload {
                session_id: self.session_id.clone(),
                status: self.status.lock().await.clone(),
                runtime_agent_id: self.runtime_agent_id.clone(),
                runtime_agent_name: self.runtime_agent_name.clone(),
                protocol_version: self.protocol_version.lock().await.clone(),
                runtime_version: self.runtime_version.lock().await.clone(),
                last_error: self.last_error.lock().await.clone(),
            },
        );
    }

    async fn emit_error(&self, message: String, fatal: bool) {
        let _ = self.app_handle.emit(
            &format!("acp-session-error-{}", self.session_id),
            AcpSessionErrorPayload {
                session_id: self.session_id.clone(),
                message,
                fatal,
            },
        );
    }

    async fn mark_closed(&self, error: Option<String>) {
        if let Some(message) = error {
            {
                let mut last_error = self.last_error.lock().await;
                *last_error = Some(message.clone());
            }
            self.emit_error(message, true).await;
        }

        {
            let mut status = self.status.lock().await;
            *status = "closed".to_string();
        }

        self.emit_status().await;
        let _ = self
            .app_handle
            .emit(&format!("acp-session-closed-{}", self.session_id), ());
    }

    async fn current_status(&self) -> String {
        self.status.lock().await.clone()
    }
}

fn build_runtime_command(
    definition: AcpRuntimeDefinition,
    launch_target: &AcpLaunchTarget,
    working_dir: &str,
) -> Result<Command, String> {
    let runtime_working_dir = match launch_target {
        AcpLaunchTarget::Local => working_dir.to_string(),
        AcpLaunchTarget::Wsl { .. } => {
            if working_dir.contains(':') {
                crate::wsl::windows_to_wsl_path(working_dir)
            } else {
                working_dir.replace('\\', "/")
            }
        }
    };

    #[cfg(target_os = "windows")]
    let mut command = match launch_target {
        AcpLaunchTarget::Local => match definition.id {
            "claude" => {
                let mut command = Command::new("cmd");
                command.arg("/C").arg("claude-code-acp.cmd");
                command
            }
            "codex" => {
                let mut command = Command::new("cmd");
                command.arg("/C").arg("codex-acp.cmd");
                command
            }
            "gemini" => {
                let mut command = Command::new("cmd");
                command
                    .arg("/C")
                    .arg("gemini.cmd")
                    .arg("--experimental-acp");
                command
            }
            "opencode" => {
                let mut command = Command::new("cmd");
                command.arg("/C").arg("opencode.cmd").arg("acp");
                command
            }
            _ => return Err(format!("Unsupported ACP runtime: {}", definition.id)),
        },
        AcpLaunchTarget::Wsl { distro, user } => {
            let mut command = Command::new("wsl.exe");
            command.arg("--distribution").arg(distro);
            if let Some(user) = user {
                command.arg("--user").arg(user);
            }
            command.arg("--cd").arg(&runtime_working_dir);
            command.arg("--exec");
            match definition.id {
                "claude" => {
                    command.arg("claude-code-acp");
                }
                "codex" => {
                    command.arg("codex-acp");
                }
                "gemini" => {
                    command.arg("gemini").arg("--experimental-acp");
                }
                "opencode" => {
                    command.arg("opencode").arg("acp");
                }
                _ => return Err(format!("Unsupported ACP runtime: {}", definition.id)),
            }
            command
        }
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = match launch_target {
        AcpLaunchTarget::Local => match definition.id {
            "claude" => Command::new("claude-code-acp"),
            "codex" => Command::new("codex-acp"),
            "gemini" => {
                let mut command = Command::new("gemini");
                command.arg("--experimental-acp");
                command
            }
            "opencode" => {
                let mut command = Command::new("opencode");
                command.arg("acp");
                command
            }
            _ => return Err(format!("Unsupported ACP runtime: {}", definition.id)),
        },
        AcpLaunchTarget::Wsl { .. } => {
            return Err("WSL ACP launch is only supported on Windows hosts".to_string())
        }
    };

    if definition.supports_cwd_arg {
        command.arg("--cwd").arg(&runtime_working_dir);
    }

    if matches!(launch_target, AcpLaunchTarget::Local) {
        command.current_dir(working_dir);
    }

    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    Ok(command)
}

fn string_at(value: &Value, paths: &[&str]) -> Option<String> {
    for path in paths {
        if let Some(found) = nested_value(value, path) {
            if let Some(string) = found.as_str() {
                return Some(string.to_string());
            }
            if let Some(number) = found.as_u64() {
                return Some(number.to_string());
            }
        }
    }

    None
}

fn bool_at(value: &Value, paths: &[&str]) -> Option<bool> {
    for path in paths {
        if let Some(found) = nested_value(value, path) {
            if let Some(boolean) = found.as_bool() {
                return Some(boolean);
            }
        }
    }

    None
}

fn nested_value<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;

    for part in path.split('.') {
        if let Ok(index) = part.parse::<usize>() {
            current = current.get(index)?;
        } else {
            current = current.get(part)?;
        }
    }

    Some(current)
}
