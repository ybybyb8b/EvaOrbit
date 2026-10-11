import type { Task } from "./types.ts";

export type TaskGroup = "overdue" | "today" | "upcoming" | "unscheduled" | "completed";

export function taskDateOffset(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function taskCalendarDates(anchor: string, view: "list" | "month") {
  const first = view === "month" ? `${anchor.slice(0, 7)}-01` : anchor;
  const value = new Date(`${first}T12:00:00`);
  const offset = (value.getDay() + 6) % 7;
  const days = view === "list" ? 7 : Math.ceil((offset + new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()) / 7) * 7;
  return Array.from({ length: days }, (_, index) => taskDateOffset(first, index - offset));
}

export function groupTasks(tasks: Task[], today: string, time: string): Record<TaskGroup, Task[]> {
  const groups: Record<TaskGroup, Task[]> = { overdue: [], today: [], upcoming: [], unscheduled: [], completed: [] };
  for (const task of tasks) {
    const group = task.completed ? "completed" : !task.dueDate ? "unscheduled"
      : task.dueDate < today || (task.dueDate === today && task.dueTime && task.dueTime < time) ? "overdue"
      : task.dueDate === today ? "today" : "upcoming";
    groups[group].push(task);
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31")
      || (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") || a.id - b.id);
  }
  return groups;
}
