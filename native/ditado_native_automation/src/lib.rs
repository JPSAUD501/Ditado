use enigo::{Enigo, Keyboard, Settings};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::cell::RefCell;

thread_local! {
    static ENIGO_INSTANCE: RefCell<Option<Enigo>> = const { RefCell::new(None) };
}

#[napi(object)]
pub struct AutomationEnvironment {
    pub platform: String,
    pub session_type: Option<String>,
    pub supports_letter_by_letter: bool,
    pub reason: Option<String>,
}

fn detect_session_type() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_SESSION_TYPE").ok()
    }

    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

fn current_environment() -> AutomationEnvironment {
    let session_type = detect_session_type();

    #[cfg(target_os = "linux")]
    {
        let wayland = session_type
            .as_deref()
            .map(|value| value.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
            || std::env::var_os("WAYLAND_DISPLAY").is_some();

        if wayland {
            return AutomationEnvironment {
                platform: std::env::consts::OS.to_string(),
                session_type,
                supports_letter_by_letter: false,
                reason: Some("Wayland is not supported for native letter-by-letter typing.".to_string()),
            };
        }
    }

    AutomationEnvironment {
        platform: std::env::consts::OS.to_string(),
        session_type,
        supports_letter_by_letter: true,
        reason: None,
    }
}

fn with_enigo<T>(mut operation: impl FnMut(&mut Enigo) -> Result<T>) -> Result<T> {
    ENIGO_INSTANCE.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        if borrowed.is_none() {
            let created = Enigo::new(&Settings::default())
                .map_err(|error| Error::from_reason(format!("Failed to initialize Enigo: {error}")))?;
            *borrowed = Some(created);
        }

        let enigo = borrowed
            .as_mut()
            .ok_or_else(|| Error::from_reason("Enigo automation backend is unavailable.".to_string()))?;

        operation(enigo)
    })
}

#[napi]
pub fn get_environment() -> AutomationEnvironment {
    current_environment()
}

#[napi]
pub fn warmup() -> Result<AutomationEnvironment> {
    let environment = current_environment();
    if !environment.supports_letter_by_letter {
        return Ok(environment);
    }

    with_enigo(|_| Ok(()))?;
    Ok(environment)
}

#[napi]
pub fn type_grapheme(text: String) -> Result<()> {
    let environment = current_environment();
    if !environment.supports_letter_by_letter {
        return Err(Error::from_reason(
            environment
                .reason
                .unwrap_or_else(|| "Letter-by-letter typing is unavailable in this environment.".to_string()),
        ));
    }

    with_enigo(|enigo| {
        enigo
            .text(&text)
            .map_err(|error| Error::from_reason(format!("Failed to type grapheme: {error}")))
    })
}

#[napi]
pub fn type_text(text: String) -> Result<()> {
    let environment = current_environment();
    if !environment.supports_letter_by_letter {
        return Err(Error::from_reason(
            environment
                .reason
                .unwrap_or_else(|| "Native text typing is unavailable in this environment.".to_string()),
        ));
    }

    with_enigo(|enigo| {
        enigo
            .text(&text)
            .map_err(|error| Error::from_reason(format!("Failed to type text: {error}")))
    })
}
