"use client";
import Link from "next/link";
import { CalendarRuleSheet } from "@/components/calendar-rule-sheet";
import { BottomLogScope } from "@/components/bottom-log";
import { HomeCalendarTimeline as SharedHome, type HomeTimelineProps } from "@/components/home-calendar-timeline";
export function HomeCalendarTimeline(props:Pick<HomeTimelineProps,"initialDay"|"initialSummary"|"language"|"cacheScope">){return <SharedHome {...props} LinkComponent={Link} RuleEditor={CalendarRuleSheet} LogScope={BottomLogScope}/>;}
