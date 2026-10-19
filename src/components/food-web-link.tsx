"use client";
import Link from "next/link";
import {FoodLink,type FoodLinkProps} from "./food-data-context";
export function FoodWebLink(props:FoodLinkProps){return <FoodLink {...props} fallback={Link}/>;}
