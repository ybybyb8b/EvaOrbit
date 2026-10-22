import "server-only";
import {withMediaReadOnlyRepository} from "../repositories";
import {getMediaDetail,listMedia,listMediaSeries} from "./media";
import {readMediaCover} from "./media-cover";
import {detectAvatarImage} from "../avatar";
import {validateMediaSnapshot} from "../media-readonly";
export async function getMediaReadonlySnapshot(accountId:string){return withMediaReadOnlyRepository(async()=>{
  const series=await listMediaSeries(),items=[];
  for(let offset=0;;offset+=200){
    const page=await listMedia({limit:200,offset});
    if(items.length+page.length>1000)throw new Error("Media exceeds 1,000 works; previous cache preserved");
    for(const row of page){const detail=await getMediaDetail(row.id);if(!detail||detail.updatedAt!==row.updatedAt)throw new Error("Media changed during download; retry to preserve a consistent cache");
      if(detail.coverUrl){const image=await readMediaCover(row.id);if(image&&(image.bytes.length>4*1024*1024||!detectAvatarImage(image.bytes)))throw new Error("Invalid Media cover; previous cache preserved");detail.coverUrl=image?`data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`:null;}
      items.push(detail);
    }
    if(page.length<200)break;
  }
  return validateMediaSnapshot({format:"eo-media-readonly-v1",accountId,capturedAt:new Date().toISOString(),items,series},accountId);
});}
