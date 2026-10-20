import type {Metadata} from "next";
import {getLuciusState,listLuciusCases,listLuciusDiaryEntries,listLuciusPostComments,listLuciusPosts} from "@/lib/services/lucius";
import {LuciusProfile} from "./lucius-profile";
export const metadata:Metadata={title:"Lucius"};
export const dynamic="force-dynamic";
type SearchParams=Promise<{tab?:string|string[]}>;
function resolveTab(value:string|string[]|undefined){const tab=Array.isArray(value)?value[0]:value;return tab==="diary"||tab==="cases"?tab:"posts";}
export default async function LuciusPage({ searchParams }: { searchParams: SearchParams }) {
  const tab = resolveTab((await searchParams).tab);
  const [state, posts, diaryEntries, cases] = await Promise.all([
    getLuciusState(),
    tab === "posts" ? listLuciusPosts({ limit: 50 }) : Promise.resolve([]),
    tab === "diary" ? listLuciusDiaryEntries({ limit: 100 }) : Promise.resolve([]),
    tab === "cases" ? listLuciusCases({ limit: 100 }) : Promise.resolve([]),
  ]);
  const comments = posts.length ? await listLuciusPostComments({ postIds: posts.map((post) => post.id), limit: 500 }) : [];
  // Capture once on the server and serialize it, so hydration uses the same clock.
  // eslint-disable-next-line react-hooks/purity -- This async server page does not rerender on the client.
  return <LuciusProfile now={Date.now()} tab={tab} state={state} posts={posts} diaryEntries={diaryEntries} cases={cases} comments={comments}/>;
}
