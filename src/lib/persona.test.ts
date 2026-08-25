import assert from "node:assert/strict";
import test from "node:test";
import { queryTerms, selectRelevantMemories, selectRelevantTasks } from "./persona.ts";
import type { Memory, Task } from "./types.ts";

const memories: Memory[] = [
  { id: 1, title: "咖啡偏好", content: "最近更喜欢浅烘手冲", category: "偏好", createdAt: "", updatedAt: "2026-08-24" },
  { id: 2, title: "项目部署", content: "EvaOrbit 放在 E 盘", category: "项目", createdAt: "", updatedAt: "2026-08-25" },
];

const tasks: Task[] = [
  { id: 1, title: "整理项目", notes: "检查移动端", completed: false, dueDate: "2026-08-25", priority: "high", tags: ["EvaOrbit"], createdAt: "", updatedAt: "" },
  { id: 2, title: "买咖啡豆", notes: "", completed: false, dueDate: null, priority: "low", tags: [], createdAt: "", updatedAt: "" },
];

test("extracts useful Chinese query fragments", () => {
  assert.ok(queryTerms("找找以前记过的咖啡偏好").includes("咖啡"));
});

test("recalls only memory related to the current request", () => {
  assert.deepEqual(selectRelevantMemories(memories, "我最近喜欢什么咖啡？").map((item) => item.id), [1]);
});

test("only injects tasks when the request has task intent", () => {
  assert.equal(selectRelevantTasks(tasks, "随便聊聊").length, 0);
  assert.equal(selectRelevantTasks(tasks, "今天先弄哪个项目待办？")[0]?.id, 1);
});
