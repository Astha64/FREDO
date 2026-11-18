// desktop/src/TaskPanel.tsx
import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { completeTask, createTask, deleteTask, listTasks } from "./api";
import type { Task } from "./api";

const OFFLINE = "I can't reach my backend right now. Please start it and try again.";

type Props = {
  onMessage: (text: string, isError: boolean) => void;
  onCelebrate: () => void;
};

function TaskPanel({ onMessage, onCelebrate }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [why, setWhy] = useState("");
  const [consequence, setConsequence] = useState("");

  async function refresh() {
    try {
      setTasks(await listTasks());
    } catch {
      onMessage(OFFLINE, true);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTitle = title.trim();
    if (cleanTitle === "") {
      onMessage("Please tell me what the task is.", true);
      return;
    }

    try {
      await createTask({
        title: cleanTitle,
        why: why.trim(),
        consequence: consequence.trim(),
        due_date: dueDate === "" ? null : dueDate,
      });
      setTitle("");
      setDueDate("");
      setWhy("");
      setConsequence("");
      onMessage("Got it! I will remember that.", false);
      await refresh();
    } catch {
      onMessage(OFFLINE, true);
    }
  }

  async function handleDone(id: number) {
    try {
      await completeTask(id);
      onCelebrate();
      onMessage("Nice! One less thing to worry about.", false);
      await refresh();
    } catch {
      onMessage(OFFLINE, true);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id);
      await refresh();
    } catch {
      onMessage(OFFLINE, true);
    }
  }

  return (
    <div className="task-panel">
      <form className="task-form" onSubmit={handleAdd}>
        <label htmlFor="task-title">What do you need to do?</label>
        <input
          id="task-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Revise DBMS"
        />

        <label htmlFor="task-due">When is it due? (optional)</label>
        <input
          id="task-due"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />

        <label htmlFor="task-why">Why does it matter?</label>
        <input
          id="task-why"
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          placeholder="Internal marks count"
        />

        <label htmlFor="task-consequence">If you skip it, what happens?</label>
        <input
          id="task-consequence"
          value={consequence}
          onChange={(event) => setConsequence(event.target.value)}
          placeholder="I lose 10 marks"
        />

        <button type="submit">Add task</button>
      </form>

      <h4 className="task-heading">Waiting for you ({tasks.length})</h4>

      {tasks.length === 0 && (
        <p className="task-empty">Nothing pending. Add a task above!</p>
      )}

      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className="task-item">
            <div>
              <span className="task-title">{task.title}</span>
              {task.due_date && <span className="task-due">due {task.due_date}</span>}
              {task.why && <div className="task-line">Why: {task.why}</div>}
              {task.consequence && (
                <div className="task-line">If skipped: {task.consequence}</div>
              )}
            </div>
            <div className="task-actions">
              <button
                className="task-done"
                title="Mark as done"
                onClick={() => handleDone(task.id)}
              >
                ✓
              </button>
              <button
                className="task-delete"
                title="Delete"
                onClick={() => handleDelete(task.id)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TaskPanel;