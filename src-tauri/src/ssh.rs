use anyhow::{bail, Result};
use async_trait::async_trait;
use russh::{
    client,
    keys::{self, key::PrivateKeyWithHashAlg, HashAlg, PublicKey},
    ChannelId, ChannelMsg, Disconnect,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{Mutex, RwLock};

use crate::session::{SessionStatus, TerminalSession};

pub struct SshSession {
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    channel_id: ChannelId,
    status: Arc<RwLock<SessionStatus>>,
}

struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = anyhow::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        async move {
            // TODO: Implement host key verification
            Ok(true)
        }
    }
}

impl SshSession {
    pub async fn connect(
        id: String,
        host: &str,
        port: u16,
        username: &str,
        auth: SshAuth,
        cols: u16,
        rows: u16,
        app_handle: tauri::AppHandle,
    ) -> Result<Self> {
        let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

        let handler = ClientHandler;

        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(300)),
            ..Default::default()
        };
        let config = Arc::new(config);

        let mut handle = client::connect(config, addr, handler).await?;

        match auth {
            SshAuth::Password(password) => {
                let auth_res = handle.authenticate_password(username, password).await?;
                if !auth_res.success() {
                    bail!("Password authentication failed");
                }
            }
            SshAuth::PrivateKey { path, passphrase } => {
                let key_path = std::path::Path::new(&path);
                if !key_path.exists() {
                    bail!("Private key file not found: {}", path);
                }

                let key_data = std::fs::read(&path)
                    .map_err(|e| anyhow::anyhow!("Failed to read private key file: {}", e))?;

                let key_str = std::str::from_utf8(&key_data).map_err(|e| {
                    anyhow::anyhow!("Private key is not valid UTF-8 PEM text: {}", e)
                })?;

                let key_header = key_str.lines().next().unwrap_or("");
                eprintln!("Key header: {}", key_header);

                let key_pair = keys::decode_secret_key(key_str, passphrase.as_deref())
                    .map_err(|e| anyhow::anyhow!("Failed to parse private key: {}", e))?;

                eprintln!("russh: Private key loaded successfully");
                eprintln!("Private key loaded, authenticating as: {}", username);

                let key_pair = Arc::new(key_pair);

                // 对 RSA key 按顺序尝试:
                // rsa-sha2-512 -> rsa-sha2-256 -> legacy ssh-rsa
                let mut authed = false;

                {
                    let key = PrivateKeyWithHashAlg::new(key_pair.clone(), Some(HashAlg::Sha512));

                    let auth_res =
                        handle
                            .authenticate_publickey(username, key)
                            .await
                            .map_err(|e| {
                                anyhow::anyhow!("SSH authentication error (rsa-sha2-512): {}", e)
                            })?;

                    authed = auth_res.success();
                    eprintln!("auth with rsa-sha2-512: {}", authed);
                }

                if !authed {
                    let key = PrivateKeyWithHashAlg::new(key_pair.clone(), Some(HashAlg::Sha256));

                    let auth_res =
                        handle
                            .authenticate_publickey(username, key)
                            .await
                            .map_err(|e| {
                                anyhow::anyhow!("SSH authentication error (rsa-sha2-256): {}", e)
                            })?;

                    authed = auth_res.success();
                    eprintln!("auth with rsa-sha2-256: {}", authed);
                }

                if !authed {
                    let key = PrivateKeyWithHashAlg::new(key_pair.clone(), None);

                    let auth_res =
                        handle
                            .authenticate_publickey(username, key)
                            .await
                            .map_err(|e| {
                                anyhow::anyhow!("SSH authentication error (legacy ssh-rsa): {}", e)
                            })?;

                    authed = auth_res.success();
                    eprintln!("auth with legacy ssh-rsa: {}", authed);
                }

                if !authed {
                    bail!(
                        "Key authentication failed - server rejected the key after trying rsa-sha2-512, rsa-sha2-256 and ssh-rsa."
                    );
                }
            }
        }

        let mut channel = handle.channel_open_session().await?;
        let channel_id = channel.id();

        channel
            .request_pty(
                true,
                "xterm-256color",
                u32::from(cols),
                u32::from(rows),
                0,
                0,
                &[],
            )
            .await?;

        channel.request_shell(true).await?;

        let handle_arc = Arc::new(Mutex::new(handle));
        let status = Arc::new(RwLock::new(SessionStatus::Connected));
        let status_clone = status.clone();
        let id_clone = id.clone();

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
        handle
            .data(self.channel_id, data.into())
            .await
            .map_err(|_| anyhow::anyhow!("Failed to write data"))?;
        Ok(())
    }

    async fn resize(&self, _cols: u16, _rows: u16) -> Result<()> {
        // window_change is only available on Channel, not Handle.
        // Since the channel is consumed by the reader task, resize is not supported
        // for SSH sessions in the current architecture.
        Ok(())
    }

    async fn close(&mut self) -> Result<()> {
        let handle = self.handle.lock().await;
        handle
            .disconnect(Disconnect::ByApplication, "", "")
            .await
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
    PrivateKey {
        path: String,
        passphrase: Option<String>,
    },
}
