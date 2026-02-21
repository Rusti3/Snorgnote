use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use core_domain::CaptureSource;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturedPayload {
    pub source: CaptureSource,
    pub external_id: String,
    pub content_md: String,
    pub metadata: BTreeMap<String, String>,
}

pub trait CaptureAdapter: Send + Sync {
    fn source_name(&self) -> &'static str;
    fn fetch(&self) -> Result<Vec<CapturedPayload>, String>;
}

#[derive(Debug, Default, Clone)]
pub struct ManualCaptureAdapter {
    queue: Arc<Mutex<Vec<CapturedPayload>>>,
}

impl ManualCaptureAdapter {
    pub fn push(&self, payload: CapturedPayload) {
        if let Ok(mut queue) = self.queue.lock() {
            queue.push(payload);
        }
    }
}

impl CaptureAdapter for ManualCaptureAdapter {
    fn source_name(&self) -> &'static str {
        "manual"
    }

    fn fetch(&self) -> Result<Vec<CapturedPayload>, String> {
        let mut queue = self
            .queue
            .lock()
            .map_err(|_| "manual queue lock poisoned".to_string())?;
        Ok(std::mem::take(&mut *queue))
    }
}

#[derive(Debug, Default, Clone)]
pub struct TelegramAdapter;

impl CaptureAdapter for TelegramAdapter {
    fn source_name(&self) -> &'static str {
        "telegram"
    }

    fn fetch(&self) -> Result<Vec<CapturedPayload>, String> {
        Err("telegram adapter is not implemented in v0.1".to_string())
    }
}

#[derive(Debug, Default, Clone)]
pub struct EmailAdapter;

impl CaptureAdapter for EmailAdapter {
    fn source_name(&self) -> &'static str {
        "email"
    }

    fn fetch(&self) -> Result<Vec<CapturedPayload>, String> {
        Err("email adapter is not implemented in v0.1".to_string())
    }
}

#[derive(Debug, Default, Clone)]
pub struct BrowserClipperAdapter;

impl CaptureAdapter for BrowserClipperAdapter {
    fn source_name(&self) -> &'static str {
        "browser"
    }

    fn fetch(&self) -> Result<Vec<CapturedPayload>, String> {
        Err("browser adapter is not implemented in v0.1".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_adapter_drains_items() {
        let adapter = ManualCaptureAdapter::default();
        adapter.push(CapturedPayload {
            source: CaptureSource::Manual,
            external_id: "m1".to_string(),
            content_md: "hello".to_string(),
            metadata: BTreeMap::new(),
        });
        let first = adapter.fetch().expect("first fetch should work");
        let second = adapter.fetch().expect("second fetch should work");
        assert_eq!(first.len(), 1);
        assert!(second.is_empty());
    }

    #[test]
    fn scaffold_adapters_return_not_implemented() {
        let result = TelegramAdapter.fetch();
        assert!(
            result
                .expect_err("telegram adapter should fail")
                .contains("not implemented")
        );
    }
}
