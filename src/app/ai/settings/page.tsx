import type {Metadata} from "next";
import {ParlorSettings} from "@/components/parlor-settings";
import {PageBackButton} from "@/components/page-back-button";
export const metadata:Metadata={title:"Parlor · Settings"};
export default function ParlorSettingsPage(){return <ParlorSettings back={<PageBackButton/>}/>;}
