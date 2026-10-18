import type { ComponentProps, ReactNode } from "react";

export function LoginFields({ disabled, email, password }: { disabled?: boolean; email?: ComponentProps<"input">; password?: ComponentProps<"input"> }) {
  return <><label className="field"><span>邮箱</span><input {...email} name="email" type="email" autoComplete="username" required disabled={disabled} /></label><label className="field"><span>密码</span><input {...password} name="password" type="password" autoComplete="current-password" required disabled={disabled} /></label></>;
}

/** The same login identity and controls frame for server and local transports. */
export function LoginSurface({ children, footer, actions }: { children: ReactNode; footer?: ReactNode; actions?: ReactNode }) {
  return <main className="login-page"><section className="login-card">
    <span className="brand-mark login-mark" aria-hidden="true"><span /></span>
    <span className="eyebrow">PRIVATE ORBIT</span>
    <h1>回到 EvaOrbit</h1>
    <p>这里只有自己的生活数据。登录后再继续。</p>
    {children}
    <small>{footer ?? "没有公开注册入口。账户需要先在 Supabase 中创建并授权。"}</small>
    {actions}
  </section></main>;
}
