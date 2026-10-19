import type {DrinkTemperature,TasteRating} from "./types";
export const temperatureLabels: Record<DrinkTemperature,string> = { normal_ice:"正常冰",less_ice:"少冰",no_ice:"去冰",room_temperature:"常温",hot:"热" };
export const tasteLabels: Record<TasteRating,string> = { love:"好喝",good:"还行",neutral:"一般",dislike:"难喝" };
