use async_trait::async_trait;
use anyhow::{Result, bail};
use russh::{client, ChannelId, ChannelMsg, Disconnect};
use ssh_key::PublicKey;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tauri::Emitter;

use crate::session::{SessionStatus, TerminalSession};

pub struct SshSession {
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    channel_id: ChannelId,
    status: Arc<RwLock<SessionStatus>>,
}

struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = anyhow::Error;

    async fn check_server_key(&mut self, _server_public_key: &PublicKey) -> Result<bool, Self::Error> {
        // TODO: Implement host key verification
        Ok(true)
    }
}

impl SshSession {
    pub async fn connect(
        id: String,
        host: &str,
        port: u16,
        username: &str,
        auth: SshAuth,
        app_handle: tauri::AppHandle,
    ) -> Result<Self> {
        let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

        // Create SSH handler
        let handler = ClientHandler;

        // Connect to server
        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(300)),
            ..Default::default()
        };
        let config = Arc::new(config);

        let mut handle = client::connect(config, addr, handler).await?;

        // Authenticate
        match auth {
            SshAuth::Password(password) => {
                let auth_res = handle.authenticate_password(username, password).await?;
                if !auth_res {
                    bail!("Password authentication failed");
                }
            }
            SshAuth::PrivateKey { path, passphrase } => {
                let key_pair = if let Some(pass) = passphrase {
                    russh_keys::load_secret_key(&path, Some(&pass))?
                } else {
                    russh_keys::load_secret_key(&path, None)?
                };
                let auth_res = handle.authenticate_publickey(username, Arc::new(key_pair)).await?;
                if !auth_res {
                    bail!("Key authentication failed");
                }
            }
        }

        // Open channel
        let mut channel = handle.channel_open_session().await?;
        let channel_id = channel.id();

        // Request PTY
        channel.request_pty(true, "xterm-256color", 80, 24, 0, 0, &[]).await?;

        // Request shell
        channel.request_shell(true).await?;

        let handle_arc = Arc::new(Mutex::new(handle));
        let status = Arc::new(RwLock::new(SessionStatus::Connected));
        let status_clone = status.clone();
        let id_clone = id.clone();

        // Spawn task to read from channel and emit events
        tokio::spawn(async move {
            loop {
                match channel.wait().await {
                    Some(ChannelMsg::Data { ref data, .. }) => {
                        let data_vec = data.to_vec();
                        let _ = app_handle.emit(&format!("terminal-data-{}", id_clone), data_vec);
                    }
                    Some(ChannelMsg::ExitStatus { .. }) => {
                        let _ = app_handle.emit(&format!("terminal-closed-{}", id_clone), ());
                        break;
                    }
                    None => {
                        let _ = app_handle.emit(&format!("terminal-closed-{}", id_clone), ());
                        break;
                    }
                    _ => {}
                }
            }
            *status_clone.write().await = SessionStatus::Disconnected;
        });

        Ok(Self {
            handle: handle_arc,
            channel_id,
            status,
        })
    }
}

#[async_trait]
impl TerminalSession for SshSession {
    async fn write(&self, data: &[u8]) -> Result<()> {
        let handle = self.handle.lock().await;
        handle.data(self.channel_id, data.into()).await
            .map_err(|_| anyhow::anyhow!("Failed to write data"))?;
        Ok(())
    }

    async fn resize(&self, _cols: u16, _rows: u16) -> Result<()> {
        // window_change is only available on Channel, not Handle.
        // Since the channel is consumed by the reader task, resize is not supported
        // for SSH sessions in the current architecture.
        // TODO: Restructure to share the channel for resize support.
        Ok(())
    }

    async fn close(&mut self) -> Result<()> {
        let handle = self.handle.lock().await;
        handle.disconnect(Disconnect::ByApplication, "", "").await
            .map_err(|e| anyhow::anyhow!("Disconnect failed: {:?}", e))?;
        *self.status.write().await = SessionStatus::Disconnected;
        Ok(())
    }

    fn status(&self) -> SessionStatus {
        SessionStatus::Connected
    }

    fn session_type(&self) -> &'static str {
        "ssh"
    }
}

pub enum SshAuth {
    Password(String),
    PrivateKey { path: String, passphrase: Option<String> },
}
