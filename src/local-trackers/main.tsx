import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { LocaleController } from "@/components/locale-controller";
import { ErrorFeedbackProvider } from "@/components/error-feedback";
import { ActionToastViewport } from "@/components/action-toast";
import { LoginSurface } from "@/components/login-surface";
import { applyAppearance, storedAppearance } from "@/lib/theme-runtime";
import { trackerPlatform, startBrowserPreview, type LocalAccount } from "./platform";
import { LocalLogin } from "./login";
import { TrackerWorkspace } from "./tracker-workspace";
import "../app/globals.css";
import "./style.css";

const platform = trackerPlatform();
try { const appearance = storedAppearance(); applyAppearance(appearance.appearanceMode, appearance.colorTheme, false); } catch { applyAppearance("system", "editorial", false); }

function App() {
  const [account, setAccount] = useState<LocalAccount | null>(null), [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false), [error, setError] = useState("");
  useEffect(() => { platform.account().then(setAccount).catch(() => setError("暂时无法打开本机账户，请重试。")).finally(() => setReady(true)); }, []);
  return <LocaleController localOnly><ErrorFeedbackProvider><div className="local-tracker-app">
    {!ready ? <LoginSurface><p role="status">正在打开本机记录…</p></LoginSurface> : account && !signingIn
      ? <TrackerWorkspace key={account.accountId} account={account} platform={platform} onSignIn={() => setSigningIn(true)} onSignOut={() => setAccount(null)} />
      : <LocalLogin platform={platform} initialError={error} onSignedIn={next => { setAccount(next); setSigningIn(false); setError(""); }} onCancel={account ? () => setSigningIn(false) : undefined} onPreview={!platform.native && !account ? async () => { setAccount(await startBrowserPreview()); setError(""); } : undefined} />}
  </div><ActionToastViewport /></ErrorFeedbackProvider></LocaleController>;
}
createRoot(document.getElementById("root")!).render(<App />);
