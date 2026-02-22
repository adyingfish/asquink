use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

pub struct Database {
    pool: Pool<Sqlite>,
}

#[derive(Debug)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;
        
        let db = Self { pool };
        db.init().await?;
        Ok(db)
    }
    
    async fn init(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_type TEXT NOT NULL,
                private_key_path TEXT,
                passphrase TEXT,
                group_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_connected DATETIME
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                default_args TEXT,
                required_env TEXT,
                install_check_cmd TEXT,
                install_cmd TEXT,
                icon TEXT,
                is_builtin BOOLEAN DEFAULT 0
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                server_id TEXT,
                env_type TEXT NOT NULL,
                agent_id TEXT,
                working_dir TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                FOREIGN KEY (server_id) REFERENCES servers(id),
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Insert built-in agents
        self.init_builtin_agents().await?;

        Ok(())
    }
    
    async fn init_builtin_agents(&self) -> Result<(), sqlx::Error> {
        let claude_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE id = 'claude'")
            .fetch_one(&self.pool)
            .await?;
        
        if claude_exists == 0 {
            sqlx::query(
                r#"
                INSERT INTO agents (id, name, command, default_args, required_env, install_check_cmd, install_cmd, icon, is_builtin)
                VALUES ('claude', 'Claude Code', 'claude', '["--model", "opus"]', '["ANTHROPIC_API_KEY"]', 'which claude', 'npm install -g @anthropic-ai/claude-code', 'claude', 1)
                "#,
            )
            .execute(&self.pool)
            .await?;
        }
        
        Ok(())
    }
    
    pub async fn list_servers(&self) -> Result<Vec<crate::Server>, sqlx::Error> {
        let servers = sqlx::query_as::<_, crate::Server>(
            "SELECT id, name, host, port, username, auth_type FROM servers ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(servers)
    }
    
    pub async fn get_server(&self, id: &str) -> Result<ServerConfig, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, name, host, port, username, auth_type, private_key_path, passphrase FROM servers WHERE id = ?1"
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        
        use sqlx::Row;
        Ok(ServerConfig {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            host: row.try_get("host")?,
            port: row.try_get::<i64, _>("port")? as u16,
            username: row.try_get("username")?,
            auth_type: row.try_get("auth_type")?,
            private_key_path: row.try_get("private_key_path")?,
            passphrase: row.try_get("passphrase")?,
        })
    }
    
    pub async fn create_server(&self, id: &str, req: &crate::CreateServerRequest) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO servers (id, name, host, port, username, auth_type, private_key_path, passphrase)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(id)
        .bind(&req.name)
        .bind(&req.host)
        .bind(req.port)
        .bind(&req.username)
        .bind(&req.auth_type)
        .bind(&req.private_key_path)
        .bind(&req.passphrase)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    
    pub async fn delete_server(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM servers WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>, sqlx::Error> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE key = ?1"
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2"
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_setting(&self, key: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM settings WHERE key = ?1")
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

impl<'r> sqlx::FromRow<'r, sqlx::sqlite::SqliteRow> for crate::Server {
    fn from_row(row: &'r sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(crate::Server {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            host: row.try_get("host")?,
            port: row.try_get::<i64, _>("port")? as u16,
            username: row.try_get("username")?,
            auth_type: row.try_get("auth_type")?,
        })
    }
}
