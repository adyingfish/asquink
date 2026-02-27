use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

pub struct Database {
    pool: Pool<Sqlite>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct EnvConfig {
    pub id: String,
    pub name: String,
    pub env_type: String, // "local" | "ssh" | "wsl"
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_type: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub icon: Option<String>,
    // WSL-specific
    pub wsl_distro: Option<String>,
    pub wsl_user: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub env_id: String,
    pub lang: Option<String>,
}

// Session record for persistence
#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
pub struct SessionRecord {
    pub id: String,
    pub name: Option<String>,
    pub env_id: Option<String>,
    pub env_type: String,
    pub agent_id: Option<String>,
    pub project_id: Option<String>,
    pub project_path: Option<String>,
    pub working_dir: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
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
        // Create envs table (new unified environment table)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS envs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'ssh',
                host TEXT,
                port INTEGER,
                username TEXT,
                auth_type TEXT,
                private_key_path TEXT,
                passphrase TEXT,
                icon TEXT,
                status TEXT DEFAULT 'offline',
                detail TEXT,
                wsl_distro TEXT,
                wsl_user TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_connected DATETIME
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Migrate from servers table to envs table if servers exists
        self.migrate_servers_to_envs().await?;

        // Migrate envs table to add WSL columns
        self.migrate_envs_table().await?;

        // Ensure default local environment exists
        self.ensure_local_env().await?;

        // Create agents table
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

        // Create sessions table (updated to reference envs)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                env_id TEXT,
                env_type TEXT NOT NULL,
                agent_id TEXT,
                working_dir TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                FOREIGN KEY (env_id) REFERENCES envs(id),
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Migrate sessions table - add new columns if they don't exist
        self.migrate_sessions_table().await?;

        // Create settings table
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

        // Create projects table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                env_id TEXT NOT NULL,
                lang TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (env_id) REFERENCES envs(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create messages table (for chat view)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                text TEXT,
                parts TEXT,
                thinking TEXT,
                tokens TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Insert built-in agents
        self.init_builtin_agents().await?;

        Ok(())
    }

    async fn migrate_servers_to_envs(&self) -> Result<(), sqlx::Error> {
        // Check if servers table exists
        let servers_exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='servers'"
        )
        .fetch_one(&self.pool)
        .await?;

        if servers_exists == 0 {
            return Ok(());
        }

        // Check if envs table is empty (migration not done yet)
        let envs_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envs")
            .fetch_one(&self.pool)
            .await?;

        if envs_count > 0 {
            // Migration already done, drop old servers table
            sqlx::query("DROP TABLE IF EXISTS servers")
                .execute(&self.pool)
                .await?;
            return Ok(());
        }

        // Migrate data from servers to envs
        sqlx::query(
            r#"
            INSERT INTO envs (id, name, type, host, port, username, auth_type, private_key_path, passphrase, icon, status, created_at, last_connected)
            SELECT id, name, 'ssh', host, port, username, auth_type, private_key_path, passphrase, 'cloud', 'offline', created_at, last_connected
            FROM servers
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Drop old servers table
        sqlx::query("DROP TABLE servers")
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    async fn migrate_envs_table(&self) -> Result<(), sqlx::Error> {
        // Get current table info
        let columns: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM pragma_table_info('envs')"
        )
        .fetch_all(&self.pool)
        .await?;

        let column_names: Vec<&str> = columns.iter().map(|(name,)| name.as_str()).collect();

        // Add WSL-specific columns if they don't exist
        if !column_names.contains(&"wsl_distro") {
            sqlx::query("ALTER TABLE envs ADD COLUMN wsl_distro TEXT")
                .execute(&self.pool)
                .await?;
        }
        if !column_names.contains(&"wsl_user") {
            sqlx::query("ALTER TABLE envs ADD COLUMN wsl_user TEXT")
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    async fn ensure_local_env(&self) -> Result<(), sqlx::Error> {
        let local_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envs WHERE id = 'local'")
            .fetch_one(&self.pool)
            .await?;

        if local_exists == 0 {
            // Detect system info for local environment
            let system_info = Self::detect_system_info();

            sqlx::query(
                r#"
                INSERT INTO envs (id, name, type, detail, icon, status)
                VALUES ('local', 'Local Terminal', 'local', ?1, 'terminal', 'online')
                "#,
            )
            .bind(&system_info)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    fn detect_system_info() -> String {
        let os = std::env::consts::OS;
        match os {
            "windows" => {
                // Try PowerShell first
                if let Ok(output) = std::process::Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-Command",
                        "(Get-CimInstance Win32_OperatingSystem).Caption",
                    ])
                    .output()
                {
                    let caption = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !caption.is_empty() {
                        if let Some(stripped) = caption.strip_prefix("Microsoft ") {
                            let parts: Vec<&str> = stripped.split_whitespace().collect();
                            if parts.len() >= 2 {
                                return format!("{} {}", parts[0], parts[1]);
                            }
                            return stripped.to_string();
                        }
                        return caption;
                    }
                }

                // Fallback to registry via cmd
                if let Ok(output) = std::process::Command::new("cmd")
                    .args(["/C", "reg query \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\" /v ProductName"])
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        if line.contains("ProductName") {
                            if let Some(pos) = line.find("REG_SZ") {
                                let name = line[pos + 6..].trim();
                                let parts: Vec<&str> = name.split_whitespace().collect();
                                if parts.len() >= 2 {
                                    return format!("{} {}", parts[0], parts[1]);
                                }
                                return name.to_string();
                            }
                        }
                    }
                }

                "Windows".to_string()
            }
            "macos" => {
                if let Ok(output) = std::process::Command::new("sw_vers")
                    .arg("-productVersion")
                    .output()
                {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    format!("macOS {}", version)
                } else {
                    "macOS".to_string()
                }
            }
            "linux" => {
                if let Ok(contents) = std::fs::read_to_string("/etc/os-release") {
                    for line in contents.lines() {
                        if line.starts_with("PRETTY_NAME=") {
                            return line.replace("PRETTY_NAME=", "").trim_matches('"').to_string();
                        }
                    }
                }
                "Linux".to_string()
            }
            _ => os.to_string(),
        }
    }

    async fn migrate_sessions_table(&self) -> Result<(), sqlx::Error> {
        // Get current table info
        let columns: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM pragma_table_info('sessions')"
        )
        .fetch_all(&self.pool)
        .await?;

        let column_names: Vec<&str> = columns.iter().map(|(name,)| name.as_str()).collect();

        // Add missing columns
        if !column_names.contains(&"env_id") {
            sqlx::query("ALTER TABLE sessions ADD COLUMN env_id TEXT")
                .execute(&self.pool)
                .await?;
        }
        if !column_names.contains(&"name") {
            sqlx::query("ALTER TABLE sessions ADD COLUMN name TEXT")
                .execute(&self.pool)
                .await?;
        }
        if !column_names.contains(&"project_id") {
            sqlx::query("ALTER TABLE sessions ADD COLUMN project_id TEXT")
                .execute(&self.pool)
                .await?;
        }
        if !column_names.contains(&"project_path") {
            sqlx::query("ALTER TABLE sessions ADD COLUMN project_path TEXT")
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    async fn init_builtin_agents(&self) -> Result<(), sqlx::Error> {
        // List of all builtin agents to seed
        let builtin_agents = [
            ("claude", "Claude Code", "claude", r#"["--model", "opus"]"#, r#"["ANTHROPIC_API_KEY"]"#, "which claude", "npm install -g @anthropic-ai/claude-code", "claude"),
            ("codex", "Codex", "codex", "[]", "[]", "which codex", "npm install -g @openai/codex", "codex"),
            ("gemini", "Gemini CLI", "gemini", "[]", r#"["GEMINI_API_KEY"]"#, "which gemini", "npm install -g @anthropic/gemini-cli", "gemini"),
            ("opencode", "OpenCode", "opencode", "[]", "[]", "which opencode", "npm install -g opencode", "opencode"),
            ("openclaw", "OpenClaw", "openclaw", "[]", "[]", "which openclaw", "npm install -g openclaw", "openclaw"),
        ];

        for (id, name, command, default_args, required_env, install_check_cmd, install_cmd, icon) in builtin_agents {
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE id = ?1")
                .bind(id)
                .fetch_one(&self.pool)
                .await?;

            if exists == 0 {
                sqlx::query(
                    r#"
                    INSERT INTO agents (id, name, command, default_args, required_env, install_check_cmd, install_cmd, icon, is_builtin)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)
                    "#,
                )
                .bind(id)
                .bind(name)
                .bind(command)
                .bind(default_args)
                .bind(required_env)
                .bind(install_check_cmd)
                .bind(install_cmd)
                .bind(icon)
                .execute(&self.pool)
                .await?;
            }
        }

        Ok(())
    }

    pub async fn list_envs(&self) -> Result<Vec<crate::Env>, sqlx::Error> {
        let envs = sqlx::query_as::<_, crate::Env>(
            "SELECT id, name, type, host, port, username, auth_type, icon, status, detail, wsl_distro, wsl_user FROM envs ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(envs)
    }

    pub async fn get_env(&self, id: &str) -> Result<EnvConfig, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, name, type, host, port, username, auth_type, private_key_path, passphrase, icon, wsl_distro, wsl_user FROM envs WHERE id = ?1"
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        use sqlx::Row;
        Ok(EnvConfig {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            env_type: row.try_get("type")?,
            host: row.try_get("host")?,
            port: row.try_get::<Option<i64>, _>("port")?.map(|p| p as u16),
            username: row.try_get("username")?,
            auth_type: row.try_get("auth_type")?,
            private_key_path: row.try_get("private_key_path")?,
            passphrase: row.try_get("passphrase")?,
            icon: row.try_get("icon")?,
            wsl_distro: row.try_get("wsl_distro")?,
            wsl_user: row.try_get("wsl_user")?,
        })
    }

    pub async fn create_env(&self, id: &str, req: &crate::CreateEnvRequest) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO envs (id, name, type, host, port, username, auth_type, private_key_path, passphrase, icon, wsl_distro, wsl_user, status)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'offline')
            "#,
        )
        .bind(id)
        .bind(&req.name)
        .bind(&req.env_type)
        .bind(&req.host)
        .bind(req.port)
        .bind(&req.username)
        .bind(&req.auth_type)
        .bind(&req.private_key_path)
        .bind(&req.passphrase)
        .bind(&req.icon)
        .bind(&req.wsl_distro)
        .bind(&req.wsl_user)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_env_status(&self, id: &str, status: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE envs SET status = ?1 WHERE id = ?2")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_env(&self, id: &str) -> Result<(), sqlx::Error> {
        // Prevent deleting the default local environment
        if id == "local" {
            return Err(sqlx::Error::RowNotFound);
        }
        sqlx::query("DELETE FROM envs WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // Legacy methods for backward compatibility
    pub async fn list_servers(&self) -> Result<Vec<crate::Server>, sqlx::Error> {
        // Return SSH envs as servers for backward compatibility
        let envs = sqlx::query_as::<_, crate::Server>(
            "SELECT id, name, host, port, username, auth_type FROM envs WHERE type = 'ssh' ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(envs)
    }

    #[allow(dead_code)]
    pub async fn get_server(&self, id: &str) -> Result<EnvConfig, sqlx::Error> {
        self.get_env(id).await
    }

    pub async fn create_server(&self, id: &str, req: &crate::CreateServerRequest) -> Result<(), sqlx::Error> {
        let env_req = crate::CreateEnvRequest {
            name: req.name.clone(),
            env_type: "ssh".to_string(),
            host: Some(req.host.clone()),
            port: Some(req.port),
            username: Some(req.username.clone()),
            auth_type: Some(req.auth_type.clone()),
            private_key_path: req.private_key_path.clone(),
            passphrase: req.passphrase.clone(),
            icon: Some("cloud".to_string()),
            wsl_distro: None,
            wsl_user: None,
        };
        self.create_env(id, &env_req).await
    }

    pub async fn delete_server(&self, id: &str) -> Result<(), sqlx::Error> {
        self.delete_env(id).await
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

    // Project management methods
    pub async fn list_projects(&self) -> Result<Vec<crate::Project>, sqlx::Error> {
        let projects = sqlx::query_as::<_, crate::Project>(
            "SELECT id, name, path, env_id, lang FROM projects ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(projects)
    }

    #[allow(dead_code)]
    pub async fn get_project(&self, id: &str) -> Result<ProjectConfig, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, name, path, env_id, lang FROM projects WHERE id = ?1"
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        use sqlx::Row;
        Ok(ProjectConfig {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            path: row.try_get("path")?,
            env_id: row.try_get("env_id")?,
            lang: row.try_get("lang")?,
        })
    }

    pub async fn create_project(&self, id: &str, req: &crate::CreateProjectRequest) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO projects (id, name, path, env_id, lang)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
        )
        .bind(id)
        .bind(&req.name)
        .bind(&req.path)
        .bind(&req.env_id)
        .bind(&req.lang)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_project(&self, id: &str, req: &crate::CreateProjectRequest) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE projects SET name = ?1, path = ?2, env_id = ?3, lang = ?4 WHERE id = ?5
            "#,
        )
        .bind(&req.name)
        .bind(&req.path)
        .bind(&req.env_id)
        .bind(&req.lang)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_project(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM projects WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // Session management methods
    pub async fn create_session(&self, session: &SessionRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO sessions (id, name, env_id, env_type, agent_id, project_id, project_path, working_dir, started_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))
            "#,
        )
        .bind(&session.id)
        .bind(&session.name)
        .bind(&session.env_id)
        .bind(&session.env_type)
        .bind(&session.agent_id)
        .bind(&session.project_id)
        .bind(&session.project_path)
        .bind(&session.working_dir)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_sessions(&self) -> Result<Vec<SessionRecord>, sqlx::Error> {
        let sessions = sqlx::query_as::<_, SessionRecord>(
            "SELECT id, name, env_id, env_type, agent_id, project_id, project_path, working_dir, started_at, ended_at FROM sessions ORDER BY started_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(sessions)
    }

    pub async fn end_session(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sessions SET ended_at = datetime('now') WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_session(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM sessions WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn reopen_session(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sessions SET ended_at = NULL, started_at = datetime('now') WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

impl<'r> sqlx::FromRow<'r, sqlx::sqlite::SqliteRow> for crate::Env {
    fn from_row(row: &'r sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(crate::Env {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            env_type: row.try_get("type")?,
            host: row.try_get("host")?,
            port: row.try_get::<Option<i64>, _>("port")?.map(|p| p as u16),
            username: row.try_get("username")?,
            auth_type: row.try_get("auth_type")?,
            icon: row.try_get("icon")?,
            status: row.try_get("status")?,
            detail: row.try_get("detail")?,
            wsl_distro: row.try_get("wsl_distro")?,
            wsl_user: row.try_get("wsl_user")?,
        })
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

impl<'r> sqlx::FromRow<'r, sqlx::sqlite::SqliteRow> for crate::Project {
    fn from_row(row: &'r sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(crate::Project {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            path: row.try_get("path")?,
            env_id: row.try_get("env_id")?,
            lang: row.try_get("lang")?,
        })
    }
}
