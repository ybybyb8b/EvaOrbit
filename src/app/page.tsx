import Link from "next/link";
import { Icon } from "@/components/icons";
import { getDashboardSummary, listChatSessions } from "@/lib/services/evaorbit";
import { getTodayFood } from "@/lib/services/food";
import { getDailyNutritionSummary } from "@/lib/services/nutrition";
import { defaultQuickActions } from "@/lib/quick-actions";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";

function dateLabel() {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: EVAORBIT_TIME_ZONE }).format(new Date());
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date()));
  if (hour < 6) return "还没睡啊";
  if (hour < 11) return "早上了";
  if (hour < 14) return "中午了";
  if (hour < 19) return "下午了";
  return "晚上了";
}

export default async function HomePage() {
  const [summary, allConversations, todayFood, nutrition] = await Promise.all([getDashboardSummary(), listChatSessions(), getTodayFood(), getDailyNutritionSummary()]);
  const conversations = allConversations.slice(0, 2);
  const focusTasks = summary.recentTasks.filter((task) => !task.completed).slice(0, 3);

  return <div className="page home-page">
    <header className="home-masthead">
      <span className="eyebrow">{dateLabel()}</span>
      <h1>{greeting()}</h1>
      <p>今天先看看这些。脑子里突然冒出来的，也可以先丢进来。</p>
    </header>

    <section className="home-ai-hero">
      <div className="home-ai-copy"><span className="ai-orb"><Icon name="spark" /></span><div><span className="eyebrow">THINKING SPACE</span><h2>脑子里有什么</h2></div></div>
      <form action="/ai" className="home-ai-input"><input name="prompt" maxLength={20000} aria-label="写下想法" placeholder="先丢这里，想清楚、找东西、记一笔都行…" /><button aria-label="接着想"><Icon name="arrow" /></button></form>
      <div className="home-ai-suggestions"><Link href="/ai?prompt=翻一下待办 看看今天哪个真得先弄">看看今天</Link><Link href="/ai?prompt=我是不是漏了什么 翻一下待办和最近记过的">有没有漏掉</Link><Link href="/ai?prompt=翻翻我最近记过的东西">翻翻最近</Link></div>
    </section>

    <nav className="quick-actions" aria-label="快速动作">{defaultQuickActions.slice(0,4).map(action=><Link href={action.href} key={action.id}><span><Icon name={action.icon}/></span><strong>{action.label}</strong><small>{action.description}</small></Link>)}</nav>

    <div className="home-today-grid">
      <section className="today-focus">
        <div className="section-heading"><div><span className="eyebrow">TODAY</span><h2>今天先弄</h2></div><p><strong>{summary.openTasks}</strong> 个还没弄{summary.dueToday ? ` · ${summary.dueToday} 个今天到期` : ""}</p></div>
        {focusTasks.length ? <div className="compact-list">{focusTasks.map((task) => <Link href="/tasks" className="compact-task" key={task.id}>
          <span className="check-mark" />
          <div><strong>{task.title}</strong><small>{task.dueDate ? `${task.dueDate} 截止` : "没有截止日期"}</small></div>
          <span className={`priority-dot ${task.priority}`} title={`${task.priority} priority`} />
        </Link>)}</div> : <EmptyState text="今天没有需要追赶的事。" href="/tasks?new=1" action="放下一件想做的事" />}
        <Link href="/tasks?status=open" className="section-link">翻全部待办 <Icon name="arrow" /></Link>
      </section>

      <section className="home-kept">
        <div className="section-heading"><div><span className="eyebrow">RECENTLY</span><h2>最近记过的</h2></div><span>{summary.memories} 条</span></div>
        {summary.recentMemories.length ? <div className="kept-list">{summary.recentMemories.slice(0, 2).map((memory) => <Link href="/memory" key={memory.id} className="kept-note"><span>{memory.category}</span><strong>{memory.title}</strong><p>{memory.content}</p></Link>)}</div> : <EmptyState text="这里还空着。" href="/memory?new=1" action="先记一个" />}
      </section>
    </div>

    <section className="home-food-mini"><div className="section-heading"><div><span className="eyebrow">FOOD TODAY</span><h2>今天吃过</h2></div><Link href="/food">去看看</Link></div><div className="meal-checks">{([['breakfast','早餐'],['lunch','午餐'],['dinner','晚餐']] as const).map(([value,label])=><span key={value}>{label} <strong>{todayFood.some(item=>item.mealType===value)?"✓":"—"}</strong></span>)}</div><p>{nutrition.intakeMin===nutrition.intakeMax?`摄入约 ${nutrition.estimatedIntakeKcal} kcal`:`摄入约 ${nutrition.intakeMin}–${nutrition.intakeMax} kcal`}</p></section>

    {conversations.length > 0 && <section className="recent-conversations"><div className="section-heading"><div><span className="eyebrow">CONTINUE</span><h2>接着想</h2></div><Link href="/ai">聊过这些</Link></div><div>{conversations.map((session) => <Link href={`/ai?session=${session.id}`} key={session.id}><span className="conversation-spark"><Icon name="spark" /></span><span><strong>{session.title}</strong><small>{session.preview || "接着这段"}</small></span><Icon name="arrow" /></Link>)}</div></section>}
  </div>;
}

function EmptyState({ text, href, action }: { text: string; href: string; action: string }) {
  return <div className="empty-compact"><p>{text}</p><Link href={href}>{action} →</Link></div>;
}
