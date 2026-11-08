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
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).filter(s=>!mapUrl(s));
 const labeledName=text.match(/(?:mi nombre(?: completo)? es|me llamo|a nombre de|nombre(?: completo)?\s*:)\s*[:\-]?\s*([^\n,.;]{5,90})/i);
 const nameCandidate=labeledName?.[1]?.trim() || (lines.length>=2&&/^[\p{L}]+(?:[ '-][\p{L}]+){1,5}$/u.test(lines[0])&&!/^(?:hola|quiero|necesito|direccion|calle|avenida|av|ciudad|barrio|zona)\b/i.test(lines[0])?lines[0]:null);
 if(nameCandidate&&!order.recipient_full_name)changes.recipient_full_name=nameCandidate;
 const labeledCity=text.match(/(?:ciudad|localidad)\s*[:\-]?\s*([^\n,.;]{3,80})/i);
 const addressLine=lines.find(s=>/\b(?:calle|avenida|av\.?|pasaje|edificio|urbanizaci[oó]n|barrio|zona|n[úu]mero|nro\.?|domicilio)\b/i.test(s));
 const addressMatch=text.match(/(?:mi direcci[oó]n es|direcci[oó]n de entrega|domicilio)\s*[:\-]?\s*([^\n]{6,180})/i);
 const addressCandidate=addressMatch?.[1]?.trim()||addressLine||null;
 if(addressCandidate&&!order.delivery_address)changes.delivery_address=addressCandidate.slice(0,300);
 const cityCandidate=labeledCity?.[1]?.trim()||addressCandidate?.split(",")[0]?.trim();
 if(cityCandidate&&!order.delivery_city&&cityCandidate.length<=80&&(!addressCandidate||cityCandidate!==addressCandidate))changes.delivery_city=cityCandidate;
 if(Object.keys(changes).length){const {error:updateError}=await db.from("sales_orders").update({...changes,updated_at:new Date().toISOString()}).eq("id",order.id);if(updateError)throw updateError;}
 return {id:order.id,hasName:Boolean(changes.recipient_full_name||order.recipient_full_name),hasMaps:Boolean(changes.google_maps_url||order.google_maps_url),hasCity:Boolean(changes.delivery_city||order.delivery_city),hasAddress:Boolean(changes.delivery_address||order.delivery_address)};
}
export function orderAcknowledgement(details:{hasName:boolean;hasMaps:boolean;hasCity:boolean;hasAddress:boolean}){
 const missing=[!details.hasName?"nombre completo de quien recibirá":null,!details.hasCity?"ciudad o localidad":null,!details.hasAddress?"dirección de entrega y referencia":null,!details.hasMaps?"enlace de ubicación de Google Maps":null].filter(Boolean);
 return "¡Muchas gracias por tu pedido! 😊 Ya registramos tu solicitud en MARZOE y nuestro equipo verificará los detalles antes de confirmarla."+(missing.length?" Para coordinar el envío, por favor compartinos: "+missing.join(", ")+". Podés abrir Google Maps, marcar el lugar de entrega y usar «Compartir» → «Copiar enlace».":" Ya tenemos tus datos de entrega; te confirmaremos disponibilidad y plazo.");
}
