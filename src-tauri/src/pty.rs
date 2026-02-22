use async_trait::async_trait;
use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tauri::Emitter;

use crate::session::{SessionStatus, TerminalSession};

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Box<dyn TerminalSession>>>>,
}

pub struct PtySession {
    id: String,
    writer: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    status: Arc<RwLock<SessionStatus>>,
    _child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    pub async fn create_session(
        &self,
        id: &str,
        shell: Option<String>,
        app_handle: tauri::AppHandle,
    ) -> Result<()> {
        let pty_system = native_pty_system();
        
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        
        let shell_cmd = shell.unwrap_or_else(|| detect_default_shell());
        let mut cmd = CommandBuilder::new(&shell_cmd);
        cmd.cwd(std::env::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/")));
        
        let child = pair.slave.spawn_command(cmd)?;
        
        let session = PtySession::new(id.to_string(), pair.master, child, app_handle)?;
        
        self.sessions.lock().await.insert(id.to_string(), Box::new(session));
        Ok(())
    }
    
    pub async fn get_session(&self, id: &str) -> Option<Box<dyn TerminalSession>> {
        // This is a simplification - proper implementation needs to return a reference
        None
    }
    
    pub async fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(id) {
            session.write(data).await
        } else {
            anyhow::bail!("Session not found: {}", id)
        }
    }
    
    pub async fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(id) {
            session.resize(cols, rows).await
        } else {
            anyhow::bail!("Session not found: {}", id)
        }
    }
    
    pub async fn close_session(&self, id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(mut session) = sessions.remove(id) {
            session.close().await?;
        }
        Ok(())
    }
}

impl PtySession {
    pub fn new(
        id: String,
        mut master: Box<dyn portable_pty::MasterPty + Send>,
        child: Box<dyn portable_pty::Child + Send + Sync>,
        app_handle: tauri::AppHandle,
    ) -> Result<Self> {
        let id_clone = id.clone();
        let status = Arc::new(RwLock::new(SessionStatus::Connected));
        let status_clone = status.clone();
        
        // Spawn reader thread
        let mut reader = master.try_clone_reader()?;
        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let data = buf[..n].to_vec();
                        // Convert to base64 or properly encode for JSON
                        let _ = app_handle.emit(&format!("terminal-data-{}", id_clone), data);
                    }
                    Ok(_) => break,
                    Err(_) => break,
                }
            }
            // Update status when done
            // Note: This won't work as-is since we're in a thread, not async
            // In production, use a channel to communicate back
        });
        
        Ok(Self {
            id,
            writer: Arc::new(Mutex::new(master)),
            status,
            _child: Arc::new(Mutex::new(child)),
        })
    }
}

#[async_trait]
impl TerminalSession for PtySession {
    async fn write(&self, data: &[u8]) -> Result<()> {
        use std::io::Write;
        let mut writer = self.writer.lock().await;
        // portable-pty MasterPty doesn't have async write, we use blocking
        writer.write_all(data)?;
        Ok(())
    }
    
    async fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let writer = self.writer.lock().await;
        writer.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }
    
    async fn close(&mut self) -> Result<()> {
        // The child will be killed when dropped
        *self.status.write().await = SessionStatus::Disconnected;
        Ok(())
    }
    
    fn status(&self) -> SessionStatus {
        // Simplified - should check actual process status
        SessionStatus::Connected
    }
    
    fn session_type(&self) -> &'static str {
        "local"
    }
}

fn detect_default_shell() -> String {
    if cfg!(target_os = "windows") {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}
