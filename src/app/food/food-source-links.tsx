import Link from "next/link";
import { placeRecordLabel } from "@/lib/place-menu";
import type { FoodLog } from "@/lib/types";

export function FoodSourceLinks({record,className="food-log-place user-content"}:{record:Pick<FoodLog,"foodPlaces"|"foodPlaceId"|"foodPlaceName"|"foodPlaceBranch"|"foodPlaceCity">;className?:string}){
  const places=record.foodPlaces?.length?record.foodPlaces:record.foodPlaceId&&record.foodPlaceName?[{id:record.foodPlaceId,name:record.foodPlaceName,branch:record.foodPlaceBranch??"",city:record.foodPlaceCity??""}]:[];
  if(!places.length)return null;
  return <p className={className}>{places.map((place,index)=><span key={place.id}>{index>0&&" · "}<Link href={`/food/places/${place.id}`}>{placeRecordLabel({foodPlaceName:place.name,foodPlaceBranch:place.branch,foodPlaceCity:place.city})}</Link></span>)}</p>;
}
