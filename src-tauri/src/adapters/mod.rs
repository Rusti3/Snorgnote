#![allow(dead_code)]

pub mod traits;

use anyhow::Result;

use crate::adapters::traits::{Adapter, AdapterHealth, CapturedItem};

#[derive(Default)]
pub struct TelegramAdapter;

impl Adapter for TelegramAdapter {
    fn name(&self) -> &'static str {
        "telegram_stub"
    }

    fn pull(&self) -> Result<Vec<CapturedItem>> {
        Ok(Vec::new())
    }

    fn ack(&self, _id: &str) -> Result<()> {
        Ok(())
    }

    fn health(&self) -> AdapterHealth {
        AdapterHealth {
            ok: true,
            message: "stub adapter: API contract ready, implementation planned for v0.2+"
                .to_string(),
        }
    }
}

#[derive(Default)]
pub struct EmailAdapter;

impl Adapter for EmailAdapter {
    fn name(&self) -> &'static str {
        "email_stub"
    }

    fn pull(&self) -> Result<Vec<CapturedItem>> {
        Ok(Vec::new())
    }

    fn ack(&self, _id: &str) -> Result<()> {
        Ok(())
    }

    fn health(&self) -> AdapterHealth {
        AdapterHealth {
            ok: true,
            message: "stub adapter: API contract ready, implementation planned for v0.2+"
                .to_string(),
        }
    }
}

#[derive(Default)]
pub struct BrowserClipperAdapter;

impl Adapter for BrowserClipperAdapter {
    fn name(&self) -> &'static str {
        "browser_clipper_stub"
    }

    fn pull(&self) -> Result<Vec<CapturedItem>> {
        Ok(Vec::new())
    }

    fn ack(&self, _id: &str) -> Result<()> {
        Ok(())
    }

    fn health(&self) -> AdapterHealth {
        AdapterHealth {
            ok: true,
            message: "stub adapter: API contract ready, implementation planned for v0.2+"
                .to_string(),
        }
    }
}
