"use client";
import Link from "next/link";
import {PersonalWidgetStackWeb} from "@/components/personal-widget-stack-web";
import { CalendarRuleSheet } from "@/components/calendar-rule-sheet";
import { BottomLogScope } from "@/components/bottom-log";
import { HomeCalendarTimeline as SharedHome, type HomeTimelineProps } from "@/components/home-calendar-timeline";
export function HomeCalendarTimeline(props:Pick<HomeTimelineProps,"dueItems"|"initialDay"|"initialSummary"|"language"|"cacheScope">){return <SharedHome {...props} widgetStack={<PersonalWidgetStackWeb cacheScope={props.cacheScope} LinkComponent={Link}/>} LinkComponent={Link} RuleEditor={CalendarRuleSheet} LogScope={BottomLogScope}/>;}
