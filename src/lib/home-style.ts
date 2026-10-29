"use client";
import { useLocale } from "@/components/locale-controller";
export type HomeStyle = import("./theme").DesignTheme;
/** Home layout follows the same theme as the rest of the application. */
export function useHomeStyle(): HomeStyle { return useLocale().designTheme; }
