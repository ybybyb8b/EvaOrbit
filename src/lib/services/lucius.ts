import "server-only";

import { notifyLuciusActivity } from "./push";
import { getRepository } from "../repositories";
import { dateInEvaOrbit } from "../time";
import { dateOnly } from "../validation";
import type { LuciusCaseListInput, LuciusCasePatch, LuciusDiaryListInput, LuciusDiaryPatch, LuciusPostCommentListInput, LuciusPostCommentPatch, LuciusPostListInput, LuciusPostPatch, LuciusStatePatch, NewLuciusCase, NewLuciusDiaryEntry, NewLuciusPost, NewLuciusPostComment } from "../repositories/types";

export async function listLuciusDiaryEntries(input: LuciusDiaryListInput = {}) { return (await getRepository()).listLuciusDiaryEntries(input); }
export async function getLuciusDiaryEntry(id: number) { return (await getRepository()).getLuciusDiaryEntry(id); }
export async function createLuciusDiaryEntry(input: NewLuciusDiaryEntry) { return (await getRepository()).createLuciusDiaryEntry(input); }
export async function updateLuciusDiaryEntry(id: number, input: LuciusDiaryPatch) { return (await getRepository()).updateLuciusDiaryEntry(id, input); }
export async function deleteLuciusDiaryEntry(id: number) { return (await getRepository()).deleteLuciusDiaryEntry(id); }

export async function listLuciusCases(input: LuciusCaseListInput = {}) { return (await getRepository()).listLuciusCases(input); }
export async function getLuciusCase(id: number) { return (await getRepository()).getLuciusCase(id); }
export async function createLuciusCase(input: NewLuciusCase) { return (await getRepository()).createLuciusCase(input); }
export async function updateLuciusCase(id: number, input: LuciusCasePatch) { return (await getRepository()).updateLuciusCase(id, input); }
export async function deleteLuciusCase(id: number) { return (await getRepository()).deleteLuciusCase(id); }
export async function recordLuciusCaseRecurrence(id: number, occurredDate = dateInEvaOrbit()) { return (await getRepository()).recordLuciusCaseRecurrence(id, dateOnly(occurredDate, "复发日期")); }
export async function getLuciusState() { return (await getRepository()).getLuciusState(); }
export async function updateLuciusState(input: LuciusStatePatch) {
  const repository = await getRepository();
  const previous = await repository.getLuciusState();
  const state = await repository.updateLuciusState(input);
  if (state.status !== previous.status || state.mood !== previous.mood) await notifyLuciusActivity(repository);
  return state;
}
export async function listLuciusPosts(input: LuciusPostListInput = {}) { return (await getRepository()).listLuciusPosts(input); }
export async function getLuciusPost(id: number) { return (await getRepository()).getLuciusPost(id); }
export async function createLuciusPost(input: NewLuciusPost) {
  const repository = await getRepository();
  const post = await repository.createLuciusPost(input);
  await notifyLuciusActivity(repository);
  return post;
}
export async function updateLuciusPost(id: number, input: LuciusPostPatch) {
  const repository = await getRepository();
  const previous = await repository.getLuciusPost(id);
  const post = await repository.updateLuciusPost(id, input);
  if (post && previous && (post.content !== previous.content || post.publishedAt !== previous.publishedAt)) await notifyLuciusActivity(repository);
  return post;
}
export async function deleteLuciusPost(id: number) { return (await getRepository()).deleteLuciusPost(id); }
export async function listLuciusPostComments(input: LuciusPostCommentListInput = {}) { return (await getRepository()).listLuciusPostComments(input); }
export async function getLuciusPostComment(id: number) { return (await getRepository()).getLuciusPostComment(id); }
export async function createLuciusPostComment(input: NewLuciusPostComment) {
  const repository = await getRepository();
  const comment = await repository.createLuciusPostComment(input);
  if (comment.author === "lucius") await notifyLuciusActivity(repository, {
    kind: "lucius_comment_reply", title: "Lucius回复了你的评论", body: "", url: "/lucius", tag: `lucius-comment-${comment.postId}`,
  });
  return comment;
}
export async function updateLuciusPostComment(id: number, input: LuciusPostCommentPatch) { return (await getRepository()).updateLuciusPostComment(id, input); }
export async function deleteLuciusPostComment(id: number) { return (await getRepository()).deleteLuciusPostComment(id); }
