import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("retired state notes are deleted and Lucius activity pushes follow saved changes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eo-lucius-activity-"));
  const databasePath = path.join(directory, "test.db");
  const run = (program) => {
    const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", program], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, NODE_ENV: "development", VERCEL: "" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  try {
    run('import "./src/lib/db.ts";');
    const old = new DatabaseSync(databasePath);
    old.exec(`ALTER TABLE lucius_state ADD COLUMN current_note TEXT NOT NULL DEFAULT '';
      DELETE FROM migrations WHERE version=72;
      INSERT INTO lucius_state(user_id,current_note,status,mood) VALUES('local','old private note','reading','🌙');`);
    old.close();
    run(`
      import assert from "node:assert/strict";
      import webpush from "web-push";
      import * as db from "./src/lib/db.ts";
      import * as lucius from "./src/lib/services/lucius.ts";
      import { DatabaseSync } from "node:sqlite";
      const connection = new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      assert.equal(connection.prepare("PRAGMA table_info(lucius_state)").all().some(row => row.name === "current_note"), false);
      connection.close();
      assert.equal(db.getLuciusState().status, "reading");
      assert.equal(db.getLuciusState().mood, "🌙");
      assert.equal("currentNote" in db.getLuciusState(), false);
      process.env.EVAORBIT_VAPID_PUBLIC_KEY = "test";
      process.env.EVAORBIT_VAPID_PRIVATE_KEY = "test";
      process.env.EVAORBIT_VAPID_SUBJECT = "mailto:test@example.com";
      webpush.setVapidDetails = () => {};
      const sent = [];
      webpush.sendNotification = async (subscription, payload) => { sent.push(JSON.parse(payload)); };
      db.upsertPushSubscription({endpoint:"https://push.example.com/1",p256dh:"key",auth:"auth"});
      await lucius.updateLuciusState({status:"resting"});
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0], {kind:"lucius_activity",title:"Lucius有新动态",body:"要来看看吗？",url:"/lucius",tag:"lucius-activity"});
      await lucius.updateLuciusState({status:"resting"});
      assert.equal(sent.length, 1);
      const post = await lucius.createLuciusPost({content:"hello",publishedAt:"2026-10-07T03:00:00Z"});
      assert.equal(sent.length, 2);
      await lucius.updateLuciusPost(post.id,{content:"updated"});
      assert.equal(sent.length, 3);
      await lucius.updateLuciusPost(post.id,{content:"updated"});
      await lucius.updateLuciusPost(99999,{content:"missing"});
      assert.equal(sent.length, 3);
      await lucius.createLuciusPostComment({postId:post.id,author:"user",content:"user comment"});
      assert.equal(sent.length, 3);
      const reply = await lucius.createLuciusPostComment({postId:post.id,author:"lucius",content:"reply"});
      assert.equal(sent.length, 4);
      assert.deepEqual(sent[3], {kind:"lucius_comment_reply",title:"Lucius回复了你的评论",body:"",url:"/lucius",tag:"lucius-comment-"+post.id});
      await lucius.updateLuciusPostComment(reply.id,{content:"edited reply"});
      await lucius.deleteLuciusPostComment(reply.id);
      await assert.rejects(() => lucius.createLuciusPostComment({postId:99999,author:"lucius",content:"missing post"}));
      assert.equal(sent.length, 4);
      webpush.sendNotification = async () => { throw {statusCode:410}; };
      await lucius.updateLuciusState({mood:"🥹"});
      assert.equal(db.getLuciusState().mood,"🥹");
      assert.equal(db.listPushSubscriptions().length,0);
      delete process.env.EVAORBIT_VAPID_PRIVATE_KEY;
      await lucius.updateLuciusState({status:"quiet"});
      assert.equal(db.getLuciusState().status,"quiet");
    `);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
