use std::cmp::Reverse;

use core_domain::Timestamp;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SuggestionCategory {
    Important,
    Light,
    Restore,
    Review,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effort {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DailySuggestion {
    pub title: String,
    pub reason: String,
    pub category: SuggestionCategory,
    pub effort: Effort,
    pub linked_task_ids: Vec<String>,
    pub linked_note_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DailyPlan {
    pub day_key: String,
    pub suggestions: Vec<DailySuggestion>,
    pub review_note_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeeklyPlan {
    pub week_start_key: String,
    pub focus_summary: String,
    pub keep_doing: Vec<String>,
    pub improve_next: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskInput {
    pub id: String,
    pub title: String,
    pub priority: u8,
    pub due_at: Option<Timestamp>,
    pub project_id: Option<String>,
    pub estimated_min: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewItem {
    pub note_id: String,
    pub title: String,
    pub importance: u8,
    pub due_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectInput {
    pub id: String,
    pub name: String,
    pub health_score_per_mille: u16,
    pub last_activity: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanningContext {
    pub tasks: Vec<TaskInput>,
    pub review_due: Vec<ReviewItem>,
    pub projects: Vec<ProjectInput>,
    pub mood_score: Option<i8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeeklyMetrics {
    pub tasks_done: u32,
    pub focus_minutes: u32,
    pub inbox_processed: u32,
    pub reviews_done: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReviewState {
    pub interval_days: u32,
    pub stability: f32,
    pub last_reviewed: Timestamp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewGrade {
    Again,
    Hard,
    Good,
    Easy,
}

pub fn generate_daily_plan(day_key: impl Into<String>, context: &PlanningContext) -> DailyPlan {
    let day_key = day_key.into();
    let mut suggestions = Vec::new();

    let mut tasks = context.tasks.clone();
    tasks.sort_by_key(|task| {
        let due = task.due_at.unwrap_or(i64::MAX);
        (Reverse(task.priority), due, task.estimated_min)
    });

    let important: Vec<TaskInput> = tasks.iter().take(2).cloned().collect();
    for task in important {
        suggestions.push(DailySuggestion {
            title: format!("Finish: {}", task.title),
            reason: "High priority or urgent task".to_string(),
            category: SuggestionCategory::Important,
            effort: effort_for_minutes(task.estimated_min),
            linked_task_ids: vec![task.id],
            linked_note_ids: Vec::new(),
        });
    }

    if let Some(light_task) = tasks.iter().find(|task| task.estimated_min <= 25).cloned() {
        suggestions.push(DailySuggestion {
            title: format!("Quick win: {}", light_task.title),
            reason: "Keeps momentum without high cognitive load".to_string(),
            category: SuggestionCategory::Light,
            effort: Effort::Low,
            linked_task_ids: vec![light_task.id],
            linked_note_ids: Vec::new(),
        });
    }

    let mood_is_low = context.mood_score.map(|score| score < 0).unwrap_or(false);
    let restore_text = if mood_is_low {
        "Take a 20-minute walk and write one reflection line."
    } else {
        "Schedule one restorative break between deep work blocks."
    };
    suggestions.push(DailySuggestion {
        title: restore_text.to_string(),
        reason: "Balances productivity with emotional stability".to_string(),
        category: SuggestionCategory::Restore,
        effort: Effort::Low,
        linked_task_ids: Vec::new(),
        linked_note_ids: Vec::new(),
    });

    let mut review_due = context.review_due.clone();
    review_due.sort_by_key(|item| (Reverse(item.importance), item.due_at));
    let review_note_ids: Vec<String> = review_due
        .iter()
        .take(5)
        .map(|item| item.note_id.clone())
        .collect();

    if !review_note_ids.is_empty() {
        suggestions.push(DailySuggestion {
            title: format!("Review {} knowledge notes", review_note_ids.len()),
            reason: "Scheduled spaced recall".to_string(),
            category: SuggestionCategory::Review,
            effort: Effort::Medium,
            linked_task_ids: Vec::new(),
            linked_note_ids: review_note_ids.clone(),
        });
    }

    DailyPlan {
        day_key,
        suggestions: suggestions.into_iter().take(5).collect(),
        review_note_ids,
    }
}

pub fn generate_weekly_plan(
    week_start_key: impl Into<String>,
    metrics: &WeeklyMetrics,
    projects: &[ProjectInput],
) -> WeeklyPlan {
    let week_start_key = week_start_key.into();
    let focus_hours = metrics.focus_minutes as f32 / 60.0;
    let focus_summary = format!(
        "Completed {} tasks with {:.1}h focus and {} inbox items processed.",
        metrics.tasks_done, focus_hours, metrics.inbox_processed
    );

    let mut keep_doing = vec![format!(
        "Preserve review cadence ({} recalls completed).",
        metrics.reviews_done
    )];
    let mut improve_next = Vec::new();

    if metrics.focus_minutes < 600 {
        improve_next.push("Increase focused time by 2 additional pomodoro sessions.".to_string());
    } else {
        keep_doing.push("Maintain deep-work rhythm from this week.".to_string());
    }

    if let Some(low_project) = projects
        .iter()
        .min_by_key(|project| project.health_score_per_mille)
    {
        improve_next.push(format!(
            "Rebalance project `{}` with one concrete next-action task.",
            low_project.name
        ));
    }

    WeeklyPlan {
        week_start_key,
        focus_summary,
        keep_doing,
        improve_next,
    }
}

pub fn select_due_reviews(
    mut items: Vec<ReviewItem>,
    now: Timestamp,
    limit: usize,
) -> Vec<ReviewItem> {
    items.retain(|item| item.due_at <= now);
    items.sort_by_key(|item| (Reverse(item.importance), item.due_at));
    items.into_iter().take(limit).collect()
}

pub fn update_review_state(
    previous: ReviewState,
    grade: ReviewGrade,
    reviewed_at: Timestamp,
) -> ReviewState {
    let (interval, stability) = match grade {
        ReviewGrade::Again => (1, (previous.stability * 0.7_f32).max(0.2_f32)),
        ReviewGrade::Hard => (
            (previous.interval_days as f32 * 1.2_f32)
                .round()
                .max(2.0_f32) as u32,
            (previous.stability * 1.05_f32).max(0.4_f32),
        ),
        ReviewGrade::Good => (
            (previous.interval_days as f32 * 2.0_f32)
                .round()
                .max(3.0_f32) as u32,
            (previous.stability * 1.25_f32).max(0.8_f32),
        ),
        ReviewGrade::Easy => (
            (previous.interval_days as f32 * 2.8_f32)
                .round()
                .max(5.0_f32) as u32,
            (previous.stability * 1.5_f32).max(1.2_f32),
        ),
    };

    ReviewState {
        interval_days: interval.clamp(1, 365),
        stability: stability.clamp(0.1_f32, 10.0_f32),
        last_reviewed: reviewed_at,
    }
}

fn effort_for_minutes(minutes: u32) -> Effort {
    if minutes <= 25 {
        Effort::Low
    } else if minutes <= 60 {
        Effort::Medium
    } else {
        Effort::High
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_plan_balances_priorities_and_review() {
        let context = PlanningContext {
            tasks: vec![
                TaskInput {
                    id: "t1".to_string(),
                    title: "Core refactor".to_string(),
                    priority: 9,
                    due_at: Some(10),
                    project_id: Some("p1".to_string()),
                    estimated_min: 90,
                },
                TaskInput {
                    id: "t2".to_string(),
                    title: "Reply to mail".to_string(),
                    priority: 5,
                    due_at: None,
                    project_id: None,
                    estimated_min: 15,
                },
            ],
            review_due: vec![ReviewItem {
                note_id: "n1".to_string(),
                title: "Rust ownership".to_string(),
                importance: 10,
                due_at: 5,
            }],
            projects: vec![],
            mood_score: Some(-1),
        };
        let plan = generate_daily_plan("2026-02-21", &context);
        assert!(!plan.suggestions.is_empty());
        assert_eq!(plan.review_note_ids, vec!["n1".to_string()]);
    }

    #[test]
    fn select_due_review_orders_by_importance() {
        let items = vec![
            ReviewItem {
                note_id: "n1".to_string(),
                title: "A".to_string(),
                importance: 2,
                due_at: 100,
            },
            ReviewItem {
                note_id: "n2".to_string(),
                title: "B".to_string(),
                importance: 8,
                due_at: 90,
            },
        ];
        let selected = select_due_reviews(items, 100, 10);
        assert_eq!(selected[0].note_id, "n2");
    }

    #[test]
    fn review_state_updates_with_grade() {
        let previous = ReviewState {
            interval_days: 3,
            stability: 1.0_f32,
            last_reviewed: 0,
        };
        let good = update_review_state(previous, ReviewGrade::Good, 100);
        assert!(good.interval_days > previous.interval_days);
        assert!(good.stability > previous.stability);
    }
}
