"use client";
import {AccountSettings} from "@/components/account-settings";
import {useLocale} from "@/components/locale-controller";
import {logout} from "@/app/login/actions";

export function WebAccountSettings({email}:{email:string}){
 const {english}=useLocale();
 return <AccountSettings email={email} actions={<form action={logout}><button className="button secondary" type="submit">{english?"Switch account / Sign out":"切换账户／退出登录"}</button></form>}/>;
}
