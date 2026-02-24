use anyhow::{bail, Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

const DEEPLINK_SCHEME: &str = "snorgnote";
const DEEPLINK_TARGET: &str = "new";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BrowserClipType {
    #[serde(rename = "full_page")]
    FullPage,
    #[serde(rename = "selection")]
    Selection,
}

impl BrowserClipType {
    pub fn as_tag(&self) -> &'static str {
        match self {
            Self::FullPage => "full_page",
            Self::Selection => "selection",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserClipPayload {
    #[serde(rename = "type")]
    pub clip_type: BrowserClipType,
    pub title: String,
    pub url: String,
    #[serde(rename = "contentMarkdown")]
    pub content_markdown: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub source: Option<String>,
}

pub fn extract_deeplink_from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().find_map(|arg| {
        let value = arg.as_ref().trim();
        if value.to_ascii_lowercase().starts_with("snorgnote://") {
            Some(value.to_string())
        } else {
            None
        }
    })
}

pub fn parse_browser_deeplink(uri: &str) -> Result<BrowserClipPayload> {
    let parsed = Url::parse(uri).with_context(|| format!("invalid deep-link URI: {uri}"))?;
    if parsed.scheme() != DEEPLINK_SCHEME {
        bail!(
            "unsupported URI scheme `{}`; expected `{DEEPLINK_SCHEME}`",
            parsed.scheme()
        );
    }

    let target = parsed
        .host_str()
        .map(str::to_string)
        .or_else(|| {
            parsed
                .path_segments()
                .and_then(|mut segments| segments.next().map(str::to_string))
        })
        .unwrap_or_default();
    if !target.eq_ignore_ascii_case(DEEPLINK_TARGET) {
        bail!("unsupported deep-link target `{target}`; expected `{DEEPLINK_TARGET}`");
    }

    let data_param = parsed
        .query_pairs()
        .find_map(|(key, value)| (key == "data").then(|| value.into_owned()))
        .ok_or_else(|| anyhow::anyhow!("missing required query parameter: data"))?;

    let mut payload = parse_data_payload(&data_param)?;
    normalize_payload(&mut payload)?;
    Ok(payload)
}

pub fn normalize_browser_source(_source: Option<&str>) -> &'static str {
    "browser"
}

pub fn browser_tags(payload: &BrowserClipPayload) -> Vec<String> {
    vec![
        "browser".to_string(),
        "web-clipper".to_string(),
        payload.clip_type.as_tag().to_string(),
    ]
}

pub fn build_inbox_content(payload: &BrowserClipPayload) -> String {
    format!(
        "# {}\n{}\n\n{}",
        payload.title, payload.url, payload.content_markdown
    )
}

pub fn normalize_browser_url(value: &str) -> Result<String> {
    let mut parsed =
        Url::parse(value.trim()).with_context(|| format!("invalid URL in payload: {value}"))?;
    parsed.set_fragment(None);
    Ok(parsed.to_string())
}

pub fn content_sha256(value: &str) -> String {
    let digest = Sha256::digest(value.trim().as_bytes());
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        hex.push_str(format!("{byte:02x}").as_str());
    }
    hex
}

pub fn browser_dedup_key(normalized_url: &str, content_hash: &str) -> String {
    content_sha256(&format!(
        "{}\n{}",
        normalized_url.trim(),
        content_hash.trim()
    ))
}

#[cfg(test)]
pub fn encode_payload_to_deeplink(payload: &BrowserClipPayload) -> Result<String> {
    let json = serde_json::to_vec(payload)?;
    let data = URL_SAFE_NO_PAD.encode(json);
    Ok(format!("{DEEPLINK_SCHEME}://{DEEPLINK_TARGET}?data={data}"))
}

fn parse_data_payload(data: &str) -> Result<BrowserClipPayload> {
    let bytes = URL_SAFE_NO_PAD
        .decode(data)
        .with_context(|| "failed to decode data payload as base64url")?;
    let payload: BrowserClipPayload =
        serde_json::from_slice(&bytes).with_context(|| "failed to parse data payload JSON")?;
    Ok(payload)
}

fn normalize_payload(payload: &mut BrowserClipPayload) -> Result<()> {
    payload.title = payload.title.trim().to_string();
    payload.url = payload.url.trim().to_string();
    payload.content_markdown = payload.content_markdown.trim().to_string();
    payload.created_at = payload.created_at.trim().to_string();
    payload.source = payload
        .source
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if payload.title.is_empty() {
        bail!("missing or empty required field: title");
    }
    if payload.url.is_empty() {
        bail!("missing or empty required field: url");
    }
    if payload.content_markdown.is_empty() {
        bail!("missing or empty required field: contentMarkdown");
    }
    if payload.created_at.is_empty() {
        bail!("missing or empty required field: createdAt");
    }

    validate_url(&payload.url)?;
    validate_created_at(&payload.created_at)?;
    Ok(())
}

fn validate_url(value: &str) -> Result<()> {
    let parsed = Url::parse(value).with_context(|| format!("invalid URL in payload: {value}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        _ => bail!("invalid URL scheme in payload: {value}"),
    }
}

fn validate_created_at(value: &str) -> Result<()> {
    DateTime::parse_from_rfc3339(value)
        .with_context(|| format!("invalid createdAt; expected RFC3339: {value}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        browser_dedup_key, browser_tags, build_inbox_content, content_sha256,
        encode_payload_to_deeplink, extract_deeplink_from_args, normalize_browser_url,
        parse_browser_deeplink, BrowserClipPayload, BrowserClipType,
    };

    fn sample_payload() -> BrowserClipPayload {
        BrowserClipPayload {
            clip_type: BrowserClipType::FullPage,
            title: "Deep Learning Notes".to_string(),
            url: "https://example.com/notes".to_string(),
            content_markdown: "## Summary\n\nInteresting text.".to_string(),
            created_at: "2026-02-24T10:00:00.000Z".to_string(),
            source: Some("web-clipper".to_string()),
        }
    }

    #[test]
    fn extract_deeplink_finds_snorgnote_uri_in_args() {
        let args = vec![
            "C:\\Program Files\\Snorgnote\\snorgnote.exe".to_string(),
            "--flag".to_string(),
            "snorgnote://new?data=abc".to_string(),
        ];
        let extracted = extract_deeplink_from_args(args).expect("deeplink");
        assert_eq!(extracted, "snorgnote://new?data=abc");
    }

    #[test]
    fn parse_valid_browser_payload_from_deeplink() {
        let payload = sample_payload();
        let uri = encode_payload_to_deeplink(&payload).expect("encode");
        let parsed = parse_browser_deeplink(&uri).expect("parse");
        assert_eq!(parsed.clip_type, BrowserClipType::FullPage);
        assert_eq!(parsed.title, "Deep Learning Notes");
        assert_eq!(parsed.url, "https://example.com/notes");
        assert_eq!(parsed.source.as_deref(), Some("web-clipper"));
    }

    #[test]
    fn parse_rejects_non_http_url_scheme() {
        let mut payload = sample_payload();
        payload.url = "file:///tmp/note.md".to_string();
        let uri = encode_payload_to_deeplink(&payload).expect("encode");
        let error = parse_browser_deeplink(&uri).expect_err("must reject");
        assert!(error.to_string().contains("invalid URL scheme"));
    }

    #[test]
    fn parse_rejects_missing_data_param() {
        let error =
            parse_browser_deeplink("snorgnote://new").expect_err("missing data should be rejected");
        assert!(error
            .to_string()
            .contains("missing required query parameter"));
    }

    #[test]
    fn tags_and_content_are_built_for_inbox() {
        let payload = sample_payload();
        let tags = browser_tags(&payload);
        assert!(tags.contains(&"browser".to_string()));
        assert!(tags.contains(&"web-clipper".to_string()));
        assert!(tags.contains(&"full_page".to_string()));

        let content = build_inbox_content(&payload);
        assert!(content.starts_with("# Deep Learning Notes"));
        assert!(content.contains("https://example.com/notes"));
        assert!(content.contains("## Summary"));
    }

    #[test]
    fn normalize_url_removes_fragment() {
        let normalized =
            normalize_browser_url("https://example.com/notes?a=1#section").expect("normalize");
        assert_eq!(normalized, "https://example.com/notes?a=1");
    }

    #[test]
    fn dedup_key_is_stable_for_same_url_and_content() {
        let normalized_url =
            normalize_browser_url("https://example.com/notes#abc").expect("must normalize");
        let content_hash_a = content_sha256(" same content ");
        let content_hash_b = content_sha256("same content");
        let key_a = browser_dedup_key(&normalized_url, &content_hash_a);
        let key_b = browser_dedup_key("https://example.com/notes", &content_hash_b);
        assert_eq!(key_a, key_b);
    }
}
