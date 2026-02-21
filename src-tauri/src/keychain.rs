use keyring::Entry;
use anyhow::{Result, Context};

const SERVICE_NAME: &str = "agenthub";
const API_KEY_ACCOUNT: &str = "anthropic_api_key";

pub fn store_api_key(api_key: &str) -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_ACCOUNT)
        .context("Failed to create keyring entry")?;
    entry.set_password(api_key)
        .context("Failed to store API key")?;
    Ok(())
}

pub fn get_api_key() -> Result<Option<String>> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_ACCOUNT)
        .context("Failed to create keyring entry")?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e).context("Failed to get API key"),
    }
}

pub fn delete_api_key() -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, API_KEY_ACCOUNT)
        .context("Failed to create keyring entry")?;
    entry.delete_credential()
        .context("Failed to delete API key")?;
    Ok(())
}
