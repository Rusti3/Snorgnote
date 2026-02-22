#![allow(dead_code)]

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedItem {
    pub external_id: String,
    pub source: String,
    pub content_text: String,
    pub metadata_json: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterHealth {
    pub ok: bool,
    pub message: String,
}

pub trait Adapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn pull(&self) -> Result<Vec<CapturedItem>>;
    fn ack(&self, id: &str) -> Result<()>;
    fn health(&self) -> AdapterHealth;
}
