use std::path::Path;

use anyhow::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolRegistrationStatus {
    AlreadyRegistered,
    Updated,
    #[allow(dead_code)]
    Skipped,
}

pub fn protocol_command_value(exe_path: &Path) -> String {
    format!("\"{}\" \"%1\"", exe_path.display())
}

#[cfg(windows)]
pub fn ensure_protocol_registered(
    scheme: &str,
    exe_path: &Path,
) -> Result<ProtocolRegistrationStatus> {
    use anyhow::Context;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let scheme = scheme.trim().to_ascii_lowercase();
    if scheme.is_empty() {
        anyhow::bail!("scheme must not be empty");
    }

    let classes_path = format!("Software\\Classes\\{scheme}");
    let command_path = format!("{classes_path}\\shell\\open\\command");
    let expected_command = protocol_command_value(exe_path);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let existing_command = hkcu
        .open_subkey(&command_path)
        .ok()
        .and_then(|key| key.get_value::<String, _>("").ok());

    if existing_command.as_deref() == Some(expected_command.as_str()) {
        return Ok(ProtocolRegistrationStatus::AlreadyRegistered);
    }

    let (scheme_key, _) = hkcu
        .create_subkey(&classes_path)
        .with_context(|| format!("failed to create/open registry key: {classes_path}"))?;
    scheme_key
        .set_value("", &format!("URL:{scheme} Protocol"))
        .context("failed to set protocol description")?;
    scheme_key
        .set_value("URL Protocol", &"")
        .context("failed to set URL Protocol value")?;

    let (command_key, _) = hkcu
        .create_subkey(&command_path)
        .with_context(|| format!("failed to create/open registry key: {command_path}"))?;
    command_key
        .set_value("", &expected_command)
        .context("failed to set shell open command")?;

    Ok(ProtocolRegistrationStatus::Updated)
}

#[cfg(not(windows))]
pub fn ensure_protocol_registered(
    _scheme: &str,
    _exe_path: &Path,
) -> Result<ProtocolRegistrationStatus> {
    Ok(ProtocolRegistrationStatus::Skipped)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::protocol_command_value;
    #[cfg(not(windows))]
    use super::{ensure_protocol_registered, ProtocolRegistrationStatus};

    #[test]
    fn protocol_command_is_wrapped_and_passes_url_arg() {
        let exe = PathBuf::from(r"C:\Apps\Snorgnote\snorgnote.exe");
        let command = protocol_command_value(&exe);
        assert!(command.starts_with('"'));
        assert!(command.ends_with("\" \"%1\""));
    }

    #[cfg(not(windows))]
    #[test]
    fn non_windows_registration_is_skipped() {
        let exe = PathBuf::from("/tmp/snorgnote");
        let status = ensure_protocol_registered("snorgnote", &exe).expect("status");
        assert_eq!(status, ProtocolRegistrationStatus::Skipped);
    }
}
