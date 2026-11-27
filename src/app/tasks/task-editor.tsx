"use client";
import {NoteTextarea} from "@/components/note-textarea";
import type {Dispatch,SetStateAction} from "react";
import {ChoiceSelect} from "@/components/choice-select";
import {SuggestedInput} from "@/components/suggested-input";
import {currentLocalDate,DateTimeField,type DateTimeDraft} from "@/components/date-time-field";
import {useLocale} from "@/components/locale-controller";
import {taskDateOffset} from "@/lib/task-groups";
import {dateInEvaOrbit} from "@/lib/time";
import type {TaskPriority} from "@/lib/types";
import styles from "./task-editor.module.css";
type ReminderMode="none"|"at_due"|"custom";
export type TaskDraft = { title:string;notes:string;dueDate:string;dueTime:string;completedOn?:string;reminderMode:ReminderMode;reminderDate:string;reminderTime:string;repeatWhileOverdue:boolean;priority:TaskPriority;tags:string };
export const emptyTaskDraft:TaskDraft={title:"",notes:"",dueDate:"",dueTime:"",reminderMode:"none",reminderDate:"",reminderTime:"",repeatWhileOverdue:false,priority:"medium",tags:""};

export function TaskEditor({draft,setDraft,tags=[]}:{draft:TaskDraft;setDraft:Dispatch<SetStateAction<TaskDraft>>;tags?:string[]}){
  const {english}=useLocale(),today=currentLocalDate();
  function setDue({ date, time }: DateTimeDraft) {
    setDraft(current => {
      const reminderMode = current.reminderMode === "at_due" && (!date || !time) ? "none" : current.reminderMode;
      return {
        ...current, dueDate: date, dueTime: date ? time : "", reminderMode,
        repeatWhileOverdue: Boolean(date && reminderMode !== "none" && current.repeatWhileOverdue),
      };
    });
  }

  return <>
      <label className="field"><span>{english ? "Task" : "任务内容"}</span><input required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder={english ? "What needs to be done?" : "需要做什么？"} /></label>
      {draft.completedOn !== undefined && <label className="field"><span>{english ? "Completion date" : "完成日期"}</span><input type="date" required max={dateInEvaOrbit()} value={draft.completedOn} onChange={event => setDraft({ ...draft, completedOn: event.target.value })} /></label>}

      <div className={styles.schedule}>
        <DateTimeField label={english ? "Due date" : "截止日期"} timeLabel={english ? "Due time" : "截止时间"} optionalDate value={{ date: draft.dueDate, time: draft.dueTime }} onChange={setDue} />
        <div className={styles.shortcuts} role="group" aria-label={english ? "Due date shortcuts" : "截止日期快捷选项"}>
          {[[today, english ? "Today" : "今天"], [taskDateOffset(today, 1), english ? "Tomorrow" : "明天"], ["", english ? "No due date" : "不设日期"]].map(([date, label]) =>
            <button type="button" key={label} data-form-change aria-pressed={draft.dueDate === date} onClick={() => setDue({ date, time: draft.dueTime })}>{label}</button>
          )}
        </div>
      </div>

      <div className={styles.schedule}>
        <div className="field">
          <span>{english ? "Reminder" : "提醒"}</span>
          <ChoiceSelect aria-label={english ? "Reminder" : "提醒"} value={draft.reminderMode} onChange={event => {
            const reminderMode = event.target.value as ReminderMode;
            setDraft({ ...draft, reminderMode, repeatWhileOverdue: reminderMode !== "none" && draft.repeatWhileOverdue });
          }}>
            <option value="none">{english ? "None" : "不提醒"}</option>
            <option value="at_due" disabled={!draft.dueDate || !draft.dueTime}>{english ? "At due time" : "截止时提醒"}</option>
            <option value="custom">{english ? "Custom" : "自定义"}</option>
          </ChoiceSelect>
        </div>
        {draft.reminderMode === "custom" && <div className={styles.reminderDateTime}>
          <label className="field"><span>{english ? "Reminder date" : "提醒日期"}</span><input type="date" required value={draft.reminderDate} onChange={event => setDraft({ ...draft, reminderDate: event.target.value })} /></label>
          <label className="field"><span>{english ? "Reminder time" : "提醒时间"}</span><input type="time" required step={draft.reminderTime && Number(draft.reminderTime.slice(3, 5)) % 5 !== 0 ? 60 : 300} value={draft.reminderTime} onChange={event => setDraft({ ...draft, reminderTime: event.target.value })} /></label>
        </div>}
        {draft.reminderMode !== "none" && draft.dueDate && <label className={`field ${styles.repeat}`}><input role="switch" className="toggle-switch" type="checkbox" checked={draft.repeatWhileOverdue} onChange={event => setDraft({ ...draft, repeatWhileOverdue: event.target.checked })} /><span>{english ? "Repeat daily while overdue" : "逾期后每日重复提醒"}</span></label>}
      </div>

      <div className="field">
        <span>{english ? "Priority" : "优先级"}</span>
        <ChoiceSelect aria-label={english ? "Priority" : "优先级"} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as TaskPriority })}>
          <option value="low">{english ? "Low" : "低"}</option>
          <option value="medium">{english ? "Medium" : "中"}</option>
          <option value="high">{english ? "High" : "高"}</option>
        </ChoiceSelect>
      </div>
      <div className="field"><span>{english ? "Tags" : "标签"} <small>{english ? "Enter to add" : "回车添加"}</small></span><SuggestedInput aria-label={english ? "Tags" : "标签"} suggestionLabel={english ? "Tags" : "标签"} suggestions={tags} tags value={draft.tags} onValueChange={nextValue => setDraft({ ...draft, tags: nextValue })} placeholder={english ? "Personal, This week" : "生活, 本周"} /></div>
      <label className="field"><span>{english ? "Notes" : "备注"}</span><NoteTextarea maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder={english ? "Optional context" : "补充上下文（可选）"} /></label>
  </>;
}
