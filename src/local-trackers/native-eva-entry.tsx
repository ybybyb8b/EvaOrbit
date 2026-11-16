import type {ReactNode,ComponentProps} from "react";
import {useNativeEva} from "@/components/native-eva-context";
import {NativeEvaChat} from "@/components/native-eva-chat";
import {ParlorActivity} from "@/components/parlor-activity";
import {ParlorUnavailable} from "@/components/parlor-unavailable";
import {PageLoading} from "@/components/page-loading";
import {AppSidebar,SpacesNavigation} from "@/components/app-navigation";
import {ParlorSettings} from "@/components/parlor-settings";

export function LocalSidebar(props:ComponentProps<typeof AppSidebar>){return <AppSidebar {...props} aiLabel="Parlor"/>;}
export function LocalSpacesNavigation(props:ComponentProps<typeof SpacesNavigation>){return <SpacesNavigation {...props} aiLabel="Parlor"/>;}

export function LocalAiChat({scope,path,back,navigate,providerRequest}:{scope:string;path:string;back:ReactNode;navigate:(path:string)=>void;providerRequest?:(path:string,init?:RequestInit)=>Promise<Response>}) {
  const {supported}=useNativeEva();
  const url=new URL(path,"https://eo.invalid"),conversation=url.searchParams.get("conversation")??undefined;
  if(supported===null)return <PageLoading title="对话" englishTitle="conversation"/>;
  if(url.pathname==="/ai/settings")return <ParlorSettings onConversation={id=>navigate(`/ai?conversation=${id}`)} accountId={scope} back={back} initialSection={url.searchParams.get("section")??""} providerRequest={providerRequest}/>;
  if(supported)return <NativeEvaChat key={scope} accountId={scope} back={back} initialConversationId={conversation} onSettings={section=>navigate(`/ai/settings${section?`?section=${section}`:""}`)}/>;
  return <ParlorUnavailable back={back}/>;
}
export function LocalAiActivity({scope,inConversation,navigate}:{scope:string;inConversation:boolean;navigate:(path:string)=>void}) {
  const {supported}=useNativeEva();
  if(supported===null)return null;
  return <ParlorActivity scope={scope} supported={supported} inConversation={inConversation} onNavigate={navigate}/>;
}
