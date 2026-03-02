use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::Emitter;
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};

use crate::session::{SessionStatus, TerminalSession};

pub struct WslManager {
    sessions: Arc<Mutex<HashMap<String, Box<dyn TerminalSession>>>>,
}

pub struct WslSession {
    #[allow(dead_code)]
    id: String,
    distro: String,
    #[allow(dead_code)]
    user: Option<String>,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    status: Arc<RwLock<SessionStatus>>,
    _child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

/// WSL distribution info
#[derive(Debug, Clone, serde::Serialize)]
pub struct WslDistro {
    pub name: String,
    pub is_default: bool,
    pub state: String,
    pub version: u8,
}

impl WslManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// List available WSL distributions
    pub async fn list_distros() -> Result<Vec<WslDistro>> {
        let output = Command::new("wsl.exe")
            .args(["--list", "--verbose"])
            .output()
            .await?;

        if !output.status.success() {
            anyhow::bail!("Failed to list WSL distributions");
        }

        // WSL output is in UTF-16LE on Windows
        let stdout = String::from_utf16_lossy(
            &output
                .stdout
                .chunks(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk.get(1).copied().unwrap_or(0)]))
                .collect::<Vec<u16>>(),
        );

        parse_wsl_list(&stdout)
    }

    /// Check if WSL is installed
    pub async fn is_wsl_installed() -> bool {
        Command::new("wsl.exe")
            .arg("--status")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub async fn create_session(
        &self,
        id: &str,
        distro: &str,
        user: Option<&str>,
        cols: u16,
        rows: u16,
        working_dir: Option<String>,
        app_handle: tauri::AppHandle,
    ) -> Result<()> {
        use portable_pty::{native_pty_system, CommandBuilder, PtySize};

        let pty_system = native_pty_system();

        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        // Build wsl command
        let mut cmd = CommandBuilder::new("wsl.exe");

        // Add distribution
        cmd.arg("--distribution");
        cmd.arg(distro);

        // Add user if specified
        if let Some(u) = user {
            cmd.arg("--user");
            cmd.arg(u);
        }

        // Set working directory - default to ~ (user's home) if not specified
        let wsl_path = working_dir
            .as_ref()
            .map(|dir| {
                // Convert Windows path to WSL path if needed
                if dir.contains(':') {
                    // Windows path like C:\Users\... -> /mnt/c/Users/...
                    self::windows_to_wsl_path(dir)
                } else {
                    dir.clone()
                }
            })
            .unwrap_or_else(|| "~".to_string());

        cmd.arg("--cd");
        cmd.arg(&wsl_path);

        // Start with login shell
        cmd.arg("--exec");
        cmd.arg("bash");

        let child = pair.slave.spawn_command(cmd)?;

        let session = WslSession::new(
            id.to_string(),
            distro.to_string(),
            user.map(String::from),
            pair.master,
            child,
            app_handle,
        )?;

        self.sessions
            .lock()
            .await
            .insert(id.to_string(), Box::new(session));
        Ok(())
    }

    pub async fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(id) {
            session.write(data).await
        } else {
            anyhow::bail!("WSL session not found: {}", id)
        }
    }

    pub async fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(id) {
            session.resize(cols, rows).await
        } else {
            anyhow::bail!("WSL session not found: {}", id)
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

impl WslSession {
    pub fn new(
        id: String,
        distro: String,
        user: Option<String>,
        master: Box<dyn portable_pty::MasterPty + Send>,
        child: Box<dyn portable_pty::Child + Send + Sync>,
        app_handle: tauri::AppHandle,
    ) -> Result<Self> {
        let id_clone = id.clone();
        let status = Arc::new(RwLock::new(SessionStatus::Connected));

        // Spawn reader thread
        let mut reader = master.try_clone_reader()?;
        let writer = master.take_writer()?;

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let data = buf[..n].to_vec();
                        let _ = app_handle.emit(&format!("terminal-data-{}", id_clone), data);
                    }
                    Ok(_) => break,
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            id,
            distro,
            user,
            master: Arc::new(Mutex::new(master)),
            writer: Arc::new(Mutex::new(writer)),
            status,
            _child: Arc::new(Mutex::new(child)),
        })
    }
}

#[async_trait]
impl TerminalSession for WslSession {
    async fn write(&self, data: &[u8]) -> Result<()> {
        use std::io::Write;
        let mut writer = self.writer.lock().await;
        writer.write_all(data)?;
        Ok(())
    }

    async fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        use portable_pty::PtySize;
        let master = self.master.lock().await;
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    async fn close(&mut self) -> Result<()> {
        *self.status.write().await = SessionStatus::Disconnected;
        Ok(())
    }

    fn status(&self) -> SessionStatus {
        SessionStatus::Connected
    }

    fn session_type(&self) -> &'static str {
        "wsl"
    }
}

/// Parse WSL --list --verbose output
fn parse_wsl_list(output: &str) -> Result<Vec<WslDistro>> {
    let mut distros = Vec::new();

    for line in output.lines().skip(1) {
        // Skip header line
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parse: "  * Ubuntu    Running    2"
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            let is_default = parts[0] == "*";
            let name_idx = if is_default { 1 } else { 0 };

            if let Some(name) = parts.get(name_idx) {
                let state = parts.get(name_idx + 1).unwrap_or(&"Unknown").to_string();
                let version = parts
                    .get(name_idx + 2)
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(2);

                distros.push(WslDistro {
                    name: name.to_string(),
                    is_default,
                    state,
                    version,
                });
            }
        }
    }

    Ok(distros)
}

/// Convert Windows path to WSL path
/// C:\Users\... -> /mnt/c/Users/...
fn windows_to_wsl_path(path: &str) -> String {
    // Handle UNC paths
    if path.starts_with("\\\\") {
        return path.replace("\\", "/");
    }

    // Handle drive letter paths (C:\...)
    if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        let drive = path.chars().next().unwrap().to_ascii_lowercase();
        let rest = &path[2..].replace('\\', "/");
        return format!("/mnt/{}{}", drive, rest);
    }

    // Already a Unix-style path or relative path
    path.replace('\\', "/")
}

/// Scan for agents in a WSL distribution
pub async fn scan_agents_in_distro(
    distro: &str,
    user: Option<&str>,
) -> Result<Vec<crate::AgentInfo>> {
    let agents = crate::get_agent_definitions();
    let mut result = Vec::new();

    for (id, name, executable) in agents {
        // Build wsl command to check if executable exists
        let mut cmd = Command::new("wsl.exe");
        cmd.arg("--distribution");
        cmd.arg(distro);

        if let Some(u) = user {
            cmd.arg("--user");
            cmd.arg(u);
        }

        cmd.arg("--exec");
        cmd.arg("which");
        cmd.arg(executable);

        let output = cmd.output().await;
        let installed = output.map(|o| o.status.success()).unwrap_or(false);

        let version = if installed {
            let mut version_cmd = Command::new("wsl.exe");
            version_cmd.arg("--distribution");
            version_cmd.arg(distro);

            if let Some(u) = user {
                version_cmd.arg("--user");
                version_cmd.arg(u);
            }

            version_cmd.arg("--exec");
            version_cmd.arg(executable);
            version_cmd.arg("--version");

            let version_output = version_cmd.output().await.ok();

            version_output.and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout)
                        .ok()
                        .map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
        } else {
            None
        };

        result.push(crate::AgentInfo {
            id: id.to_string(),
            name: name.to_string(),
            executable: executable.to_string(),
            installed,
            version,
        });
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_to_wsl_path() {
        assert_eq!(windows_to_wsl_path("C:\\Users\\test"), "/mnt/c/Users/test");
        assert_eq!(
            windows_to_wsl_path("D:\\Projects\\myapp"),
            "/mnt/d/Projects/myapp"
        );
        assert_eq!(windows_to_wsl_path("/home/user"), "/home/user");
    }
}
