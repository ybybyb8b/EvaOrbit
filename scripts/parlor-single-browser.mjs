import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const origin=process.env.PARLOR_PREVIEW_ORIGIN||"http://127.0.0.1:4187";
const output=process.env.PARLOR_SCREENSHOTS||"tmp/parlor-single";
await fs.mkdir(output,{recursive:true});
const account="10000000-0000-4000-8000-000000000001";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  for(const [label,width,height] of [["mobile",402,874],["desktop",1280,900]]){
    const mobile=label==="mobile";
    const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
    await context.addInitScript(account=>{
      localStorage.setItem("evaorbit.uiLanguage","zh");
      localStorage.setItem("evaorbit.appearanceMode","light");
      localStorage.setItem("evaorbit.hermes.segmentReplies:"+account,"true");
      localStorage.setItem("evaorbit.parlor.avatarPlacement:"+account,"all");
    },account);
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors=[];
    page.on("pageerror",error=>pageErrors.push(error.message));
    const preview=new URL(origin);
    preview.searchParams.set("singleRetryFixture","");
    await page.goto(preview.href);
    const enter=()=>page.getByRole("button",{name:/Parlor ·/}).click();
    const input=page.getByRole("textbox",{name:"消息内容"});
    const chat=page.locator("[data-parlor-chat]");
    const send=page.getByRole("button",{name:"发送",exact:true});
    const user=page.locator("[data-role=user]");
    const agent=page.locator("[data-role=assistant]");
    await page.evaluate(async account=>{
      const assets=[["assistant","/images/lucius-portrait.png"],["user","/icons/features/cats.png"],["wallpaper","/images/lucius-cover-light.png"]];
      const images=await Promise.all(assets.map(async ([kind,url])=>[kind,await (await fetch(url)).blob()]));
      const db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open("eo-hermes-appearance",1);
        request.onupgradeneeded=()=>request.result.createObjectStore("images");
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      await new Promise((resolve,reject)=>{
        const transaction=db.transaction("images","readwrite");
        for(const [kind,image] of images)transaction.objectStore("images").put(image,[account,kind]);
        transaction.oncomplete=resolve;transaction.onerror=reject;
      });
      db.close();
    },account);
    await enter();
    await input.waitFor();
    await page.locator("[data-parlor-wallpaper]").waitFor();
    const layout=()=>input.evaluate(el=>{
      const composer=el.closest("form").getBoundingClientRect();
      const chat=el.closest("[data-parlor-chat]").getBoundingClientRect();
      const wallpaper=document.querySelector("[data-parlor-wallpaper]").getBoundingClientRect();
      return {input:el.getBoundingClientRect().height,bottom:composer.bottom,chatBottom:chat.bottom,chatTop:chat.top,wallpaperHeight:wallpaper.height};
    });
    const keyboard=async (visibleHeight,offsetTop=0,event="resize")=>{
      await page.evaluate(({visibleHeight,offsetTop,event})=>{
        Object.defineProperties(visualViewport,{height:{configurable:true,value:visibleHeight},offsetTop:{configurable:true,value:offsetTop}});
        if(event==="resize"||event==="scroll")visualViewport.dispatchEvent(new Event(event));
        else window.dispatchEvent(new Event(event));
      },{visibleHeight,offsetTop,event});
      await page.waitForFunction(({visibleHeight,offsetTop})=>{
        const rect=document.querySelector("[data-parlor-chat]").getBoundingClientRect();
        return Math.abs(rect.height-visibleHeight)<2&&Math.abs(rect.top-offsetTop)<2;
      },{visibleHeight,offsetTop});
    };
    if(mobile){
      const closed=await layout();
      await input.click();
      await keyboard(height-310);
      assert.equal(await chat.getAttribute("data-keyboard-open"),"true");
      const opened=await layout();
      assert.equal(opened.chatBottom-opened.bottom,4);
      assert.equal(opened.wallpaperHeight,closed.wallpaperHeight);
      await input.pressSequentially("hello");
      assert.deepEqual(await layout(),opened);
      await input.press("Backspace");
      assert.deepEqual(await layout(),opened);
      await input.fill("第一行\n第二行\n第三行");
      assert((await layout()).input>opened.input);
      await input.fill("");
      assert.deepEqual(await layout(),opened);
      await keyboard(height-310,64,"scroll");
      assert.equal((await layout()).wallpaperHeight,closed.wallpaperHeight);
      await input.blur();
      await keyboard(height,0,"evaorbit:native-active");
      assert.equal(await chat.getAttribute("data-keyboard-open"),"false");
      assert.deepEqual(await layout(),closed);
      await page.getByRole("button",{name:"返回上一页",exact:true}).click();
      await enter();
      await input.click();
      await keyboard(height-310);
      const reopened=await layout();
      await input.pressSequentially("again");
      assert.deepEqual(await layout(),reopened);
      await input.blur();
      await keyboard(height,0,"pageshow");
    }

    await input.fill("请帮我整理今天的安排。先梳理紧急的任务，再给每一项留下充足的时间。\n我还想安排家务和学习，这样晚些时候就能轻松一点。");
    await send.click();
    const card=agent.locator("[data-parlor-failure-card]");
    const more=card.getByRole("button",{name:"更多消息操作"});
    const remove=card.getByRole("button",{name:"删除消息"});
    await card.getByText("回复未完成",{exact:true}).waitFor();
    await card.getByText("模型服务暂时不可用，请稍后重试。",{exact:true}).waitFor();
    const bounds=await card.boundingBox();
    assert(bounds.height<=124&&bounds.width>=235&&bounds.width<=300);
    const avatar=await card.locator("[data-parlor-bubble-avatar]").boundingBox();
    assert(avatar.x+avatar.width<bounds.x&&Math.abs(avatar.y-bounds.y-8)<=1);
    assert.equal(await agent.getByText("Parlor 操作未完成。").count(),0);
    assert.equal(await page.getByText("Synthetic Provider HTTP 503").count(),0);
    assert.equal(await remove.count(),0);
    await page.screenshot({path:path.join(output,label+"-retry.png"),animations:"disabled"});
    await card.getByRole("button",{name:"查看错误详情",exact:true}).click();
    const details=page.getByRole("dialog",{name:"错误详情"});
    await details.getByText("Synthetic Provider HTTP 503",{exact:true}).waitFor();
    await page.waitForFunction(()=>Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().bottom-innerHeight)<=1);
    await page.screenshot({path:path.join(output,label+"-failure-details.png"),animations:"disabled"});
    await details.getByRole("button",{name:"关闭",exact:true}).click();
    await details.waitFor({state:"detached"});
    await more.click();
    await remove.waitFor();
    await page.screenshot({path:path.join(output,label+"-failure-menu.png"),animations:"disabled"});
    await remove.press("Escape");
    await remove.waitFor({state:"detached"});
    assert.equal(await more.getAttribute("aria-expanded"),"false");
    assert(await more.evaluate(element=>element===document.activeElement));
    await more.click();
    page.once("dialog",dialog=>dialog.dismiss());
    await remove.click();
    await card.waitFor();
    const id=await agent.getAttribute("data-message-id");
    const originalUser=await user.getAttribute("data-message-id");
    await agent.getByRole("button",{name:"重试",exact:true}).dblclick();
    await page.locator('[data-role=assistant][data-status=streaming]').waitFor();
    assert.equal(await user.count(),1);
    await agent.locator("[data-parlor-bubble-avatar]").first().waitFor();
    const aligned=locator=>locator.evaluateAll(avatars=>avatars.every(avatar=>{
      const bubble=avatar.parentElement.querySelector("[data-chat-bubble]");
      return Math.abs(avatar.getBoundingClientRect().top-bubble.getBoundingClientRect().top-8)<=1;
    }));
    assert(await aligned(page.locator("[data-parlor-bubble-avatar]")));
    await page.locator('[data-role=assistant][data-status=failed]').waitFor();
    assert.equal(await agent.getAttribute("data-message-id"),id);
    assert.equal(await user.getAttribute("data-message-id"),originalUser);
    assert.equal(await card.locator("[data-parlor-bubble-avatar]").count(),0,"partial reply retains its original bubble avatars");
    assert.equal(await page.getByRole("button",{name:"重新读取已保存状态"}).count(),0);
    await agent.getByRole("button",{name:"重试",exact:true}).click();
    await page.locator('[data-role=assistant][data-status=done]').waitFor();
    assert.equal(await user.count(),1);
    assert.equal(await agent.count(),1);
    assert.equal(await agent.getAttribute("data-message-id"),id);
    const leading=await page.locator("[data-chat-bubble] p").evaluateAll(nodes=>nodes.map(node=>{
      const style=getComputedStyle(node);
      return parseFloat(style.lineHeight)/parseFloat(style.fontSize);
    }));
    assert(leading.length>=3&&leading.every(value=>Math.abs(value-1.425)<.015));
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(output,label+"-recovered.png"),animations:"disabled"});
    if(mobile){
      const pane=page.locator("[data-role=user]").locator("../..");
      const distance=()=>pane.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight);
      await input.click();
      await keyboard(325);
      await page.waitForFunction(el=>el.scrollHeight-el.scrollTop-el.clientHeight<2,await pane.elementHandle());
      await pane.evaluate(el=>{el.scrollTop=0;});
      await page.getByRole("button",{name:"回到底部",exact:true}).waitFor();
      assert(await distance()>48);
      await keyboard(355,30,"scroll");
      assert.equal(await pane.evaluate(el=>el.scrollTop),0);
      await page.getByRole("button",{name:"回到底部",exact:true}).click();
      assert(await distance()<2);
      await input.blur();
      await keyboard(height,0,"evaorbit:native-active");
    }

    for(const placement of ["first","last","all"]){
      await page.getByRole("button",{name:"Parlor 设置",exact:true}).click();
      await page.getByRole("button",{name:"聊天外观",exact:false}).click();
      await page.getByRole("combobox",{name:"单聊头像位置",exact:true}).selectOption(placement);
      await page.getByRole("button",{name:"返回 Parlor 设置",exact:true}).click();
      await page.getByRole("button",{name:"返回上一页",exact:true}).click();
      await user.locator("[data-parlor-bubble-avatar]").waitFor();
      await agent.locator("[data-parlor-bubble-avatar]").first().waitFor();
      const rows=await agent.locator("[data-parlor-bubble-row]").evaluateAll(rows=>rows.map(row=>Boolean(row.querySelector("[data-parlor-bubble-avatar]"))));
      assert(rows.length>=3);
      assert.deepEqual(rows,rows.map((_,index)=>placement==="all"||index===(placement==="first"?0:rows.length-1)));
      assert(await aligned(page.locator("[data-parlor-bubble-avatar]")));
    }
    assert(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth));
    page.once("dialog",dialog=>dialog.dismiss());
    await user.getByRole("button",{name:"删除消息"}).click();
    assert.equal(await user.count(),1);
    page.once("dialog",dialog=>dialog.accept());
    await user.getByRole("button",{name:"删除消息"}).click();
    await user.waitFor({state:"detached"});
    assert.equal(await agent.getAttribute("data-message-id"),id);
    assert.equal(await page.getByRole("button",{name:"重新读取已保存状态"}).count(),0);
    await page.reload();
    await enter();
    await agent.waitFor();
    assert.equal(await user.count(),0);
    page.once("dialog",dialog=>dialog.accept());
    await agent.getByRole("button",{name:"删除消息"}).click();
    await agent.waitFor({state:"detached"});
    await page.reload();
    await enter();
    await page.getByText("今天，有什么需要打点？").waitFor();
    assert.equal(await agent.count(),0);
    await input.fill("请帮我规划接下来的工作。");
    await send.click();
    await more.click();
    page.once("dialog",dialog=>dialog.accept());
    await remove.click();
    await card.waitFor({state:"detached"});
    assert.equal(await user.count(),1);
    await page.reload();
    await enter();
    await user.waitFor();
    assert.equal(await agent.count(),0);
    preview.searchParams.set("singleReplyFailure","[SIWC:inference.headers] HTTP 404 · JSON · model_not_found");
    await page.goto(preview.href);
    await enter();
    await input.fill("请继续之前的计划。");
    await send.click();
    await card.getByText("当前模型不可用，请检查模型设置。",{exact:true}).waitFor();
    assert.equal(await card.getByRole("button",{name:"重试",exact:true}).count(),0);
    await page.screenshot({path:path.join(output,label+"-failure-settings.png"),animations:"disabled"});
    await card.getByRole("button",{name:"检查设置",exact:true}).click();
    await page.getByRole("heading",{name:"Providers & Models",exact:true}).waitFor();
    await page.getByRole("button",{name:"返回 Parlor 设置",exact:true}).click();
    await page.getByRole("button",{name:"返回上一页",exact:true}).click();
    await more.click();
    await card.getByRole("button",{name:"重试",exact:true}).click();
    await page.locator('[data-role=assistant][data-status=streaming]').waitFor();
    assert.deepEqual(pageErrors,[]);
    console.log(JSON.stringify({label,compactFailureCard:true,bottomErrorSheet:true,failureMenu:true,settingsAction:true,syntheticKeyboard:mobile,retryFailureAndRecovery:true,duplicateClick:true,deletionAndReload:true,avatarModes:true,streamingAlignment:true}));
    await context.close();
  }
} finally {
  await browser.close();
}
