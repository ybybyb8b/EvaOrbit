// Capabilities describe working transports, never a user preference that can enable an absent protocol.
export const syncModules = [
  {id:"trackers",en:"Trackers",zh:"观测",offlineWrites:true},
  {id:"home",en:"Home",zh:"首页",offlineWrites:false},
  {id:"food",en:"Food & Drink",zh:"食品与饮品",offlineWrites:false},
  {id:"health",en:"Health",zh:"健康",offlineWrites:false},
  {id:"cats",en:"Cats",zh:"猫咪",offlineWrites:false},
  {id:"subscriptions",en:"Subscriptions",zh:"订阅",offlineWrites:false},
  {id:"relations",en:"Relations",zh:"关系",offlineWrites:false},
  {id:"media",en:"Media",zh:"媒体",offlineWrites:false},
  {id:"memo",en:"Memo",zh:"碎片",offlineWrites:false},
  {id:"chronicle",en:"Chronicle",zh:"纪事",offlineWrites:false},
  {id:"inbox",en:"Inbox",zh:"收件箱",offlineWrites:false},
  {id:"tasks",en:"Tasks",zh:"任务",offlineWrites:false},
  {id:"projects",en:"Projects",zh:"项目",offlineWrites:false},
  {id:"lucius",en:"Lucius",zh:"Lucius",offlineWrites:false},
] as const;
export type SyncModuleId=typeof syncModules[number]["id"];
export type ModuleSyncStatus={capturedAt?:string;busy?:boolean;error?:string;complete?:boolean;pending?:number;issues?:number;hasLocalData?:boolean;paused?:boolean};
