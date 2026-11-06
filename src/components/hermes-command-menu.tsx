"use client";
import type { HermesCommand } from "@/lib/hermes";
import styles from "./hermes-chat.module.css";

const descriptions: Record<string, string> = {
  help:"查看帮助和可用命令",commands:"浏览全部命令",new:"开始全新的 Hermes 会话",stop:"停止当前运行的任务",status:"查看会话、模型和运行状态",
  model:"查看或切换模型",reasoning:"调整思考强度与显示",context:"查看当前上下文用量",usage:"查看用量",version:"查看 Hermes 版本",whoami:"查看当前身份",
  memory:"查看和管理记忆",skills:"查看技能",agents:"查看正在运行的任务",queue:"查看或管理待处理消息",compress:"压缩当前上下文",resume:"恢复已有会话",title:"修改当前会话标题",
  retry:"重新处理上一条消息",undo:"回退最近的对话",verbose:"调整工具过程的显示",approve:"批准当前等待确认的操作",deny:"拒绝当前等待确认的操作",cron:"查看和管理定时任务",
  egress:"查看 Docker 网络限制",plan:"制定计划",learn:"学习和整理经验",goal:"管理当前目标",loop:"管理循环任务",heartbeat:"管理定期检查",footer:"调整回复底部信息",
  personality:"调整表达风格",profile:"查看当前配置",save:"导出当前对话",debug:"查看诊断信息",insights:"查看使用分析","reload-mcp":"重新加载 MCP 连接",
};
export function filterHermesCommands(commands: HermesCommand[], draft: string) {
  const query = /^\/([\w-]*)$/.exec(draft.trim())?.[1]?.toLowerCase() ?? "";
  const preferred = ["help","new","stop","status","model","reasoning","context","commands"];
  return commands.filter(command => command.name.startsWith(query) || command.aliases?.some(alias => alias.startsWith(query)))
    .sort((a,b) => (preferred.includes(a.name) ? preferred.indexOf(a.name) : 100) - (preferred.includes(b.name) ? preferred.indexOf(b.name) : 100));
}
export function HermesCommandMenu({ id, commands, selected, english, onChoose }: { id: string; commands: HermesCommand[]; selected: number; english: boolean; onChoose: (command: HermesCommand) => void }) {
  return <div id={id} className={styles.commandMenu} role="listbox" aria-label={english ? "Hermes commands" : "Hermes 命令"}>
    {commands.map((command,index) => <button key={command.name} id={`${id}-${index}`} role="option" aria-selected={selected === index} type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>onChoose(command)}>
      <span data-no-translate translate="no"><strong>/{command.name}</strong>{command.argsHint && <small>{command.argsHint}</small>}</span>
      <span>{english ? command.description : descriptions[command.name] ?? command.localizedDescription ?? command.description}</span>
    </button>)}
    {!commands.length && <p>{english ? "No matching commands. Use /help to see Hermes’ help." : "没有匹配的命令，可发送 /help 查看帮助。"}</p>}
  </div>;
}
