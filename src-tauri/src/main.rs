// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use session::TerminalSession;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

mod acp;
mod database;
mod pty;
mod session;
mod ssh;
mod wsl;

use acp::{AcpCreateSessionResult, AcpManager, AcpPermissionDecision, AcpPromptResult};
use database::Database;
use pty::PtyManager;
use ssh::{SshAuth, SshSession};
use wsl::WslManager;

// App state shared across commands
pub struct AppState {
    db: Database,
    acp_manager: AcpManager,
    pty_manager: PtyManager,
    ssh_sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    wsl_manager: WslManager,
}

// New unified Env structure
#[derive(serde::Serialize)]
pub struct Env {
    id: String,
    name: String,
    #[serde(rename = "type")]
    env_type: String,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_type: Option<String>,
    icon: Option<String>,
    status: String,
    detail: Option<String>,
    // WSL-specific fields
    wsl_distro: Option<String>,
    wsl_user: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct CreateEnvRequest {
    name: String,
    #[serde(rename = "type")]
    env_type: String,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_type: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
    icon: Option<String>,
    // WSL-specific fields
    wsl_distro: Option<String>,
    wsl_user: Option<String>,
}

// Legacy Server structure for backward compatibility
#[derive(serde::Serialize)]
pub struct Server {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
}

#[derive(serde::Deserialize)]
pub struct CreateServerRequest {
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    #[allow(dead_code)]
    password: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSshSessionRequest {
    server_id: String,
    password: Option<String>,
}

#[derive(serde::Serialize)]
pub struct AgentStatus {
    installed: bool,
    version: Option<String>,
}

#[derive(serde::Serialize)]
pub struct AgentInfo {
    id: String,
    name: String,
    executable: String,
    installed: bool,
    version: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentInfo {
    id: String,
    name: String,
    executable: String,
    status: String,
    version: Option<String>,
    pid: Option<u32>,
    protocol_version: Option<String>,
    last_error: Option<String>,
    runtime_supported: bool,
    install_hint: Option<String>,
    install_target: String,
    location_label: String,
    wsl_distro: Option<String>,
}

fn parse_version_output(stdout: &[u8], stderr: &[u8]) -> Option<String> {
    let stdout = String::from_utf8_lossy(stdout).trim().to_string();
    if !stdout.is_empty() {
        return Some(stdout);
    }

    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    if !stderr.is_empty() {
        return Some(stderr);
    }

    None
}

#[cfg(target_os = "windows")]
async fn probe_version_with_cmd(executable: &str, args: &[&str]) -> Option<String> {
    let mut command = tokio::process::Command::new("cmd");
    command.arg("/C").arg(executable);
    for arg in args {
        command.arg(arg);
    }

    let output = timeout(Duration::from_secs(3), command.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }

    parse_version_output(&output.stdout, &output.stderr)
}

#[cfg(not(target_os = "windows"))]
async fn probe_version_with_cmd(_executable: &str, _args: &[&str]) -> Option<String> {
    None
}

async fn probe_version_direct(executable: &str, args: &[&str]) -> Option<String> {
    let mut command = tokio::process::Command::new(executable);
    for arg in args {
        command.arg(arg);
    }

    let output = timeout(Duration::from_secs(3), command.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }

    parse_version_output(&output.stdout, &output.stderr)
}

#[cfg(target_os = "windows")]
fn npm_package_json_for_executable(executable: &str) -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let base = PathBuf::from(appdata).join("npm").join("node_modules");

    match executable {
        "codex" => Some(base.join("@openai").join("codex").join("package.json")),
        "gemini" => Some(base.join("@google").join("gemini-cli").join("package.json")),
        "opencode" => Some(base.join("opencode-ai").join("package.json")),
        "openclaw" => Some(base.join("openclaw").join("package.json")),
        _ => None,
    }
}

#[cfg(not(target_os = "windows"))]
fn npm_package_json_for_executable(_executable: &str) -> Option<PathBuf> {
    None
}

fn read_package_version(path: PathBuf) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&contents).ok()?;
    json.get("version")?.as_str().map(|value| value.to_string())
}

async fn detect_agent_version(executable: &str) -> Option<String> {
    let probes = [["--version"], ["-v"], ["version"]];

    for args in probes {
        if let Some(version) = probe_version_direct(executable, &args).await {
            return Some(version);
        }

        if let Some(version) = probe_version_with_cmd(executable, &args).await {
            return Some(version);
        }
    }

    let package_json = npm_package_json_for_executable(executable)?;
    read_package_version(package_json)
}

async fn command_exists(executable: &str) -> bool {
    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    tokio::process::Command::new(which_cmd)
        .arg(executable)
        .output()
        .await
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn command_exists_in_wsl(executable: &str, distro: &str, user: Option<&str>) -> bool {
    let mut command = tokio::process::Command::new("wsl.exe");
    command.arg("--distribution").arg(distro);
    if let Some(user) = user {
        command.arg("--user").arg(user);
    }
    command.arg("--exec").arg("which").arg(executable);

    command
        .output()
        .await
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn probe_version_in_wsl(
    executable: &str,
    args: &[&str],
    distro: &str,
    user: Option<&str>,
) -> Option<String> {
    let mut command = tokio::process::Command::new("wsl.exe");
    command.arg("--distribution").arg(distro);
    if let Some(user) = user {
        command.arg("--user").arg(user);
    }
    command.arg("--exec").arg(executable);
    for arg in args {
        command.arg(arg);
    }

    let output = command.output().await.ok()?;
    if !output.status.success() {
        return None;
    }

    parse_version_output(&output.stdout, &output.stderr)
}

async fn detect_agent_version_in_wsl(
    executable: &str,
    distro: &str,
    user: Option<&str>,
) -> Option<String> {
    let probes = [["--version"], ["-v"], ["version"]];

    for args in probes {
        if let Some(version) = probe_version_in_wsl(executable, &args, distro, user).await {
            return Some(version);
        }
    }

    None
}

async fn resolve_acp_launch_target(
    db: &Database,
    session_id: &str,
    session_info: Option<&CreateSessionInfo>,
) -> Result<acp::AcpLaunchTarget, String> {
    let env_id = if let Some(env_id) = session_info.and_then(|info| info.env_id.clone()) {
        Some(env_id)
    } else {
        db.get_session(session_id)
            .await
            .map_err(|err| err.to_string())?
            .and_then(|session| session.env_id)
    };

    let Some(env_id) = env_id else {
        return Ok(acp::AcpLaunchTarget::Local);
    };

    let env = db.get_env(&env_id).await.map_err(|err| err.to_string())?;
    if env.env_type == "wsl" {
        let configured_wsl_env_id = db
            .get_setting("acp_wsl_env_id")
            .await
            .map_err(|err| err.to_string())?
            .ok_or(
                "WSL ACP is not configured. Select one WSL environment in ACP Agent settings first."
                    .to_string(),
            )?;
        if configured_wsl_env_id != env_id {
            return Err(format!(
                "WSL ACP is configured for a different environment. Switch ACP Agent settings to use {} before starting this ACP session.",
                env.name
            ));
        }

        let distro = env
            .wsl_distro
            .ok_or("WSL distribution not configured".to_string())?;
        Ok(acp::AcpLaunchTarget::Wsl {
            distro,
            user: env.wsl_user,
        })
    } else {
        Ok(acp::AcpLaunchTarget::Local)
    }
}

#[tauri::command]
async fn get_acp_wsl_env_id(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Option<String>, String> {
    let db = {
        let state = state.lock().await;
        state.db.clone()
    };

    db.get_setting("acp_wsl_env_id")
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_acp_wsl_env_id(
    state: State<'_, Arc<Mutex<AppState>>>,
    env_id: Option<String>,
) -> Result<(), String> {
    let db = {
        let state = state.lock().await;
        state.db.clone()
    };

    match env_id {
        Some(env_id) => {
            let env = db.get_env(&env_id).await.map_err(|err| err.to_string())?;
            if env.env_type != "wsl" {
                return Err("ACP WSL setting must point to a WSL environment".to_string());
            }
            db.set_setting("acp_wsl_env_id", &env_id)
                .await
                .map_err(|err| err.to_string())
        }
        None => db
            .delete_setting("acp_wsl_env_id")
            .await
            .map_err(|err| err.to_string()),
    }
}

#[allow(dead_code)]
#[cfg(target_os = "windows")]
async fn detect_agent_pid(executable: &str) -> Option<u32> {
    let patterns = match executable {
        "claude" => vec!["claude"],
        "codex" => vec!["@openai/codex", "codex"],
        "gemini" => vec!["@google/gemini-cli", "gemini-cli"],
        "opencode" => vec!["opencode-ai", "opencode"],
        _ => vec![executable],
    };

    let clauses = patterns
        .into_iter()
        .map(|pattern| format!("($_.CommandLine -like '*{}*')", pattern.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(" -or ");

    let script = format!(
        "$proc = Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -and ({}) }} | Select-Object -First 1 -ExpandProperty ProcessId; if ($proc) {{ $proc }}",
        clauses
    );

    let output = timeout(
        Duration::from_secs(3),
        tokio::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output(),
    )
    .await
    .ok()?
    .ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok()
}

#[allow(dead_code)]
#[cfg(not(target_os = "windows"))]
async fn detect_agent_pid(_executable: &str) -> Option<u32> {
    None
}

// Agent definitions - match frontend AGENTS array
pub fn get_agent_definitions() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("claude", "Claude Code", "claude"),
        ("codex", "Codex", "codex"),
        ("gemini", "Gemini CLI", "gemini"),
        ("opencode", "OpenCode", "opencode"),
        ("openclaw", "OpenClaw", "openclaw"),
    ]
}

fn acp_scope_key(install_target: &str, distro: Option<&str>) -> String {
    if install_target == "wsl" {
        format!("wsl:{}", distro.unwrap_or_default())
    } else {
        "local".to_string()
    }
}

async fn detect_agents_for_env(db: &Database, env_id: &str) -> Result<Vec<AgentInfo>, String> {
    let env = db.get_env(env_id).await.map_err(|e| e.to_string())?;

    if env.env_type == "local" {
        scan_agents().await
    } else if env.env_type == "wsl" {
        let distro = env.wsl_distro.ok_or("WSL distribution not configured")?;
        let user = env.wsl_user.as_deref();
        wsl::scan_agents_in_distro(&distro, user)
            .await
            .map_err(|e| e.to_string())
    } else if env.env_type == "ssh" {
        detect_agents_in_ssh_env(&env).await
    } else {
        Ok(Vec::new())
    }
}

fn ssh_agent_scan_script() -> &'static str {
    r#"
check_agent() {
  id="$1"
  name="$2"
  cmd="$3"
  installed=0
  version=""
  if command -v "$cmd" >/dev/null 2>&1; then
    installed=1
    version=$("$cmd" --version 2>/dev/null | head -n 1)
    if [ -z "$version" ]; then version=$("$cmd" -v 2>/dev/null | head -n 1); fi
    if [ -z "$version" ]; then version=$("$cmd" version 2>/dev/null | head -n 1); fi
  fi
  printf "%s\t%s\t%s\t%s\t%s\n" "$id" "$name" "$cmd" "$installed" "$version"
}
check_agent "claude" "Claude Code" "claude"
check_agent "codex" "Codex" "codex"
check_agent "gemini" "Gemini CLI" "gemini"
check_agent "opencode" "OpenCode" "opencode"
check_agent "openclaw" "OpenClaw" "openclaw"
"#
}

fn parse_ssh_agent_scan(stdout: &str) -> Vec<AgentInfo> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(5, '\t');
            let id = parts.next()?.trim();
            let name = parts.next()?.trim();
            let executable = parts.next()?.trim();
            let installed = parts.next()?.trim() == "1";
            let version = parts
                .next()
                .map(|v| v.trim())
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string());

            if id.is_empty() || name.is_empty() || executable.is_empty() {
                return None;
            }

            Some(AgentInfo {
                id: id.to_string(),
                name: name.to_string(),
                executable: executable.to_string(),
                installed,
                version,
            })
        })
        .collect()
}

async fn detect_agents_in_ssh_env(env: &database::EnvConfig) -> Result<Vec<AgentInfo>, String> {
    let host = env
        .host
        .as_deref()
        .ok_or("SSH host not configured".to_string())?;
    let port = env.port.unwrap_or(22);
    let username = env
        .username
        .as_deref()
        .ok_or("SSH username not configured".to_string())?;

    let auth = if env.auth_type.as_deref() == Some("password") {
        return Err("SSH environment uses password auth; background scan currently requires key auth.".to_string());
    } else {
        let key_path = env
            .private_key_path
            .clone()
            .ok_or("SSH private key path not configured".to_string())?;
        SshAuth::PrivateKey {
            path: key_path,
            passphrase: env.passphrase.clone(),
        }
    };

    let stdout = ssh::exec_command(host, port, username, auth, ssh_agent_scan_script())
        .await
        .map_err(|e| e.to_string())?;
    let mut scanned = parse_ssh_agent_scan(&stdout);

    if scanned.is_empty() {
        scanned = get_agent_definitions()
            .into_iter()
            .map(|(id, name, executable)| AgentInfo {
                id: id.to_string(),
                name: name.to_string(),
                executable: executable.to_string(),
                installed: false,
                version: None,
            })
            .collect();
    }

    Ok(scanned)
}

async fn detect_acp_agents_for_target(
    acp_manager: AcpManager,
    install_target: Option<String>,
    distro: Option<String>,
    user: Option<String>,
) -> Result<Vec<AcpAgentInfo>, String> {
    let runtime_summary = acp_manager.runtime_summary().await;
    let launch_target = match install_target.as_deref() {
        Some("wsl") => acp::AcpLaunchTarget::Wsl {
            distro: distro.ok_or("WSL distro is required for WSL ACP scan".to_string())?,
            user,
        },
        _ => acp::AcpLaunchTarget::Local,
    };
    let location_key = launch_target.location_key();
    let location_label = launch_target.location_label();
    let wsl_distro = match &launch_target {
        acp::AcpLaunchTarget::Wsl { distro, .. } => Some(distro.clone()),
        acp::AcpLaunchTarget::Local => None,
    };
    let mut result = Vec::new();

    for definition in acp::acp_runtime_definitions() {
        let runtime_state = runtime_summary.get(&format!("{location_key}::{}", definition.id));
        let installed = match &launch_target {
            acp::AcpLaunchTarget::Local => command_exists(definition.install_probe).await,
            acp::AcpLaunchTarget::Wsl { distro, user } => {
                command_exists_in_wsl(definition.install_probe, distro, user.as_deref()).await
            }
        };
        let runtime_supported = runtime_state.is_some()
            || match &launch_target {
                acp::AcpLaunchTarget::Local => command_exists(definition.runtime_probe).await,
                acp::AcpLaunchTarget::Wsl { distro, user } => {
                    command_exists_in_wsl(definition.runtime_probe, distro, user.as_deref()).await
                }
            };
        let version = if let Some(version) =
            runtime_state.and_then(|state| state.runtime_version.clone())
        {
            Some(version)
        } else if installed {
            match &launch_target {
                acp::AcpLaunchTarget::Local => detect_agent_version(definition.install_probe).await,
                acp::AcpLaunchTarget::Wsl { distro, user } => {
                    detect_agent_version_in_wsl(definition.install_probe, distro, user.as_deref())
                        .await
                }
            }
        } else {
            None
        };
        let pid = runtime_state.and_then(|state| state.pid);
        let status = if !installed {
            "not_installed"
        } else if !runtime_supported {
            "runtime_missing"
        } else if let Some(state) = runtime_state {
            state.status.as_str()
        } else {
            "disconnected"
        };
        let executable = if runtime_supported {
            definition.executable_display
        } else {
            definition.install_probe
        };

        result.push(AcpAgentInfo {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            executable: executable.to_string(),
            status: status.to_string(),
            version,
            pid,
            protocol_version: runtime_state.and_then(|state| state.protocol_version.clone()),
            last_error: runtime_state.and_then(|state| state.last_error.clone()),
            runtime_supported,
            install_hint: Some(
                if !installed {
                    definition.install_hint
                } else {
                    definition
                        .runtime_install_hint
                        .unwrap_or(definition.install_hint)
                }
                .to_string(),
            ),
            install_target: launch_target.install_target().to_string(),
            location_label: location_label.clone(),
            wsl_distro: wsl_distro.clone(),
        });
    }

    Ok(result)
}

// Project structure
#[derive(serde::Serialize)]
pub struct Project {
    id: String,
    name: String,
    path: String,
    env_id: String,
    lang: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct CreateProjectRequest {
    name: String,
    path: String,
    env_id: String,
    lang: Option<String>,
}

// Session creation request from frontend
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionInfo {
    name: Option<String>,
    env_id: Option<String>,
    agent_id: Option<String>,
    acp_agent_id: Option<String>,
    project_id: Option<String>,
    working_dir: Option<String>,
}

fn into_create_session_record(
    session_id: String,
    info: CreateSessionInfo,
) -> database::CreateSessionRecord {
    database::CreateSessionRecord {
        id: session_id,
        name: info.name,
        env_id: info.env_id,
        agent_id: info.agent_id,
        acp_agent_id: info.acp_agent_id,
        acp_runtime_session_id: None,
        project_id: info.project_id,
        working_dir: info.working_dir,
    }
}

// Initialize database on app start
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("asquink.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_str().unwrap());
    let db = tauri::async_runtime::block_on(Database::new(&db_url))?;

    let state = AppState {
        db,
        acp_manager: AcpManager::new(),
        pty_manager: PtyManager::new(),
        ssh_sessions: Arc::new(Mutex::new(HashMap::new())),
        wsl_manager: WslManager::new(),
    };

    app.manage(Arc::new(Mutex::new(state)));

    // Exit app when window is closed
    if let Some(window) = app.handle().get_webview_window("main") {
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Force exit to ensure all threads terminate
                std::process::exit(0);
            }
        });
    }

    Ok(())
}

// API Key management commands
#[tauri::command]
async fn save_api_key(
    state: State<'_, Arc<Mutex<AppState>>>,
    api_key: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state
        .db
        .set_setting("anthropic_api_key", &api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_api_key(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Option<String>, String> {
    let state = state.lock().await;
    state
        .db
        .get_setting("anthropic_api_key")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_api_key(state: State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let state = state.lock().await;
    state
        .db
        .delete_setting("anthropic_api_key")
        .await
        .map_err(|e| e.to_string())
}

// Environment management commands
#[tauri::command]
async fn list_envs(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<Env>, String> {
    let state = state.lock().await;
    state.db.list_envs().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_env(
    state: State<'_, Arc<Mutex<AppState>>>,
    req: CreateEnvRequest,
) -> Result<String, String> {
    let state = state.lock().await;

    // Check for duplicate environment
    let existing_envs = state.db.list_envs().await.map_err(|e| e.to_string())?;

    for env in existing_envs {
        if env.env_type != req.env_type {
            continue;
        }

        if req.env_type == "ssh" {
            // Check SSH: host + port + username
            let existing_host = env.host.as_deref().unwrap_or("");
            let existing_port = env.port.unwrap_or(22);
            let existing_user = env.username.as_deref().unwrap_or("");

            let req_host = req.host.as_deref().unwrap_or("");
            let req_port = req.port.unwrap_or(22);
            let req_user = req.username.as_deref().unwrap_or("");

            if existing_host == req_host && existing_port == req_port && existing_user == req_user {
                return Err(format!(
                    "SSH 环境 {}@{}:{} 已存在",
                    req_user, req_host, req_port
                ));
            }
        } else if req.env_type == "wsl" {
            // Check WSL: distro + user
            let existing_distro = env.wsl_distro.as_deref().unwrap_or("");
            let existing_user = env.wsl_user.as_deref().unwrap_or("");

            let req_distro = req.wsl_distro.as_deref().unwrap_or("");
            let req_user = req.wsl_user.as_deref().unwrap_or("");

            if existing_distro == req_distro && existing_user == req_user {
                let user_suffix = if req_user.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", req_user)
                };
                return Err(format!("WSL 环境 {}{} 已存在", req_distro, user_suffix));
            }
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    state
        .db
        .create_env(&id, &req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn delete_env(state: State<'_, Arc<Mutex<AppState>>>, id: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.delete_env(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_env_status(
    state: State<'_, Arc<Mutex<AppState>>>,
    id: String,
) -> Result<String, String> {
    let state = state.lock().await;

    // Get env config
    let env = state.db.get_env(&id).await.map_err(|e| e.to_string())?;

    let status = if env.env_type == "local" {
        // Local environment is always online
        "online".to_string()
    } else if env.env_type == "wsl" {
        // WSL environment - check if WSL is installed and distro exists
        if !wsl::WslManager::is_wsl_installed().await {
            "offline".to_string()
        } else {
            // Check if the specific distro exists
            if let Some(ref distro) = env.wsl_distro {
                match wsl::WslManager::list_distros().await {
                    Ok(distros) => {
                        if distros.iter().any(|d| &d.name == distro) {
                            "online".to_string()
                        } else {
                            "offline".to_string()
                        }
                    }
                    Err(_) => "offline".to_string(),
                }
            } else {
                "online".to_string()
            }
        }
    } else {
        // SSH environment - try TCP connection test
        let host = env.host.clone().unwrap_or_default();
        let port = env.port.unwrap_or(22);

        // Use tokio to attempt a TCP connection with timeout
        let addr = format!("{}:{}", host, port);
        match tokio::time::timeout(
            std::time::Duration::from_secs(3),
            tokio::net::TcpStream::connect(&addr),
        )
        .await
        {
            Ok(Ok(_)) => "online",
            _ => "offline",
        }
        .to_string()
    };

    // Update status in database
    state
        .db
        .update_env_status(&id, &status)
        .await
        .map_err(|e| e.to_string())?;

    Ok(status)
}

// Legacy Server management commands (for backward compatibility)
#[tauri::command]
async fn list_servers(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<Server>, String> {
    let state = state.lock().await;
    state.db.list_servers().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_server(
    state: State<'_, Arc<Mutex<AppState>>>,
    req: CreateServerRequest,
) -> Result<String, String> {
    let state = state.lock().await;
    let id = uuid::Uuid::new_v4().to_string();
    state
        .db
        .create_server(&id, &req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn delete_server(state: State<'_, Arc<Mutex<AppState>>>, id: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.delete_server(&id).await.map_err(|e| e.to_string())
}

// Project management commands
#[tauri::command]
async fn list_projects(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<Project>, String> {
    let state = state.lock().await;
    state.db.list_projects().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_project(
    state: State<'_, Arc<Mutex<AppState>>>,
    req: CreateProjectRequest,
) -> Result<String, String> {
    let state = state.lock().await;
    let id = uuid::Uuid::new_v4().to_string();
    state
        .db
        .create_project(&id, &req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn update_project(
    state: State<'_, Arc<Mutex<AppState>>>,
    id: String,
    req: CreateProjectRequest,
) -> Result<(), String> {
    let state = state.lock().await;
    state
        .db
        .update_project(&id, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_project(state: State<'_, Arc<Mutex<AppState>>>, id: String) -> Result<(), String> {
    let state = state.lock().await;
    state
        .db
        .delete_project(&id)
        .await
        .map_err(|e| e.to_string())
}

// Agent management commands
#[tauri::command]
async fn check_agent_installed(agent: String) -> Result<AgentStatus, String> {
    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let output = tokio::process::Command::new(which_cmd)
        .arg(&agent)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let installed = output.status.success();
    let version = if installed {
        detect_agent_version(&agent).await
    } else {
        None
    };

    Ok(AgentStatus { installed, version })
}

#[tauri::command]
async fn scan_agents() -> Result<Vec<AgentInfo>, String> {
    let agents = get_agent_definitions();
    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let mut result = Vec::new();

    for (id, name, executable) in agents {
        let output = tokio::process::Command::new(which_cmd)
            .arg(executable)
            .output()
            .await;

        let installed = output.map(|o| o.status.success()).unwrap_or(false);
        let version = if installed {
            detect_agent_version(executable).await
        } else {
            None
        };

        result.push(AgentInfo {
            id: id.to_string(),
            name: name.to_string(),
            executable: executable.to_string(),
            installed,
            version,
        });
    }

    Ok(result)
}

#[tauri::command]
async fn list_acp_agents(
    state: State<'_, Arc<Mutex<AppState>>>,
    install_target: Option<String>,
    distro: Option<String>,
    user: Option<String>,
) -> Result<Vec<AcpAgentInfo>, String> {
    let acp_manager = {
        let state = state.lock().await;
        state.acp_manager.clone()
    };
    detect_acp_agents_for_target(acp_manager, install_target, distro, user).await
}

#[tauri::command]
async fn get_env_agent_scan_cache(
    state: State<'_, Arc<Mutex<AppState>>>,
    env_id: String,
) -> Result<Vec<AgentInfo>, String> {
    let db = {
        let state = state.lock().await;
        state.db.clone()
    };

    db.list_env_agent_detections(&env_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn refresh_env_agent_scan_cache(
    state: State<'_, Arc<Mutex<AppState>>>,
    env_id: String,
) -> Result<Vec<AgentInfo>, String> {
    let db = {
        let state = state.lock().await;
        state.db.clone()
    };
    let agents = detect_agents_for_env(&db, &env_id).await?;
    db.upsert_env_agent_detections(&env_id, &agents)
        .await
        .map_err(|e| e.to_string())?;
    Ok(agents)
}

#[tauri::command]
async fn get_acp_agent_scan_cache(
    state: State<'_, Arc<Mutex<AppState>>>,
    install_target: Option<String>,
    distro: Option<String>,
) -> Result<Vec<AcpAgentInfo>, String> {
    let db = {
        let state = state.lock().await;
        state.db.clone()
    };
    let target = install_target.unwrap_or_else(|| "local".to_string());
    if target == "wsl" && distro.is_none() {
        return Err("WSL distro is required for WSL ACP cache".to_string());
    }
    let scope_key = acp_scope_key(&target, distro.as_deref());
    db.list_acp_agent_detections(&scope_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn refresh_acp_agent_scan_cache(
    state: State<'_, Arc<Mutex<AppState>>>,
    install_target: Option<String>,
    distro: Option<String>,
    user: Option<String>,
) -> Result<Vec<AcpAgentInfo>, String> {
    let (db, acp_manager) = {
        let state = state.lock().await;
        (state.db.clone(), state.acp_manager.clone())
    };
    let target = install_target.unwrap_or_else(|| "local".to_string());
    if target == "wsl" && distro.is_none() {
        return Err("WSL distro is required for WSL ACP scan".to_string());
    }

    let agents = detect_acp_agents_for_target(
        acp_manager,
        Some(target.clone()),
        distro.clone(),
        user,
    )
    .await?;
    let scope_key = acp_scope_key(&target, distro.as_deref());
    db.upsert_acp_agent_detections(&scope_key, &agents)
        .await
        .map_err(|e| e.to_string())?;
    Ok(agents)
}

#[tauri::command]
async fn refresh_agent_management_cache_on_startup(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let (db, acp_manager) = {
        let state = state.lock().await;
        (state.db.clone(), state.acp_manager.clone())
    };

    let envs = db.list_envs().await.map_err(|e| e.to_string())?;
    for env in envs {
        if env.env_type != "local" && env.env_type != "wsl" {
            continue;
        }
        match detect_agents_for_env(&db, &env.id).await {
            Ok(agents) => {
                if let Err(err) = db.upsert_env_agent_detections(&env.id, &agents).await {
                    eprintln!(
                        "Failed to persist env agent detection cache for {}: {}",
                        env.id, err
                    );
                }
            }
            Err(err) => {
                eprintln!("Failed to detect agents for env {}: {}", env.id, err);
            }
        }
    }

    match detect_acp_agents_for_target(
        acp_manager.clone(),
        Some("local".to_string()),
        None,
        None,
    )
    .await
    {
        Ok(local_agents) => {
            if let Err(err) = db.upsert_acp_agent_detections("local", &local_agents).await {
                eprintln!("Failed to persist local ACP cache: {}", err);
            }
        }
        Err(err) => {
            eprintln!("Failed to detect local ACP agents: {}", err);
        }
    }

    let configured_wsl_env_id = db
        .get_setting("acp_wsl_env_id")
        .await
        .map_err(|e| e.to_string())?;
    if let Some(env_id) = configured_wsl_env_id {
        if let Ok(env) = db.get_env(&env_id).await {
            if env.env_type == "wsl" {
                if let Some(distro) = env.wsl_distro {
                    let user = env.wsl_user;
                    match detect_acp_agents_for_target(
                        acp_manager,
                        Some("wsl".to_string()),
                        Some(distro.clone()),
                        user,
                    )
                    .await
                    {
                        Ok(wsl_agents) => {
                            let scope_key = acp_scope_key("wsl", Some(&distro));
                            if let Err(err) =
                                db.upsert_acp_agent_detections(&scope_key, &wsl_agents).await
                            {
                                eprintln!("Failed to persist WSL ACP cache for {}: {}", distro, err);
                            }
                        }
                        Err(err) => {
                            eprintln!("Failed to detect WSL ACP agents for {}: {}", distro, err);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn create_acp_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    acp_agent_id: String,
    working_dir: Option<String>,
    session_info: Option<CreateSessionInfo>,
    app_handle: tauri::AppHandle,
) -> Result<AcpCreateSessionResult, String> {
    let (db, acp_manager) = {
        let state = state.lock().await;
        (state.db.clone(), state.acp_manager.clone())
    };

    let resolved_working_dir = working_dir
        .or_else(|| {
            session_info
                .as_ref()
                .and_then(|info| info.working_dir.clone())
        })
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .and_then(|dir| dir.to_str().map(|value| value.to_string()))
        })
        .ok_or("ACP session requires a working directory".to_string())?;
    let launch_target = resolve_acp_launch_target(&db, &session_id, session_info.as_ref()).await?;
    let previous_acp_runtime_session_id = db
        .get_acp_runtime_session_id(&session_id)
        .await
        .map_err(|err| err.to_string())?;

    let result = acp_manager
        .create_session(
            session_id.clone(),
            acp_agent_id,
            previous_acp_runtime_session_id,
            launch_target,
            resolved_working_dir.clone(),
            db.clone(),
            app_handle,
        )
        .await?;

    if let Some(info) = session_info {
        let mut record = into_create_session_record(session_id.clone(), info);
        record.acp_runtime_session_id = Some(result.acp_runtime_session_id.clone());
        if let Err(err) = db.create_session(&record).await {
            let _ = acp_manager.close_session(&session_id).await;
            return Err(err.to_string());
        }
    } else {
        db.set_acp_runtime_session_id(&session_id, Some(&result.acp_runtime_session_id))
            .await
            .map_err(|err| err.to_string())?;
    }

    Ok(result)
}

#[tauri::command]
async fn send_acp_message(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    content: String,
) -> Result<AcpPromptResult, String> {
    let acp_manager = {
        let state = state.lock().await;
        state.acp_manager.clone()
    };

    acp_manager.send_message(&session_id, content).await
}

#[tauri::command]
async fn respond_acp_permission_request(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    request_id: String,
    outcome: String,
    option_id: Option<String>,
) -> Result<(), String> {
    let acp_manager = {
        let state = state.lock().await;
        state.acp_manager.clone()
    };

    let decision = match outcome.as_str() {
        "selected" => {
            let option_id =
                option_id.ok_or("optionId is required when outcome is selected".to_string())?;
            AcpPermissionDecision::Selected { option_id }
        }
        "cancelled" => AcpPermissionDecision::Cancelled,
        _ => return Err(format!("Unsupported permission outcome: {outcome}")),
    };

    acp_manager
        .respond_permission_request(&session_id, &request_id, decision)
        .await
}

#[tauri::command]
async fn close_acp_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
) -> Result<(), String> {
    let (db, acp_manager) = {
        let state = state.lock().await;
        (state.db.clone(), state.acp_manager.clone())
    };

    acp_manager.close_session(&session_id).await?;
    db.end_session(&session_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn list_session_messages(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
) -> Result<Vec<database::MessageRecord>, String> {
    let (db, acp_manager) = {
        let state = state.lock().await;
        (state.db.clone(), state.acp_manager.clone())
    };

    acp_manager.list_messages(&db, &session_id).await
}

#[tauri::command]
async fn scan_agents_for_env(
    state: State<'_, Arc<Mutex<AppState>>>,
    env_id: String,
) -> Result<Vec<AgentInfo>, String> {
    let db = {
        let state = state.lock().await;
        state.db.clone()
    };
    detect_agents_for_env(&db, &env_id).await
}

#[tauri::command]
async fn launch_agent(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    session_type: String,
    agent: String,
) -> Result<(), String> {
    let state = state.lock().await;

    // Send the agent command with appropriate newline
    // Use \r\n for Windows PowerShell compatibility
    let cmd = format!("{}\r\n", agent);

    // Write to session based on type
    if session_type == "local" {
        state
            .pty_manager
            .write(&session_id, cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())
    } else if session_type == "ssh" {
        let sessions = state.ssh_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            session
                .write(cmd.as_bytes())
                .await
                .map_err(|e| e.to_string())
        } else {
            Err("SSH session not found".to_string())
        }
    } else if session_type == "wsl" {
        state
            .wsl_manager
            .write(&session_id, cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Unknown session type".to_string())
    }
}

// Session commands
#[tauri::command]
async fn create_local_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    working_dir: Option<String>,
    session_info: Option<CreateSessionInfo>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;
    state
        .pty_manager
        .create_session(&session_id, shell, cols, rows, working_dir, app_handle)
        .await
        .map_err(|e| e.to_string())?;

    // Save session to database if info provided
    if let Some(info) = session_info {
        let record = into_create_session_record(session_id.clone(), info);
        state
            .db
            .create_session(&record)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(session_id)
}

#[tauri::command]
async fn create_ssh_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    cols: u16,
    rows: u16,
    req: CreateSshSessionRequest,
    session_info: Option<CreateSessionInfo>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;

    // Get server/env config from database
    let env = state
        .db
        .get_env(&req.server_id)
        .await
        .map_err(|e| e.to_string())?;

    // Determine auth method
    let auth = if env.auth_type.as_deref() == Some("password") {
        match req.password {
            Some(pwd) => SshAuth::Password(pwd),
            None => return Err("Password required".to_string()),
        }
    } else {
        let key_path = env
            .private_key_path
            .ok_or("Private key path not configured")?;
        SshAuth::PrivateKey {
            path: key_path,
            passphrase: env.passphrase,
        }
    };

    let host = env.host.ok_or("Host not configured")?;
    let port = env.port.unwrap_or(22);
    let username = env.username.ok_or("Username not configured")?;

    // Create SSH session
    let session = SshSession::connect(
        session_id.clone(),
        &host,
        port,
        &username,
        auth,
        cols,
        rows,
        app_handle,
    )
    .await
    .map_err(|e| e.to_string())?;

    state
        .ssh_sessions
        .lock()
        .await
        .insert(session_id.clone(), session);

    // Save session to database if info provided
    if let Some(info) = session_info {
        let record = into_create_session_record(session_id.clone(), info);
        state
            .db
            .create_session(&record)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(session_id)
}

// WSL-specific commands
#[tauri::command]
async fn list_wsl_distros() -> Result<Vec<wsl::WslDistro>, String> {
    wsl::WslManager::list_distros()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_wsl_installed() -> Result<bool, String> {
    Ok(wsl::WslManager::is_wsl_installed().await)
}

#[tauri::command]
async fn create_wsl_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    env_id: String,
    cols: u16,
    rows: u16,
    working_dir: Option<String>,
    session_info: Option<CreateSessionInfo>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;

    // Get WSL env config from database
    let env = state.db.get_env(&env_id).await.map_err(|e| e.to_string())?;

    // Get distro and user from env config
    let distro = env.wsl_distro.ok_or("WSL distribution not configured")?;
    let user = env.wsl_user.as_deref();

    // Create WSL session
    state
        .wsl_manager
        .create_session(
            &session_id,
            &distro,
            user,
            cols,
            rows,
            working_dir,
            app_handle,
        )
        .await
        .map_err(|e| e.to_string())?;

    // Save session to database if info provided
    if let Some(info) = session_info {
        let record = into_create_session_record(session_id.clone(), info);
        state
            .db
            .create_session(&record)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(session_id)
}

#[tauri::command]
async fn write_to_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    session_type: String,
    data: String,
) -> Result<(), String> {
    let state = state.lock().await;

    if session_type == "local" {
        state
            .pty_manager
            .write(&session_id, data.as_bytes())
            .await
            .map_err(|e| e.to_string())
    } else if session_type == "ssh" {
        let sessions = state.ssh_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            session
                .write(data.as_bytes())
                .await
                .map_err(|e| e.to_string())
        } else {
            Err("SSH session not found".to_string())
        }
    } else if session_type == "wsl" {
        state
            .wsl_manager
            .write(&session_id, data.as_bytes())
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Unknown session type".to_string())
    }
}

#[tauri::command]
async fn resize_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    session_type: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let state = state.lock().await;

    if session_type == "local" {
        state
            .pty_manager
            .resize(&session_id, cols, rows)
            .await
            .map_err(|e| e.to_string())
    } else if session_type == "ssh" {
        let sessions = state.ssh_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            session.resize(cols, rows).await.map_err(|e| e.to_string())
        } else {
            Err("SSH session not found".to_string())
        }
    } else if session_type == "wsl" {
        state
            .wsl_manager
            .resize(&session_id, cols, rows)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Unknown session type".to_string())
    }
}

#[tauri::command]
async fn close_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    session_type: String,
) -> Result<(), String> {
    let state = state.lock().await;

    if session_type == "local" {
        state
            .pty_manager
            .close_session(&session_id)
            .await
            .map_err(|e| e.to_string())?
    } else if session_type == "ssh" {
        let mut sessions = state.ssh_sessions.lock().await;
        if let Some(mut session) = sessions.remove(&session_id) {
            session.close().await.map_err(|e| e.to_string())?
        }
    } else if session_type == "wsl" {
        state
            .wsl_manager
            .close_session(&session_id)
            .await
            .map_err(|e| e.to_string())?
    } else {
        return Err("Unknown session type".to_string());
    }

    // Update ended_at in database
    state
        .db
        .end_session(&session_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Session history management commands
#[tauri::command]
async fn list_sessions(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<database::SessionRecord>, String> {
    let state = state.lock().await;
    state.db.list_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_session_record(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state
        .db
        .delete_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn debug_sessions(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<database::SessionRecord>, String> {
    let state = state.lock().await;
    state.db.list_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn reopen_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state
        .db
        .reopen_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            // API Key
            save_api_key,
            get_api_key,
            delete_api_key,
            // Environments (new)
            list_envs,
            create_env,
            delete_env,
            check_env_status,
            // Servers (legacy)
            list_servers,
            create_server,
            delete_server,
            // Projects
            list_projects,
            create_project,
            update_project,
            delete_project,
            // Agents
            check_agent_installed,
            scan_agents,
            list_acp_agents,
            get_env_agent_scan_cache,
            refresh_env_agent_scan_cache,
            get_acp_agent_scan_cache,
            refresh_acp_agent_scan_cache,
            refresh_agent_management_cache_on_startup,
            get_acp_wsl_env_id,
            set_acp_wsl_env_id,
            create_acp_session,
            send_acp_message,
            respond_acp_permission_request,
            close_acp_session,
            scan_agents_for_env,
            launch_agent,
            // Sessions
            create_local_session,
            create_ssh_session,
            create_wsl_session,
            write_to_session,
            resize_session,
            close_session,
            list_sessions,
            list_session_messages,
            delete_session_record,
            reopen_session,
            debug_sessions,
            // WSL
            list_wsl_distros,
            check_wsl_installed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
