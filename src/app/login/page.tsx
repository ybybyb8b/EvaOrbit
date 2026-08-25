import type { Metadata } from "next";
import { login } from "./actions";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  return <main className="login-page">
    <section className="login-card">
      <span className="brand-mark login-mark"><span /></span>
      <span className="eyebrow">PRIVATE ORBIT</span>
      <h1>回到 EvaOrbit</h1>
      <p>这里只有自己的生活数据。登录后再继续。</p>
      <form action={login}>
        <input type="hidden" name="next" value={params.next ?? "/"} />
        <label className="field"><span>邮箱</span><input name="email" type="email" autoComplete="username" required /></label>
        <label className="field"><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>
        {params.error === "config" && <p className="form-error">服务器尚未配置授权邮箱，已安全拒绝登录。</p>}
        {params.error && params.error !== "config" && <p className="form-error">邮箱或密码不正确，或者该账户未被授权。</p>}
        <button className="button primary" type="submit">进入 EvaOrbit</button>
      </form>
      <small>没有公开注册入口。账户需要先在 Supabase 中创建并授权。</small>
    </section>
  </main>;
}
