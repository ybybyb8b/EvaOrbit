"use client";
import {useWorkspaceData} from "@/components/workspace-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";

import { responseError } from "@/lib/response-error";
import { showActionToast } from "@/components/action-toast";

import {useServerDataState} from "@/components/use-data-refresh";
import { FormEvent, useState } from "react";
import type { LuciusPostComment } from "@/lib/types";
import { playNativeHaptic } from "@/lib/native-haptics";

function commentTime(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}


export function LuciusPostComments({ postId, initialComments }: { postId: number; initialComments: LuciusPostComment[] }) {
  const {read}=useWorkspaceData(),preview=useFormPreview();
  const [comments, setComments] = useServerDataState(initialComments);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await read(`/api/lucius/posts/${postId}/comments`, { cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response, "Could not load comments."));
    setComments(await response.json() as LuciusPostComment[]);
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    setError("");
    if (next) {
      try { await load(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load comments."); }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();if(preview)return;
    if (preview||!content.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await read(`/api/lucius/posts/${postId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      if (!response.ok) throw new Error(await responseError(response, "Could not post comment."));
      const comment = await response.json() as LuciusPostComment;
      setComments((current) => [...current, comment]);
      setContent("");
      playNativeHaptic("light");
    } catch (reason) {
      playNativeHaptic("error");
      setError(reason instanceof Error ? reason.message : "Could not post comment.");
    } finally { setBusy(false); }
  }

  async function remove(comment: LuciusPostComment) {
    if(preview)return;
    if (!window.confirm("Delete this comment?")) return;
    const response = await read(`/api/lucius/posts/${postId}/comments/${comment.id}`, { method: "DELETE" });
    if (response.ok) {
      setComments((current) => current.filter((item) => item.id !== comment.id));
      playNativeHaptic("medium");
      showActionToast("Comment deleted", "deleted");
    } else {
      playNativeHaptic("error");
      setError(await responseError(response, "Could not delete comment."));
    }
  }

  return <div className="lucius-post-comments">
    <button className="lucius-comment-toggle" type="button" aria-expanded={open} onClick={toggle}>
      {comments.length ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : "Comment"}
    </button>
    {open && <div className="lucius-comment-thread">
      {comments.length > 0 && <div className="lucius-comment-list">{comments.map((comment) => <article key={comment.id} data-author={comment.author}>
        <div><strong>{comment.author === "lucius" ? "Lucius" : "You"}</strong><time dateTime={comment.createdAt}>{commentTime(comment.createdAt)}</time></div>
        <p>{comment.content}</p>
        {comment.author === "user" && <button type="button" disabled={preview} onClick={() => remove(comment)}>Delete</button>}
      </article>)}</div>}
      {preview&&<FormPreviewNotice/>}
      <form data-section-swipe-pause onSubmit={submit}>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={2} aria-label="Write a comment" placeholder="Write a comment" />
        <button type="submit" disabled={preview||busy || !content.trim()}>{busy ? "Posting" : "Post"}</button>
      </form>
      {error && <p className="lucius-comment-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
