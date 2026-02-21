#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextSnippet {
    pub note_id: String,
    pub path: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Citation {
    pub note_id: String,
    pub path: String,
    pub quote: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GenerationRequest {
    pub system_prompt: String,
    pub user_prompt: String,
    pub schema_hint: Option<String>,
    pub context: Vec<ContextSnippet>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GenerationResponse {
    pub model: String,
    pub content_json: String,
    pub citations: Vec<Citation>,
}

pub trait LlmProvider: Send + Sync {
    fn name(&self) -> &str;
    fn healthcheck(&self) -> Result<(), String>;
    fn generate_structured(
        &self,
        request: &GenerationRequest,
    ) -> Result<GenerationResponse, String>;
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String>;
}

#[derive(Debug, Clone)]
pub struct MockCloudProvider {
    pub model: String,
    pub should_fail: bool,
}

impl Default for MockCloudProvider {
    fn default() -> Self {
        Self {
            model: "cloud/mock-v1".to_string(),
            should_fail: false,
        }
    }
}

impl LlmProvider for MockCloudProvider {
    fn name(&self) -> &str {
        "mock-cloud"
    }

    fn healthcheck(&self) -> Result<(), String> {
        if self.should_fail {
            Err("cloud provider unavailable".to_string())
        } else {
            Ok(())
        }
    }

    fn generate_structured(
        &self,
        request: &GenerationRequest,
    ) -> Result<GenerationResponse, String> {
        if self.should_fail {
            return Err("cloud generation failed".to_string());
        }
        let citation = request.context.first().map(|snippet| Citation {
            note_id: snippet.note_id.clone(),
            path: snippet.path.clone(),
            quote: snippet.text.chars().take(64).collect(),
        });
        Ok(GenerationResponse {
            model: self.model.clone(),
            content_json: format!(
                "{{\"summary\":\"{}\",\"items\":{}}}",
                escape_json(&request.user_prompt),
                request.context.len()
            ),
            citations: citation.into_iter().collect(),
        })
    }

    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        if self.should_fail {
            return Err("cloud embed failed".to_string());
        }
        Ok(texts
            .iter()
            .map(|text| vec![text.len() as f32, 1.0_f32, 0.5_f32])
            .collect())
    }
}

#[derive(Debug, Clone)]
pub struct MockLocalProvider {
    pub model: String,
}

impl Default for MockLocalProvider {
    fn default() -> Self {
        Self {
            model: "local/mock-v1".to_string(),
        }
    }
}

impl LlmProvider for MockLocalProvider {
    fn name(&self) -> &str {
        "mock-local"
    }

    fn healthcheck(&self) -> Result<(), String> {
        Ok(())
    }

    fn generate_structured(
        &self,
        request: &GenerationRequest,
    ) -> Result<GenerationResponse, String> {
        Ok(GenerationResponse {
            model: self.model.clone(),
            content_json: format!(
                "{{\"mode\":\"fallback\",\"intent\":\"{}\"}}",
                escape_json(&request.user_prompt)
            ),
            citations: Vec::new(),
        })
    }

    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        Ok(texts
            .iter()
            .map(|text| vec![0.0_f32, text.len() as f32])
            .collect())
    }
}

pub struct HybridProvider<C, L> {
    pub cloud: C,
    pub local: L,
}

impl<C, L> HybridProvider<C, L>
where
    C: LlmProvider,
    L: LlmProvider,
{
    pub fn new(cloud: C, local: L) -> Self {
        Self { cloud, local }
    }
}

impl<C, L> LlmProvider for HybridProvider<C, L>
where
    C: LlmProvider,
    L: LlmProvider,
{
    fn name(&self) -> &str {
        "hybrid"
    }

    fn healthcheck(&self) -> Result<(), String> {
        if self.cloud.healthcheck().is_ok() || self.local.healthcheck().is_ok() {
            Ok(())
        } else {
            Err("both cloud and local providers are unavailable".to_string())
        }
    }

    fn generate_structured(
        &self,
        request: &GenerationRequest,
    ) -> Result<GenerationResponse, String> {
        match self.cloud.generate_structured(request) {
            Ok(response) => Ok(response),
            Err(_) => self.local.generate_structured(request),
        }
    }

    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        match self.cloud.embed(texts) {
            Ok(embeddings) => Ok(embeddings),
            Err(_) => self.local.embed(texts),
        }
    }
}

fn escape_json(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cloud_provider_uses_context_for_citations() {
        let provider = MockCloudProvider::default();
        let request = GenerationRequest {
            system_prompt: "system".to_string(),
            user_prompt: "summarize".to_string(),
            schema_hint: None,
            context: vec![ContextSnippet {
                note_id: "n1".to_string(),
                path: "vault/n1.md".to_string(),
                text: "A long source sentence".to_string(),
            }],
        };
        let response = provider
            .generate_structured(&request)
            .expect("cloud provider should respond");
        assert_eq!(response.citations.len(), 1);
        assert_eq!(response.model, "cloud/mock-v1");
    }

    #[test]
    fn hybrid_falls_back_to_local() {
        let hybrid = HybridProvider::new(
            MockCloudProvider {
                should_fail: true,
                ..MockCloudProvider::default()
            },
            MockLocalProvider::default(),
        );
        let request = GenerationRequest {
            system_prompt: "system".to_string(),
            user_prompt: "extract tasks".to_string(),
            schema_hint: Some("json".to_string()),
            context: Vec::new(),
        };
        let response = hybrid
            .generate_structured(&request)
            .expect("local fallback should work");
        assert_eq!(response.model, "local/mock-v1");
        assert!(response.content_json.contains("fallback"));
    }
}
