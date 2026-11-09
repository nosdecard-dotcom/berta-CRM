import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { saveMessage } from "@/lib/messages";

export const runtime = "nodejs";
const allowedStatuses = ["new","verifying","confirmed","preparing","shipped","delivered","cancelled"];

async function authorize() {
 const session = await createSupabaseServerClient();
 const {data,error}=await session.auth.getClaims();
 if(error||!data) return null;
 const role=(data.claims.app_metadata as {role?:string}|undefined)?.role;
 const userId=typeof data.claims.sub==="string"?data.claims.sub:"";
 if(!userId||!["admin","manager","agent"].includes(role??"")) return null;
 const db=createServerSupabaseClient();
 const {data:profile}=await db.from("profiles").select("id,role,is_active").eq("id",userId).maybeSingle();
 if(!profile?.is_active||!["admin","manager","agent"].includes(profile.role))return null;
 return {db,userId,role:profile.role};
}
function sameOrigin(req:NextRequest) {
 const origin=req.headers.get("origin");
 const referer=req.headers.get("referer");
 const host=new URL(req.url).origin;
 return origin===host || (!origin && !!referer && new URL(referer).origin===host);
}
export async function POST(req:NextRequest) {
 const auth=await authorize();
 if(!auth)return NextResponse.json({error:"Sin autorización"},{status:403});
 if(!sameOrigin(req))return NextResponse.json({error:"Origen inválido"},{status:403});
 let payload:{conversationId?:unknown;productId?:unknown;quantity?:unknown;notes?:unknown};
 try{payload=await req.json();}catch{return NextResponse.json({error:"Datos inválidos"},{status:400});}
 const conversationId=typeof payload.conversationId==="string"?payload.conversationId:"";
 const productId=typeof payload.productId==="string"?payload.productId:"";
 const quantity=Number(payload.quantity);
 const notes=typeof payload.notes==="string"?payload.notes.trim().slice(0,1000):"";
 if(!/^[0-9a-f-]{36}$/i.test(conversationId)||!/^[0-9a-f-]{36}$/i.test(productId)||!Number.isInteger(quantity)||quantity<1||quantity>10000)return NextResponse.json({error:"Producto, conversación o cantidad inválidos"},{status:400});
 const {data:conversation}=await auth.db.from("conversations").select("id,customer_id,assigned_to,status").eq("id",conversationId).maybeSingle();
 if(!conversation||conversation.status==="closed"||(auth.role==="agent"&&conversation.assigned_to!==auth.userId))return NextResponse.json({error:"Conversación sin acceso"},{status:403});
 const {data:product}=await auth.db.from("catalog_products").select("id,name,price_bob").eq("id",productId).maybeSingle();
 if(!product)return NextResponse.json({error:"Producto no encontrado"},{status:404});
 const {data:order,error}=await auth.db.from("sales_orders").insert({conversation_id:conversationId,customer_id:conversation.customer_id,created_by:auth.userId,notes,status:"new"}).select("id").single();
 if(error||!order)return NextResponse.json({error:"No se pudo crear la solicitud"},{status:500});
 const {error:itemError}=await auth.db.from("sales_order_items").insert({order_id:order.id,product_id:product.id,product_name:product.name,quantity,retail_unit_price_bob:product.price_bob});
 if(itemError){await auth.db.from("sales_orders").delete().eq("id",order.id);return NextResponse.json({error:"No se pudo guardar el producto"},{status:500});}
 return NextResponse.json({ok:true,orderId:order.id});
}
export async function PATCH(req:NextRequest){
 const auth=await authorize();
 if(!auth)return NextResponse.json({error:"Sin autorización"},{status:403});
 if(!sameOrigin(req))return NextResponse.json({error:"Origen inválido"},{status:403});
 let payload:{orderId?:unknown;status?:unknown;paymentMethod?:unknown;recipientFullName?:unknown;deliveryCity?:unknown;deliveryAddress?:unknown;googleMapsUrl?:unknown};
 try{payload=await req.json();}catch{return NextResponse.json({error:"Datos inválidos"},{status:400});}
 const orderId=typeof payload.orderId==="string"?payload.orderId:"";
 const status=typeof payload.status==="string"?payload.status:"";
 if(!/^[0-9a-f-]{36}$/i.test(orderId)||!allowedStatuses.includes(status))return NextResponse.json({error:"Estado inválido"},{status:400});
 const {data:order}=await auth.db.from("sales_orders").select("id,status,confirmation_sent_at,conversation_id,customer_id,conversation:conversations!sales_orders_conversation_id_fkey(assigned_to),items:sales_order_items(product_name,quantity,retail_unit_price_bob)").eq("id",orderId).maybeSingle();
 if(!order)return NextResponse.json({error:"Solicitud no encontrada"},{status:404});
 const conversation=order.conversation as unknown as {assigned_to:string|null}|null;
 if(auth.role==="agent"&&conversation?.assigned_to!==auth.userId)return NextResponse.json({error:"Sin acceso"},{status:403});
 const name=typeof payload.recipientFullName==="string"?payload.recipientFullName.trim().slice(0,120):"";
 const city=typeof payload.deliveryCity==="string"?payload.deliveryCity.trim().slice(0,100):"";
 const address=typeof payload.deliveryAddress==="string"?payload.deliveryAddress.trim().slice(0,300):"";
 const maps=typeof payload.googleMapsUrl==="string"?payload.googleMapsUrl.trim().slice(0,1000):"";
 if(maps&&!/^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\//i.test(maps))return NextResponse.json({error:"El enlace de Google Maps no es válido"},{status:400});
 if(["confirmed","preparing","shipped","delivered"].includes(status)&&(!name||!city||!address||!maps))return NextResponse.json({error:"Completa nombre, ciudad, dirección y enlace de Google Maps antes de confirmar"},{status:422});
 const paymentMethod=typeof payload.paymentMethod==="string"?payload.paymentMethod:"";
 if(!["","transfer_qr","cash_on_delivery"].includes(paymentMethod))return NextResponse.json({error:"Modalidad de pago inválida"},{status:400});
 if(status==="confirmed"&&!paymentMethod)return NextResponse.json({error:"Selecciona y autoriza la modalidad de pago antes de confirmar"},{status:422});
 if(status==="confirmed"&&(order.status==="cancelled"||order.status==="delivered"))return NextResponse.json({error:"No se puede confirmar un pedido finalizado"},{status:409});
 if(status==="confirmed"&&order.status==="confirmed")return NextResponse.json({error:"El pedido ya fue confirmado. No se reenviará la notificación automáticamente; revisá el historial de WhatsApp antes de intentar otro envío."},{status:409});
 const {data:updated,error}=await auth.db.from("sales_orders").update({status,payment_method:paymentMethod||null,recipient_full_name:name||null,delivery_city:city||null,delivery_address:address||null,google_maps_url:maps||null,updated_at:new Date().toISOString()}).eq("id",orderId).eq("status",order.status).select("id").maybeSingle();
 if(error)return NextResponse.json({error:"No se pudo actualizar"},{status:500});
 if(!updated)return NextResponse.json({error:"El pedido cambió mientras lo editabas. Actualizá la página antes de guardar de nuevo."},{status:409});
 if(status==="confirmed"&&!order.confirmation_sent_at){
   const {data:customer}=await auth.db.from("customers").select("phone").eq("id",order.customer_id).single();
   const items=(order.items||[]) as {product_name:string;quantity:number;retail_unit_price_bob:number|null}[];
   const total=items.reduce((sum,item)=>sum+(item.retail_unit_price_bob??0)*item.quantity,0);
   const summary=items.map(item=>item.quantity+" × "+item.product_name).join("; ");
   const method=paymentMethod==="transfer_qr"?"transferencia o QR":"pago contra entrega";
   const message="¡Hola! 😊 Te confirmamos que tu pedido de MARZOE fue revisado y aprobado por nuestro equipo.\nProductos: "+summary+"\nTotal de productos: Bs "+total.toFixed(2)+" (el costo de envío se coordina por separado).\nEntrega: "+city+", "+address+".\nModalidad de pago acordada: "+method+".\nNuestro equipo coordinará contigo el pago y el plazo de entrega. ¡Gracias por confiar en MARZOE!";
   if(!customer?.phone)return NextResponse.json({ok:true,warning:"Pedido confirmado, pero falta el teléfono para notificar."});
   try{
     const sent=await sendWhatsAppMessage(customer.phone,message);
     await saveMessage(auth.db,{conversationId:order.conversation_id,direction:"outbound",body:message,whatsappMessageId:sent.messages?.[0]?.id??null,deliveryStatus:"sent",aiGenerated:false});
     await auth.db.from("sales_orders").update({confirmation_sent_at:new Date().toISOString(),confirmation_send_error:null}).eq("id",orderId).is("confirmation_sent_at",null);
   }catch(err){
     const reason=err instanceof Error?err.message.slice(0,180):"Error de envío";
     await auth.db.from("sales_orders").update({confirmation_send_error:reason}).eq("id",orderId);
     return NextResponse.json({ok:true,warning:"Pedido confirmado, pero el envío de WhatsApp falló. Revisá el historial y el error antes de solicitar un reenvío manual; no se enviará otra confirmación automáticamente."});
   }
 }
 return NextResponse.json({ok:true});
}