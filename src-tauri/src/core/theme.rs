use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};

use crate::core::state::AppState;

const THEMES_DIR: &str = "themes";
const CUSTOM_BACKGROUND_PREFIX: &str = "custom-background.";
const MAX_BACKGROUND_SIZE_BYTES: usize = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];

pub fn save_theme_background_image(
    base_dir: &Path,
    file_name: &str,
    bytes: &[u8],
) -> Result<PathBuf> {
    if bytes.is_empty() {
        bail!("theme image payload is empty");
    }
    if bytes.len() > MAX_BACKGROUND_SIZE_BYTES {
        bail!("theme image is too large (max 10MB)");
    }

    let extension = normalize_extension(file_name)?;
    let themes_dir = base_dir.join(THEMES_DIR);
    fs::create_dir_all(&themes_dir).with_context(|| {
        format!(
            "failed to create themes directory `{}`",
            themes_dir.display()
        )
    })?;

    remove_existing_background_files(&themes_dir)?;

    let target_path = themes_dir.join(format!("{CUSTOM_BACKGROUND_PREFIX}{extension}"));
    fs::write(&target_path, bytes)
        .with_context(|| format!("failed to save theme image to `{}`", target_path.display()))?;

    Ok(target_path)
}

pub fn clear_theme_background_image(base_dir: &Path) -> Result<()> {
    let themes_dir = base_dir.join(THEMES_DIR);
    if !themes_dir.exists() {
        return Ok(());
    }
    remove_existing_background_files(&themes_dir)
}

impl AppState {
    pub fn theme_save_background_image(&self, file_name: String, bytes: Vec<u8>) -> Result<String> {
        let base_dir = self
            .vault_root
            .parent()
            .ok_or_else(|| anyhow!("cannot resolve app data directory"))?;
        let path = save_theme_background_image(base_dir, &file_name, &bytes)?;
        Ok(path.to_string_lossy().into_owned())
    }

    pub fn theme_clear_background_image(&self) -> Result<()> {
        let base_dir = self
            .vault_root
            .parent()
            .ok_or_else(|| anyhow!("cannot resolve app data directory"))?;
        clear_theme_background_image(base_dir)
    }
}

fn normalize_extension(file_name: &str) -> Result<String> {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.trim().to_ascii_lowercase())
        .ok_or_else(|| anyhow!("unsupported file extension"))?;

    if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
        bail!("unsupported image extension: {extension}");
    }

    Ok(extension)
}

fn remove_existing_background_files(themes_dir: &Path) -> Result<()> {
    if !themes_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(themes_dir)
        .with_context(|| format!("failed to read themes directory `{}`", themes_dir.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if !file_name.starts_with(CUSTOM_BACKGROUND_PREFIX) {
            continue;
        }
        fs::remove_file(entry.path()).with_context(|| {
            format!(
                "failed to remove old theme background `{}`",
                entry.path().display()
            )
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use anyhow::Result;
    use tempfile::tempdir;

    use super::{clear_theme_background_image, save_theme_background_image};

    #[test]
    fn saves_background_image_to_themes_directory() -> Result<()> {
        let temp = tempdir()?;
        let path = save_theme_background_image(temp.path(), "photo.jpg", &[1, 2, 3, 4])?;
        assert!(path.exists());
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("custom-background.jpg")
        );
        Ok(())
    }

    #[test]
    fn replacing_background_removes_old_file() -> Result<()> {
        let temp = tempdir()?;
        let first = save_theme_background_image(temp.path(), "photo.jpg", &[1, 2, 3, 4])?;
        assert!(first.exists());
        let second = save_theme_background_image(temp.path(), "wallpaper.png", &[5, 6, 7, 8])?;
        assert!(second.exists());
        assert!(!first.exists());
        assert_eq!(
            second.file_name().and_then(|name| name.to_str()),
            Some("custom-background.png")
        );
        Ok(())
    }

    #[test]
    fn rejects_unsupported_extension() -> Result<()> {
        let temp = tempdir()?;
        let err = save_theme_background_image(temp.path(), "payload.svg", &[1, 2, 3, 4])
            .expect_err("unsupported extension must fail");
        assert!(err.to_string().contains("unsupported"));
        Ok(())
    }

    #[test]
    fn clear_background_removes_file() -> Result<()> {
        let temp = tempdir()?;
        let saved = save_theme_background_image(temp.path(), "photo.jpg", &[1, 2, 3, 4])?;
        assert!(saved.exists());
        clear_theme_background_image(temp.path())?;
        assert!(!saved.exists());
        let themes_dir = temp.path().join("themes");
        if themes_dir.exists() {
            let entries = fs::read_dir(themes_dir)?.count();
            assert_eq!(entries, 0);
        }
        Ok(())
    }
}
