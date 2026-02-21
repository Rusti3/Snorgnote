use std::collections::BTreeMap;

use core_domain::{FocusSession, SessionOutcome, Timestamp, make_id};

#[derive(Debug, Default)]
pub struct PomodoroEngine {
    sequence: u64,
    active: BTreeMap<String, FocusSession>,
    history: Vec<FocusSession>,
}

impl PomodoroEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start(
        &mut self,
        task_id: Option<String>,
        project_id: Option<String>,
        planned_min: u32,
        started_at: Timestamp,
    ) -> FocusSession {
        self.sequence += 1;
        let id = make_id("focus", self.sequence);
        let session = FocusSession {
            id: id.clone(),
            task_id,
            project_id,
            started_at,
            ended_at: None,
            planned_min: planned_min.max(1),
            actual_min: 0,
            outcome: None,
        };
        self.active.insert(id, session.clone());
        session
    }

    pub fn stop(
        &mut self,
        session_id: &str,
        ended_at: Timestamp,
        outcome: SessionOutcome,
    ) -> Option<FocusSession> {
        let mut session = self.active.remove(session_id)?;
        session.ended_at = Some(ended_at);
        session.outcome = Some(outcome);
        let elapsed_seconds = ended_at.saturating_sub(session.started_at);
        session.actual_min = (elapsed_seconds / 60).max(1) as u32;
        self.history.push(session.clone());
        Some(session)
    }

    pub fn active_sessions(&self) -> Vec<&FocusSession> {
        self.active.values().collect()
    }

    pub fn history(&self) -> &[FocusSession] {
        &self.history
    }

    pub fn total_minutes(&self) -> u32 {
        self.history.iter().map(|session| session.actual_min).sum()
    }

    pub fn minutes_by_project(&self) -> BTreeMap<String, u32> {
        let mut totals = BTreeMap::new();
        for session in &self.history {
            let key = session
                .project_id
                .clone()
                .unwrap_or_else(|| "unassigned".to_string());
            *totals.entry(key).or_insert(0) += session.actual_min;
        }
        totals
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_and_stop_session() {
        let mut engine = PomodoroEngine::new();
        let session = engine.start(
            Some("task-1".to_string()),
            Some("project-a".to_string()),
            25,
            1_000,
        );
        assert_eq!(engine.active_sessions().len(), 1);

        let finished = engine
            .stop(&session.id, 2_800, SessionOutcome::Completed)
            .expect("active session should stop");
        assert_eq!(finished.actual_min, 30);
        assert_eq!(engine.active_sessions().len(), 0);
        assert_eq!(engine.history().len(), 1);
    }

    #[test]
    fn stats_per_project() {
        let mut engine = PomodoroEngine::new();
        let first = engine.start(None, Some("project-a".to_string()), 25, 0);
        let second = engine.start(None, Some("project-b".to_string()), 25, 0);
        let third = engine.start(None, None, 25, 0);

        engine.stop(&first.id, 1_500, SessionOutcome::Completed);
        engine.stop(&second.id, 600, SessionOutcome::Interrupted);
        engine.stop(&third.id, 1_200, SessionOutcome::Completed);

        let totals = engine.minutes_by_project();
        assert_eq!(totals.get("project-a"), Some(&25));
        assert_eq!(totals.get("project-b"), Some(&10));
        assert_eq!(totals.get("unassigned"), Some(&20));
    }
}
