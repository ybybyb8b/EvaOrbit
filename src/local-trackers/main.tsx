import {LocalNativeIntegrations} from "./native-integrations";
import {LocalNativeDataEvents} from "./native-data-events";
import {LocalPullToRefresh} from "./pull-to-refresh";
import {sessionExpiredEvent} from "./session-events";
import {ErrorNotice} from "@/components/error-notice";
import {LocalRouteContext} from "./routes";
import {DownloadStatusProvider} from "./download-status";
import {OnlineBusinessProvider} from "./online-business";
import {ReadOnlyWorkspace} from "./read-only-workspace";
import {MediaWorkspace} from "./media-workspace";
import {RelationsWorkspace} from "./relations-workspace";
import {HealthWorkspace} from "./health-workspace";
import { createRoot } from "react-dom/client";
import { createContext,useContext,useEffect,useRef, useState } from "react";
import { LocaleController } from "@/components/locale-controller";
import { ErrorFeedbackProvider } from "@/components/error-feedback";
import { ActionToastViewport } from "@/components/action-toast";
import { LoginSurface } from "@/components/login-surface";
import { ThemeController } from "@/components/theme-controller";
import { NativeHapticController } from "@/components/native-haptic-controller";
import { AppearanceSettings } from "@/components/appearance-settings";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { LOCAL_APPEARANCE_BASELINE, applyAppearancePreferences, storedAppearancePreferences } from "@/lib/appearance-preferences";
import { trackerPlatform, startBrowserPreview, type LocalAccount } from "./platform";
import { LocalLogin } from "./login";
import {LocalNavigationProvider,LocalNavigationHeader,LocalDesktopBack} from "./navigation-header";
import {SettingsWorkspace} from "./settings-workspace";
import { TrackerWorkspace } from "./tracker-workspace";
import { HomeWorkspace } from "./home-workspace";
import {InboxWorkspace} from "./inbox-workspace";
import {MemoWorkspace} from "./memo-workspace";
import {ChronicleWorkspace} from "./chronicle-workspace";
import {SubscriptionsWorkspace} from "./subscriptions-workspace";
import {CatsWorkspace} from "./cats-workspace";
import {FoodWorkspace} from "./food-workspace";
import {LocalQuickLog} from "./quick-log";
import {AppSidebar,SpacesNavigation,type NavigationLinkProps} from "@/components/app-navigation";
import {MobileBottomNavigation} from "@/components/mobile-bottom-navigation";
import {BottomLogProvider} from "@/components/bottom-log-core";
import bottomNav from "@/components/bottom-navigation.module.css";
import "../app/globals.css";
import "../app/fonts.css";
import "./style.css";

const platform = trackerPlatform({editableTrackers:true,editingPaused:localStorage.getItem("evaorbit.trackerMode")==="readonly"});
applyAppearancePreferences(storedAppearancePreferences(LOCAL_APPEARANCE_BASELINE), false);

function LocalAppearance() {
  const { english } = useLocale();
  const [open, setOpen] = useState(false);
  return <><button className="text-button local-appearance-trigger" onClick={() => setOpen(true)}>{english ? "Language & appearance" : "语言与外观"}</button>{open && <FormSheet title={english ? "Language & appearance" : "语言与外观"} onClose={() => setOpen(false)}><AppearanceSettings localOnly /></FormSheet>}</>;
}

type LocalModule="tasks"|"projects"|"lucius"|"media"|"relations"|"health"|"trackers"|"home"|"food"|"cats"|"subscriptions"|"chronicle"|"memo"|"inbox"|"settings";
const localPaths=new Set(["/tasks","/projects","/lucius","/media","/","/relations","/health","/trackers","/food-drink","/cats","/subscriptions","/chronicle","/memo","/inbox"]);
const Navigate=createContext<(href:string)=>void>(()=>{});
function LocalNavLink({href,children,onClick,...props}:NavigationLinkProps){
  const navigate=useContext(Navigate);
  return <a {...props} href={href} onClick={event=>{onClick?.(event);if(event.defaultPrevented)return;event.preventDefault();navigate(href);}}>{children}</a>;
}
function LocalBrandImage(){
  // The installed bundle needs a plain local image, without the Next image service.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icons/app-icon-192.png" alt="" width={68} height={68}/>;
}

function App() {
  const [account, setAccount] = useState<LocalAccount | null>(null), [ready, setReady] = useState(false);
  const [reconnecting,setReconnecting]=useState(false),[reconnectBusy,setReconnectBusy]=useState(false);
  const [signingIn, setSigningIn] = useState(false), [error, setError] = useState("");
  const [module,setModule]=useState<LocalModule>("home"),[navigationKey,setNavigationKey]=useState(0);
  const [initialPath,setInitialPath]=useState("/");
  const history=useRef<Array<{module:LocalModule;path:string}>>([]);
  const backModule=()=>{const previous=history.current.pop();setModule(previous?.module??"home");setInitialPath(previous?.path??"/");setNavigationKey(n=>n+1);window.scrollTo(0,0);};
  const pathname=module==="home"?"/":module==="food"?"/food-drink":"/"+module;
  function navigate(href:string){
    if(!href.startsWith("/")||href.startsWith("//"))return;
    const url=new URL(href,"https://offline.invalid"),root=url.pathname.split("/")[1];
    const routes:Record<string,LocalModule>={tasks:"tasks",projects:"projects",lucius:"lucius",media:"media",relations:"relations",health:"health","":"home",trackers:"trackers","food-drink":"food",food:"food",drinks:"food",cats:"cats",subscriptions:"subscriptions",chronicle:"chronicle",memo:"memo",inbox:"inbox",settings:"settings"};
    if(url.origin!=="https://offline.invalid")return;
    if(root==="notifications"){url.pathname="/settings/notifications";}
    const next=root==="notifications"?"settings":routes[root];if(!next){setError("This page is not available in the app yet.");return;}
    if(next!==module)history.current.push({module,path:initialPath});
    setError("");setInitialPath(url.pathname+url.search+url.hash);setModule(next);setNavigationKey(n=>n+1);window.scrollTo(0,0);
  }

  useEffect(()=>{const expired=(event:Event)=>{if(account&&(event as CustomEvent).detail?.accountId===account.accountId)setReconnecting(true);};window.addEventListener(sessionExpiredEvent,expired);return()=>window.removeEventListener(sessionExpiredEvent,expired);},[account]);
  useEffect(() => { platform.account().then(setAccount).catch(() => setError("暂时无法打开本机账户，请重试。")).finally(() => setReady(true)); }, []);
  return <LocaleController localOnly defaults={LOCAL_APPEARANCE_BASELINE}><ThemeController /><ErrorFeedbackProvider><OnlineBusinessProvider account={account&&!signingIn?account:null} platform={platform}><LocalNativeIntegrations account={account&&!signingIn?account:null} native={platform.native}><Navigate.Provider value={navigate}><LocalRouteContext.Provider value={{path:initialPath,navigate}}><BottomLogProvider pathname={pathname}><DownloadStatusProvider key={account?.accountId??"signed-out"}><LocalNavigationProvider key={module+":"+navigationKey} fallback={account&&!signingIn&&["tasks","projects","lucius","media","relations","health","trackers","food","cats","subscriptions","chronicle","memo","inbox","settings"].includes(module)?backModule:undefined}><div className={`local-tracker-app local-shell app-shell ${account&&!signingIn?"local-signed-in":""} ${bottomNav.shell}`} data-ui-copy-ready="true" data-local-launch-ready={ready&&(!account||signingIn||module!=="home")?"true":undefined}>
    <NativeHapticController />
    {account&&!signingIn&&<LocalPullToRefresh key={account.accountId+":"+pathname} pathname={pathname}/>}
    {account&&!signingIn?<AppSidebar pathname={pathname} LinkComponent={LocalNavLink} allowedPaths={localPaths} brandImage={<LocalBrandImage/>}/>:<LocalAppearance/>}
    <main className={`main-content${["tasks","projects","media"].includes(module)?" has-page-back":""}`}><LocalDesktopBack/>{account&&!signingIn&&error&&<ErrorNotice>{error}</ErrorNotice>}
    {!ready ? <LoginSurface><p role="status">正在打开本机记录…</p></LoginSurface> : account && !signingIn
      ? ["tasks","projects","lucius"].includes(module)?<ReadOnlyWorkspace key={account.accountId+module} kind={module as "tasks"|"projects"|"lucius"} account={account} platform={platform}/>:module==="media"?<MediaWorkspace key={account.accountId} account={account} platform={platform}/>:module==="relations"?<RelationsWorkspace key={account.accountId} account={account} platform={platform}/>:module==="health"?<HealthWorkspace key={account.accountId} account={account} platform={platform}/>:module==="inbox"?<InboxWorkspace key={account.accountId} account={account} platform={platform}/>:module==="memo"?<MemoWorkspace key={account.accountId} account={account} platform={platform}/>:module==="chronicle"?<ChronicleWorkspace key={account.accountId} account={account} platform={platform}/>:module==="subscriptions"?<SubscriptionsWorkspace key={account.accountId} account={account} platform={platform}/>:module==="cats"?<CatsWorkspace key={account.accountId} account={account} platform={platform}/>:module==="home"?<HomeWorkspace key={account.accountId} account={account} platform={platform}/>:module==="food"?<FoodWorkspace key={account.accountId} account={account} platform={platform}/>:module==="settings"?<SettingsWorkspace account={account} platform={platform} onSignIn={()=>setSigningIn(true)} onSignOut={()=>setAccount(null)}/>:<TrackerWorkspace key={account.accountId} account={account} platform={platform} />
      : <LocalLogin platform={platform} initialError={error} onSignedIn={next => { setAccount(next); setSigningIn(false);setReconnecting(false); setError("");history.current=[];setInitialPath("/");setModule("home");setNavigationKey(n=>n+1); }} onCancel={account ? () => setSigningIn(false) : undefined} onPreview={!platform.native && !account ? async () => { setAccount(await startBrowserPreview()); setError(""); } : undefined} />}
    </main>
    {account&&!signingIn&&<><LocalNativeDataEvents accountId={account.accountId}/><SpacesNavigation pathname={pathname} LinkComponent={LocalNavLink} allowedPaths={localPaths} renderTrigger={spaces=><LocalNavigationHeader spaces={spaces}/>}/><MobileBottomNavigation pathname={pathname} LinkComponent={LocalNavLink}/><LocalQuickLog key={account.accountId+":"+module} account={account} platform={platform}/></>}
  </div>{reconnecting&&account&&<FormSheet title="Reconnect account" formId="local-login" submitLabel="Reconnect" busy={reconnectBusy} onClose={()=>setReconnecting(false)}><LocalLogin embedded onBusyChange={setReconnectBusy} initialEmail={account.email} platform={platform} onSignedIn={next=>{setAccount(next);setReconnecting(false);setError("");if(next.accountId!==account.accountId){history.current=[];setInitialPath("/");setModule("home");setNavigationKey(n=>n+1);}}}/></FormSheet>}<ActionToastViewport /></LocalNavigationProvider></DownloadStatusProvider></BottomLogProvider></LocalRouteContext.Provider></Navigate.Provider></LocalNativeIntegrations></OnlineBusinessProvider></ErrorFeedbackProvider></LocaleController>;
}
createRoot(document.getElementById("root")!).render(<App />);
