import assert from "node:assert/strict";
import test from "node:test";
import { groupTasks, taskCalendarDates, taskDateOffset } from "./task-groups.ts";
import type { Task } from "./types.ts";

test("task groups preserve date-only deadlines, explicit time and completion without mutating input", () => {
  const task = (id: number, dueDate: string | null, dueTime: string | null = null, completed = false) => ({ id, dueDate, dueTime, completed } as Task);
  const tasks = [task(1, "2026-10-12"), task(2, "2026-10-11"), task(3, "2026-10-12", "09:00"),
    task(4, "2026-10-13"), task(5, null), task(6, "2026-10-11", null, true), task(7, "2026-10-12", "15:00")];
  const original = structuredClone(tasks);
  const groups = groupTasks(tasks, "2026-10-12", "12:00");
  assert.deepEqual(groups.overdue.map(task => task.id), [2, 3]);
  assert.deepEqual(groups.today.map(task => task.id), [7, 1]);
  assert.deepEqual(groups.upcoming.map(task => task.id), [4]);
  assert.deepEqual(groups.unscheduled.map(task => task.id), [5]);
  assert.deepEqual(groups.completed.map(task => task.id), [6]);
  assert.deepEqual(tasks, original);
  assert.equal(groupTasks([task(8, "2026-10-12", "12:00")], "2026-10-12", "12:00").today.length, 1);
  assert.equal(groupTasks([task(9, "2026-10-12")], "2026-10-13", "00:01").overdue.length, 1);
});

test("task calendar uses Monday-first dates across year, leap-month and DST boundaries", () => {
  assert.deepEqual(taskCalendarDates("2026-01-01", "list"), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  const leapMonth = taskCalendarDates("2024-02-17", "month");
  assert.equal(leapMonth[0], "2024-01-29");
  assert.equal(leapMonth.at(-1), "2024-03-03");
  assert.ok(leapMonth.includes("2024-02-29"));
  assert.equal(taskCalendarDates("2026-03-12", "month").length, 42);
  assert.equal(taskDateOffset("2026-12-31", 1), "2027-01-01");
  assert.equal(taskDateOffset("2026-03-08", 1), "2026-03-09");
});
