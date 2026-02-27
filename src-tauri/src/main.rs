// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;
use session::TerminalSession;

mod database;
mod pty;
mod session;
mod ssh;

use database::Database;
use pty::PtyManager;
use ssh::{SshAuth, SshSession};

// App state shared across commands
pub struct AppState {
    db: Database,
    pty_manager: PtyManager,
    ssh_sessions: Arc<Mutex<HashMap<String, SshSession>>>,
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
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionInfo {
    name: Option<String>,
    env_id: Option<String>,
    env_type: String,
    agent_id: Option<String>,
    project_id: Option<String>,
    project_path: Option<String>,
    working_dir: Option<String>,
}

// Initialize database on app start
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("agenthub.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_str().unwrap());
    let db = tauri::async_runtime::block_on(Database::new(&db_url))?;

    let state = AppState {
        db,
        pty_manager: PtyManager::new(),
        ssh_sessions: Arc::new(Mutex::new(HashMap::new())),
    };

    app.manage(Arc::new(Mutex::new(state)));
    Ok(())
}

// API Key management commands
#[tauri::command]
async fn save_api_key(state: State<'_, Arc<Mutex<AppState>>>, api_key: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.set_setting("anthropic_api_key", &api_key).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_api_key(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Option<String>, String> {
    let state = state.lock().await;
    state.db.get_setting("anthropic_api_key").await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_api_key(state: State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let state = state.lock().await;
    state.db.delete_setting("anthropic_api_key").await.map_err(|e| e.to_string())
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
    let id = uuid::Uuid::new_v4().to_string();
    state.db.create_env(&id, &req).await.map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn delete_env(state: State<'_, Arc<Mutex<AppState>>>, id: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.delete_env(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_env_status(state: State<'_, Arc<Mutex<AppState>>>, id: String) -> Result<String, String> {
    let state = state.lock().await;

    // Get env config
    let env = state.db.get_env(&id).await.map_err(|e| e.to_string())?;

    let status = if env.env_type == "local" {
        // Local environment is always online
        "online".to_string()
    } else {
        // SSH environment - try TCP connection test
        let host = env.host.clone().unwrap_or_default();
        let port = env.port.unwrap_or(22);

        // Use tokio to attempt a TCP connection with timeout
        let addr = format!("{}:{}", host, port);
        match tokio::time::timeout(
            std::time::Duration::from_secs(3),
            tokio::net::TcpStream::connect(&addr)
        ).await {
            Ok(Ok(_)) => "online",
            _ => "offline",
        }.to_string()
    };

    // Update status in database
    state.db.update_env_status(&id, &status).await.map_err(|e| e.to_string())?;

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
    state.db.create_server(&id, &req).await.map_err(|e| e.to_string())?;
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
    state.db.create_project(&id, &req).await.map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn update_project(
    state: State<'_, Arc<Mutex<AppState>>>,
    id: String,
    req: CreateProjectRequest,
) -> Result<(), String> {
    let state = state.lock().await;
    state.db.update_project(&id, &req).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_project(state: State<'_, Arc<Mutex<AppState>>>, id: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.delete_project(&id).await.map_err(|e| e.to_string())
}

// Agent management commands
#[tauri::command]
async fn check_agent_installed(agent: String) -> Result<AgentStatus, String> {
    let output = tokio::process::Command::new("which")
        .arg(&agent)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let installed = output.status.success();
    let version = if installed {
        // Try to get version
        let version_output = tokio::process::Command::new(&agent)
            .arg("--version")
            .output()
            .await
            .ok();

        version_output.and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
    } else {
        None
    };

    Ok(AgentStatus { installed, version })
}

#[tauri::command]
async fn launch_agent(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    agent: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    let state = state.lock().await;

    let api_key = state.db.get_setting("anthropic_api_key").await
        .map_err(|e| e.to_string())?
        .ok_or("API key not configured. Please set it in Settings.")?;

    // Prepare launch command with environment variables
    let mut cmd = format!("export ANTHROPIC_API_KEY='{}'; ", api_key);

    // Change to working directory if specified
    if let Some(dir) = working_dir {
        cmd.push_str(&format!("cd {}; ", dir));
    }

    // Launch agent
    cmd.push_str(&agent);
    cmd.push_str("\n");

    // Write to session
    state.pty_manager.write(&session_id, cmd.as_bytes()).await.map_err(|e| e.to_string())
}

// Session commands
#[tauri::command]
async fn create_local_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    session_info: Option<CreateSessionInfo>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;
    state.pty_manager.create_session(&session_id, shell, cols, rows, app_handle).await.map_err(|e| e.to_string())?;

    // Save session to database if info provided
    if let Some(info) = session_info {
        let record = database::SessionRecord {
            id: session_id.clone(),
            name: info.name,
            env_id: info.env_id,
            env_type: info.env_type,
            agent_id: info.agent_id,
            project_id: info.project_id,
            project_path: info.project_path,
            working_dir: info.working_dir,
            started_at: None,
            ended_at: None,
        };
        state.db.create_session(&record).await.map_err(|e| e.to_string())?;
    }

    Ok(session_id)
}

#[tauri::command]
async fn create_ssh_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    session_id: String,
    req: CreateSshSessionRequest,
    session_info: Option<CreateSessionInfo>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;

    // Get server/env config from database
    let env = state.db.get_env(&req.server_id).await.map_err(|e| e.to_string())?;

    // Determine auth method
    let auth = if env.auth_type.as_deref() == Some("password") {
        match req.password {
            Some(pwd) => SshAuth::Password(pwd),
            None => return Err("Password required".to_string()),
        }
    } else {
        let key_path = env.private_key_path.ok_or("Private key path not configured")?;
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
        app_handle,
    ).await.map_err(|e| e.to_string())?;

    state.ssh_sessions.lock().await.insert(session_id.clone(), session);

    // Save session to database if info provided
    if let Some(info) = session_info {
        let record = database::SessionRecord {
            id: session_id.clone(),
            name: info.name,
            env_id: info.env_id,
            env_type: info.env_type,
            agent_id: info.agent_id,
            project_id: info.project_id,
            project_path: info.project_path,
            working_dir: info.working_dir,
            started_at: None,
            ended_at: None,
        };
        state.db.create_session(&record).await.map_err(|e| e.to_string())?;
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
        state.pty_manager.write(&session_id, data.as_bytes()).await.map_err(|e| e.to_string())
    } else if session_type == "ssh" {
        let sessions = state.ssh_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            session.write(data.as_bytes()).await.map_err(|e| e.to_string())
        } else {
            Err("SSH session not found".to_string())
        }
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
        state.pty_manager.resize(&session_id, cols, rows).await.map_err(|e| e.to_string())
    } else if session_type == "ssh" {
        let sessions = state.ssh_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            session.resize(cols, rows).await.map_err(|e| e.to_string())
        } else {
            Err("SSH session not found".to_string())
        }
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
        state.pty_manager.close_session(&session_id).await.map_err(|e| e.to_string())?
    } else if session_type == "ssh" {
        let mut sessions = state.ssh_sessions.lock().await;
        if let Some(mut session) = sessions.remove(&session_id) {
            session.close().await.map_err(|e| e.to_string())?
        }
    } else {
        return Err("Unknown session type".to_string())
    }

    // Update ended_at in database
    state.db.end_session(&session_id).await.map_err(|e| e.to_string())?;

    Ok(())
}

// Session history management commands
#[tauri::command]
async fn list_sessions(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<database::SessionRecord>, String> {
    let state = state.lock().await;
    state.db.list_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_session_record(state: State<'_, Arc<Mutex<AppState>>>, session_id: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.delete_session(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn debug_sessions(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<database::SessionRecord>, String> {
    let state = state.lock().await;
    state.db.list_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn reopen_session(state: State<'_, Arc<Mutex<AppState>>>, session_id: String) -> Result<(), String> {
    let state = state.lock().await;
    state.db.reopen_session(&session_id).await.map_err(|e| e.to_string())
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
            launch_agent,
            // Sessions
            create_local_session,
            create_ssh_session,
            write_to_session,
            resize_session,
            close_session,
            list_sessions,
            delete_session_record,
            reopen_session,
            debug_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
