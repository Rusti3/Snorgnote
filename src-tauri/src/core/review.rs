#[allow(dead_code)]
pub fn next_review_state(
    interval_days: i64,
    ease_factor: f64,
    stability: f64,
    success: bool,
) -> (i64, f64, f64) {
    if success {
        let new_ease = (ease_factor + 0.05).min(3.0);
        let new_stability = (stability * 1.15).min(10.0);
        let grown =
            (interval_days as f64 * new_ease * (1.0 + (new_stability / 10.0))).round() as i64;
        let new_interval = grown.max(interval_days + 1).max(1);
        (new_interval, new_ease, new_stability)
    } else {
        let new_ease = (ease_factor - 0.2).max(1.3);
        let new_stability = (stability * 0.7).max(0.5);
        (1, new_ease, new_stability)
    }
}

#[cfg(test)]
mod tests {
    use super::next_review_state;

    #[test]
    fn review_state_grows_on_success() {
        let (interval, ease, stability) = next_review_state(3, 2.5, 1.0, true);
        assert!(interval > 3);
        assert!(ease >= 2.5);
        assert!(stability > 1.0);
    }

    #[test]
    fn review_state_resets_on_fail() {
        let (interval, ease, stability) = next_review_state(8, 2.5, 2.0, false);
        assert_eq!(interval, 1);
        assert!(ease < 2.5);
        assert!(stability < 2.0);
    }
}
