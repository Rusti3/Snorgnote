use anyhow::{anyhow, bail, Context, Result};
use reqwest::blocking::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};

const TELEGRAM_API_BASE: &str = "https://api.telegram.org";

#[derive(Debug, Clone)]
pub struct TelegramBotApiClient {
    bot_token: String,
    client: Client,
}

#[derive(Debug, Deserialize)]
struct TelegramApiEnvelope<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramUser {
    pub id: i64,
    #[serde(default)]
    pub is_bot: bool,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub first_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramChat {
    pub id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramMessage {
    pub message_id: i64,
    #[serde(default)]
    pub date: Option<i64>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub caption: Option<String>,
    #[serde(default)]
    pub from: Option<TelegramUser>,
    pub chat: TelegramChat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramUpdate {
    pub update_id: i64,
    #[serde(default)]
    pub message: Option<TelegramMessage>,
}

impl TelegramBotApiClient {
    pub fn new(bot_token: &str) -> Result<Self> {
        if bot_token.trim().is_empty() {
            bail!("telegram bot token is empty");
        }

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(40))
            .build()
            .context("failed to initialize telegram http client")?;

        Ok(Self {
            bot_token: bot_token.trim().to_string(),
            client,
        })
    }

    pub fn get_me(&self) -> Result<TelegramUser> {
        self.request("getMe", &[])
    }

    pub fn get_updates(
        &self,
        offset: Option<i64>,
        timeout_sec: u32,
    ) -> Result<Vec<TelegramUpdate>> {
        let mut params = Vec::with_capacity(2);
        if let Some(offset) = offset {
            params.push(("offset".to_string(), offset.to_string()));
        }
        params.push(("timeout".to_string(), timeout_sec.to_string()));
        self.request("getUpdates", &params)
    }

    fn request<T>(&self, method: &str, params: &[(String, String)]) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let url = format!("{TELEGRAM_API_BASE}/bot{}/{}", self.bot_token, method);
        let mut request = self.client.get(&url);
        if !params.is_empty() {
            request = request.query(params);
        }

        let response = request
            .send()
            .with_context(|| format!("telegram API request failed for `{method}`"))?;
        let response = response
            .error_for_status()
            .with_context(|| format!("telegram API returned non-success status for `{method}`"))?;

        let envelope: TelegramApiEnvelope<T> = response
            .json()
            .with_context(|| format!("invalid telegram API JSON for `{method}`"))?;

        if !envelope.ok {
            let description = envelope
                .description
                .unwrap_or_else(|| "unknown telegram API error".to_string());
            bail!(description);
        }

        envelope
            .result
            .ok_or_else(|| anyhow!("telegram API response missing result for `{method}`"))
    }
}
