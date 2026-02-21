const modules = [
  "Inbox",
  "Daily / Weekly",
  "Projects",
  "Focus (Pomodoro)",
  "Skills",
  "Search + Graph",
  "Stats Dashboard"
];

export function App() {
  return (
    <main
      style={{
        fontFamily: "'Segoe UI', sans-serif",
        margin: "0 auto",
        maxWidth: 920,
        padding: "24px 16px",
        color: "#16202a"
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Snorgnote Desktop</h1>
      <p style={{ marginTop: 0, marginBottom: 20 }}>
        Tauri v2 shell scaffold connected to Rust core modules.
      </p>

      <section>
        <h2 style={{ marginBottom: 8 }}>Planned Panels</h2>
        <ul>
          {modules.map((module) => (
            <li key={module}>{module}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
