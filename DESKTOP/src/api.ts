// desktop/src/api.ts
export const API_URL = "http://127.0.0.1:8000";

export type Task = {
  id: number;
  title: string;
  why: string;
  consequence: string;
  due_date: string | null;
  status: string;
  goal_id: number | null;
  snooze_count: number;
  created_at: string;
  completed_at: string | null;
};

export type NewTask = {
  title: string;
  why: string;
  consequence: string;
  due_date: string | null;
};

export type TaskDraft = {
  is_task: boolean;
  title: string;
  why: string;
  consequence: string;
  due_date: string | null;
  needs_clarification: boolean;
  clarification_question: string | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error("Backend answered with status " + response.status);
  }
  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

export function listTasks(): Promise<Task[]> {
  return request<Task[]>("/tasks?status=pending");
}

export function createTask(task: NewTask): Promise<Task> {
  return request<Task>("/tasks", { method: "POST", body: JSON.stringify(task) });
}

export function completeTask(id: number): Promise<Task> {
  return request<Task>(`/tasks/${id}/complete`, { method: "POST" });
}

export function deleteTask(id: number): Promise<null> {
  return request<null>(`/tasks/${id}`, { method: "DELETE" });
}