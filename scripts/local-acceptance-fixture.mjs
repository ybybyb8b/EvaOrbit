// Isolated fixture shared by service and viewport regression checks. Never reads production.
import fs from 'node:fs/promises';import path from 'node:path';
import {seedHealth} from './health-readonly-fixture.mjs';
import {seedCats} from './cats-readonly-fixture.mjs';
import {seedMedia} from './media-readonly-fixture.mjs';
import {seedRelations} from './relations-readonly-fixture.mjs';
import {seedSubscriptions} from './subscriptions-readonly-fixture.mjs';
import {seedWorkspaces} from './workspace-readonly-fixture.mjs';
import {getHealthReadonlySnapshot} from '../src/lib/services/health-readonly.ts';
import {getCatsReadonlySnapshot} from '../src/lib/services/cats-readonly.ts';
import {getMediaReadonlySnapshot} from '../src/lib/services/media-readonly.ts';
import {getRelationsReadonlySnapshot} from '../src/lib/services/relations-readonly.ts';
import {getSubscriptionsReadonlySnapshot} from '../src/lib/services/subscriptions-readonly.ts';
import {getWorkspaceReadonlySnapshot} from '../src/lib/services/workspace-readonly.ts';
import {getRepository} from '../src/lib/repositories/index.ts';
export async function seedAcceptance(account){
 await seedHealth();await seedCats();await seedMedia();await seedRelations();await seedSubscriptions();await seedWorkspaces();
 for(const name of ['EVAORBIT_CAT_AVATAR_DIR','EVAORBIT_MEDIA_COVER_DIR','EVAORBIT_RELATION_PHOTO_DIR','EVAORBIT_SUBSCRIPTION_ICON_DIR']){
  const directory=path.resolve(process.env[name]);if(!directory.startsWith(path.resolve('tmp')+path.sep))throw Error('Fixture cleanup must remain inside workspace tmp');await fs.rm(directory,{recursive:true,force:true});
 }
 const r=await getRepository(),p=(await r.listProjects())[0];await r.updateProject(p.id,{description:'Long project context, dates, decisions and next steps. '.repeat(45)});
 return {health:await getHealthReadonlySnapshot(account),cats:await getCatsReadonlySnapshot(account),media:await getMediaReadonlySnapshot(account),relations:await getRelationsReadonlySnapshot(account),subscriptions:await getSubscriptionsReadonlySnapshot(account),projects:await getWorkspaceReadonlySnapshot(account,'projects')};
}
