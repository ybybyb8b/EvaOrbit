import { ErrorNotice } from "@/components/error-notice";
import type { Metadata } from "next";
import { LoginFields, LoginSurface } from "@/components/login-surface";
import { login } from "./actions";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  return <LoginSurface>
      <form action={login}>
        <input type="hidden" name="next" value={params.next ?? "/"} />
        <LoginFields />
        {params.error === "config" && <ErrorNotice>服务器尚未配置授权邮箱，已安全拒绝登录。</ErrorNotice>}
        {params.error === "network" && <ErrorNotice>暂时无法连接登录服务，请检查本地代理和网络后重试。</ErrorNotice>}
        {params.error && params.error !== "config" && params.error !== "network" && <ErrorNotice>邮箱或密码不正确，或者该账户未被授权。</ErrorNotice>}
        <button className="button primary" type="submit">进入 EvaOrbit</button>
      </form>
    </LoginSurface>;
}
