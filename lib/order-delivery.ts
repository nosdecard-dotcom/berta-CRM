import type { SupabaseClient } from "@supabase/supabase-js";

const mapsPattern=/https?:\/\/(?:www\.)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\/[^\s<>]+/i;
function mapUrl(text:string){
 const match=text.match(mapsPattern);if(!match)return null;
 try {const url=new URL(match[0].replace(/[.,;!?]+$/,""));return url.protocol==="https:"?url.toString():null;}catch{return null;}
}
export async function updatePendingOrderDelivery(db:SupabaseClient,args:{conversationId:string;body:string;messageType:string;location?:{latitude?:number;longitude?:number}}){
 const {data:orders,error}=await db.from("sales_orders").select("id,recipient_full_name,google_maps_url,delivery_address,delivery_city").eq("conversation_id",args.conversationId).in("status",["new","verifying"]).order("created_at",{ascending:false}).limit(1);
 if(error)throw error;
 const order=orders?.[0];if(!order)return null;
 const text=args.body.trim();
 const changes:Record<string,string>={};
 const url=mapUrl(text);
 if(url&&!order.google_maps_url)changes.google_maps_url=url;
 if(args.messageType==="location"&&args.location&&Number.isFinite(args.location.latitude)&&Number.isFinite(args.location.longitude)&&!order.google_maps_url){
  const lat=args.location.latitude!,lng=args.location.longitude!;
  if(Math.abs(lat)<=90&&Math.abs(lng)<=180)changes.google_maps_url=`https://www.google.com/maps?q=${lat},${lng}`;
 }
 const nameMatch=text.match(/(?:mi nombre(?: completo)? es|me llamo|a nombre de)\s*[:\-]?\s*([^\n,.;]{5,90})/i);
 if(nameMatch&&!order.recipient_full_name)changes.recipient_full_name=nameMatch[1].trim();
 const cityMatch=text.match(/(?:ciudad|localidad)\s*[:\-]?\s*([^\n,.;]{3,80})/i);
 if(cityMatch&&!order.delivery_city)changes.delivery_city=cityMatch[1].trim();
 const addressMatch=text.match(/(?:mi direcci[oó]n es|direcci[oó]n de entrega|domicilio)\s*[:\-]?\s*([^\n]{6,180})/i);
 if(addressMatch&&!order.delivery_address)changes.delivery_address=addressMatch[1].trim();
 if(Object.keys(changes).length){const {error:updateError}=await db.from("sales_orders").update({...changes,updated_at:new Date().toISOString()}).eq("id",order.id);if(updateError)throw updateError;}
 return {id:order.id,hasName:Boolean(changes.recipient_full_name||order.recipient_full_name),hasMaps:Boolean(changes.google_maps_url||order.google_maps_url),hasCity:Boolean(changes.delivery_city||order.delivery_city),hasAddress:Boolean(changes.delivery_address||order.delivery_address)};
}
export function orderAcknowledgement(details:{hasName:boolean;hasMaps:boolean;hasCity:boolean;hasAddress:boolean}){
 const missing=[!details.hasName?"nombre completo de quien recibirá":null,!details.hasCity?"ciudad o localidad":null,!details.hasAddress?"dirección de entrega y referencia":null,!details.hasMaps?"enlace de ubicación de Google Maps":null].filter(Boolean);
 return "¡Muchas gracias por tu pedido! 😊 Ya registramos tu solicitud en MARZOE y nuestro equipo verificará los detalles antes de confirmarla."+(missing.length?" Para coordinar el envío, por favor compartinos: "+missing.join(", ")+". Podés abrir Google Maps, marcar el lugar de entrega y usar «Compartir» → «Copiar enlace».":" Ya tenemos tus datos de entrega; te confirmaremos disponibilidad y plazo.");
}
