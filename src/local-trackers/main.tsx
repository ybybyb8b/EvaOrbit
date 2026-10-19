import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { LocaleController } from "@/components/locale-controller";
import { ErrorFeedbackProvider } from "@/components/error-feedback";
import { ActionToastViewport } from "@/components/action-toast";
import { LoginSurface } from "@/components/login-surface";
import { ThemeController } from "@/components/theme-controller";
import { AppearanceSettings } from "@/components/appearance-settings";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { LOCAL_APPEARANCE_BASELINE, applyAppearancePreferences, storedAppearancePreferences } from "@/lib/appearance-preferences";
import { trackerPlatform, startBrowserPreview, type LocalAccount } from "./platform";
import { LocalLogin } from "./login";
import { TrackerWorkspace } from "./tracker-workspace";
import { HomeWorkspace } from "./home-workspace";
import "../app/globals.css";
import "../app/fonts.css";
import "./style.css";

const platform = trackerPlatform();
applyAppearancePreferences(storedAppearancePreferences(LOCAL_APPEARANCE_BASELINE), false);

function LocalAppearance() {
  const { english } = useLocale();
  const [open, setOpen] = useState(false);
  return <><button className="text-button local-appearance-trigger" onClick={() => setOpen(true)}>{english ? "Language & appearance" : "语言与外观"}</button>{open && <FormSheet title={english ? "Language & appearance" : "语言与外观"} onClose={() => setOpen(false)}><AppearanceSettings localOnly /></FormSheet>}</>;
}

function App() {
  const [account, setAccount] = useState<LocalAccount | null>(null), [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false), [error, setError] = useState("");
  const [module,setModule]=useState<"trackers"|"home">("trackers");
  useEffect(() => { platform.account().then(setAccount).catch(() => setError("暂时无法打开本机账户，请重试。")).finally(() => setReady(true)); }, []);
  return <LocaleController localOnly defaults={LOCAL_APPEARANCE_BASELINE}><ThemeController /><ErrorFeedbackProvider><div className="local-tracker-app" data-ui-copy-ready="true">
    <LocalAppearance />
    {account&&!signingIn&&<nav className="local-module-nav" aria-label="Modules"><button type="button" className="text-button" aria-current={module==="home"?"page":undefined} onClick={()=>setModule("home")}>Home</button><button type="button" className="text-button" aria-current={module==="trackers"?"page":undefined} onClick={()=>setModule("trackers")}>Trackers</button></nav>}
    {!ready ? <LoginSurface><p role="status">正在打开本机记录…</p></LoginSurface> : account && !signingIn
      ? module==="home"?<HomeWorkspace key={account.accountId} account={account} platform={platform}/>:<TrackerWorkspace key={account.accountId} account={account} platform={platform} onSignIn={() => setSigningIn(true)} onSignOut={() => setAccount(null)} />
      : <LocalLogin platform={platform} initialError={error} onSignedIn={next => { setAccount(next); setSigningIn(false); setError(""); }} onCancel={account ? () => setSigningIn(false) : undefined} onPreview={!platform.native && !account ? async () => { setAccount(await startBrowserPreview()); setError(""); } : undefined} />}
  </div><ActionToastViewport /></ErrorFeedbackProvider></LocaleController>;
}
createRoot(document.getElementById("root")!).render(<App />);
