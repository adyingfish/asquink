use async_trait::async_trait;
use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum SessionStatus {
    Connecting,
    Connected,
    Disconnected,
    Error(String),
}

#[async_trait]
pub trait TerminalSession: Send + Sync {
    /// Write data to the terminal
    async fn write(&self, data: &[u8]) -> Result<()>;
    
    /// Resize the terminal
    async fn resize(&self, cols: u16, rows: u16) -> Result<()>;
    
    /// Close the session
    async fn close(&mut self) -> Result<()>;
    
    /// Get current status
    fn status(&self) -> SessionStatus;
    
    /// Get session type
    fn session_type(&self) -> &'static str;
}
