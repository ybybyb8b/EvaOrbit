import fs from 'node:fs/promises';
import path from 'node:path';
import {getRepository} from '../src/lib/repositories/index.ts';
import {createMedia} from '../src/lib/services/media.ts';
import {parseNewMedia} from '../src/lib/validation.ts';
export async function seedMedia(){
 const r=await getRepository(),series=await r.createMediaSeries('Reacher'),items=[];
 for(const data of [{mediaType:'tv',status:'completed',seriesId:series.id,seasonNumber:1,watchedDate:'2025-01-15'},{mediaType:'tv',status:'watching',seriesId:series.id,seasonNumber:2},{originalTitle:'Ocean Documentary',mediaType:'documentary',status:'planned'},{originalTitle:'Concert Other',mediaType:'other',status:'completed',watchedDate:'2026-10-19'},{originalTitle:'A Long Movie Name',translatedTitle:'电影译名',mediaType:'movie',status:'planned',isFavorite:true}])items.push(await createMedia(parseNewMedia(data)));
 await r.createMediaViewing({mediaId:items[0].id,watchedDate:'2026-09-15'});
 const dir=process.env.EVAORBIT_MEDIA_COVER_DIR;if(dir){await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`${items[0].id}.png`),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhAAAAABJRU5ErkJggg==','base64'));await r.updateMediaItem(items[0].id,{coverUrl:`/api/media/${items[0].id}/cover?type=png&v=1`});}
 return {series,items};
}
