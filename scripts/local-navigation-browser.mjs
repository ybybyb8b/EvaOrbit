import {createServer as probeServer} from "node:net";
export const freeLocalPort=()=>new Promise((resolve,reject)=>{const probe=probeServer();probe.once("error",reject);probe.listen(0,"127.0.0.1",()=>{const port=probe.address().port;probe.close(error=>error?reject(error):resolve(port));});});
// Drive the same sidebar / mobile drawer used by Web, rather than a test-only module bar.
export async function navigateLocal(page,label){
  const sidebar=page.getByRole("navigation",{name:/^(Main navigation|主导航)$/,exact:true});
  if(await sidebar.isVisible())return page.locator(".sidebar").getByRole("link",{name:label,exact:true}).click();
  if(label==="Home"||label==="Settings")return page.locator(".mobile-nav").getByRole("link",{name:label,exact:true}).click();
  const trigger=page.getByRole("button",{name:/^(Open spaces|打开空间导航)$/,exact:true});
  // Background offline errors can arrive after switching modules; dismiss the real banner normally.
  for(let attempt=0;attempt<4;attempt++){
    for(const close of await page.locator(".error-banner-close").all())await close.click();
    try{await trigger.click({timeout:1500});break;}catch(error){if(attempt===3||!await page.locator(".error-banner-close").count())throw error;}
  }
  const drawer=page.getByRole("dialog",{name:/^(All spaces|总览)$/,exact:true});
  await drawer.getByRole("link",{name:label,exact:true}).click();
  await drawer.waitFor({state:"detached"});
}
