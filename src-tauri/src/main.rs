// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;

mod database;
mod keychain;
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
    password: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct CreateSshSessionRequest {
    server_id: String,
    password: Option<String>,
}

#[derive(serde::Serialize)]
pub struct AgentStatus {
    installed: bool,
    version: Option<String>,
}

// Initialize database on app start
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
    
    let db_path = app_dir.join("agenthub.db");
    let db = tauri::async_runtime::block_on(Database::new(db_path.to_str().unwrap()))?;
    
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
async fn save_api_key(api_key: String) -> Result<(), String> {
    keychain::store_api_key(&api_key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_api_key() -> Result<Option<String>, String> {
    keychain::get_api_key().map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_api_key() -> Result<(), String> {
    keychain::delete_api_key().map_err(|e| e.to_string())
}

// Server management commands
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
    let api_key = keychain::get_api_key()
        .map_err(|e| e.to_string())?
        .ok_or("API key not configured. Please set it in Settings.")?;
    
    let state = state.lock().await;
    
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
    shell: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;
    let session_id = uuid::Uuid::new_v4().to_string();
    state.pty_manager.create_session(&session_id, shell, app_handle).await.map_err(|e| e.to_string())?;
    Ok(session_id)
}

#[tauri::command]
async fn create_ssh_session(
    state: State<'_, Arc<Mutex<AppState>>>,
    req: CreateSshSessionRequest,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let state = state.lock().await;
    
    // Get server config from database
    let server = state.db.get_server(&req.server_id).await.map_err(|e| e.to_string())?;
    
    let session_id = uuid::Uuid::new_v4().to_string();
    
    // Determine auth method
    let auth = if server.auth_type == "password" {
        match req.password {
            Some(pwd) => SshAuth::Password(pwd),
            None => return Err("Password required".to_string()),
        }
    } else {
        let key_path = server.private_key_path.ok_or("Private key path not configured")?;
        SshAuth::PrivateKey {
            path: key_path,
            passphrase: server.passphrase,
        }
    };
    
    // Create SSH session
    let session = SshSession::connect(
        session_id.clone(),
        &server.host,
        server.port,
        &server.username,
        auth,
        app_handle,
    ).await.map_err(|e| e.to_string())?;
    
    state.ssh_sessions.lock().await.insert(session_id.clone(), session);
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
    let mut state = state.lock().await;
    
    if session_type == "local" {
        state.pty_manager.close_session(&session_id).await.map_err(|e| e.to_string())
    } else if session_type == "ssh" {
        let mut sessions = state.ssh_sessions.lock().await;
        if let Some(mut session) = sessions.remove(&session_id) {
            session.close().await.map_err(|e| e.to_string())
        } else {
            Ok(())
        }
    } else {
        Err("Unknown session type".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            // API Key
            save_api_key,
            get_api_key,
            delete_api_key,
            // Servers
            list_servers,
            create_server,
            delete_server,
            // Agents
            check_agent_installed,
            launch_agent,
            // Sessions
            create_local_session,
            create_ssh_session,
            write_to_session,
            resize_session,
            close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
