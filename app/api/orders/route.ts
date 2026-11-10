import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { saveMessage } from "@/lib/messages";
import { validOrderQuantity,validPublicProduct,validOrderItems,blocksOrderTransition } from "@/lib/order-validation";

export const runtime = "nodejs";
const pendingConfirmation = "Resultado del envío pendiente de verificar.";
const finalizedOrConfirmed = ["confirmed", "preparing", "shipped", "delivered", "cancelled"];
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
 if(!/^[0-9a-f-]{36}$/i.test(conversationId)||!/^[0-9a-f-]{36}$/i.test(productId)||!validOrderQuantity(payload.quantity))return NextResponse.json({error:"Producto, conversación o cantidad inválidos"},{status:400});
 const {data:conversation}=await auth.db.from("conversations").select("id,customer_id,assigned_to,status").eq("id",conversationId).maybeSingle();
 if(!conversation||conversation.status==="closed"||(auth.role==="agent"&&conversation.assigned_to!==auth.userId))return NextResponse.json({error:"Conversación sin acceso"},{status:403});
 const {data:product}=await auth.db.from("catalog_products").select("id,name,price_bob,is_active").eq("id",productId).maybeSingle();
 if(!product)return NextResponse.json({error:"Producto no encontrado"},{status:404});
 if(!validPublicProduct(product))return NextResponse.json({error:"El producto está inactivo o no tiene precio público válido. No se puede crear el pedido."},{status:422});
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
 const {data:order}=await auth.db.from("sales_orders").select("id,status,confirmation_sent_at,confirmation_send_error,conversation_id,customer_id,conversation:conversations!sales_orders_conversation_id_fkey(assigned_to),items:sales_order_items(product_name,quantity,retail_unit_price_bob)").eq("id",orderId).maybeSingle();
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
 const confirming = status === "confirmed";
 const confirmationAttempted = Boolean(order.confirmation_sent_at || order.confirmation_send_error);
 const mayHaveConfirmed = confirmationAttempted || finalizedOrConfirmed.includes(order.status);
 if (confirming && mayHaveConfirmed) {
   return NextResponse.json({error:"El pedido ya fue confirmado, finalizado o tiene un intento de envío. Revisá el historial antes de reenviar."},{status:409});
 }
 if (blocksOrderTransition(order.status, status, mayHaveConfirmed) && status !== order.status) {
   return NextResponse.json({error:"El pedido no puede volver a un estado que permita otra confirmación."},{status:409});
 }
 const itemsToValidate=(order.items||[]) as {product_name:string;quantity:number;retail_unit_price_bob:number|null}[];
 if(status==="confirmed"&&!validOrderItems(itemsToValidate))return NextResponse.json({error:"No se puede confirmar: el pedido tiene productos, cantidades o precios incompletos. Revisá el catálogo antes de continuar."},{status:422});
 let phone: string | undefined;
 if (confirming) {
   const {data:customer,error:customerError} = await auth.db.from("customers").select("phone").eq("id",order.customer_id).maybeSingle();
   if (customerError) return NextResponse.json({error:"No se pudo consultar el teléfono del cliente."},{status:500});
   if (!customer?.phone) return NextResponse.json({error:"Falta el teléfono del cliente para confirmar el pedido."},{status:422});
   phone = customer.phone;
 }

 // The same write saves the order and reserves its only automatic send.
 let update = auth.db.from("sales_orders").update({
   status, payment_method: paymentMethod || null, recipient_full_name: name || null,
   delivery_city: city || null, delivery_address: address || null, google_maps_url: maps || null,
   updated_at: new Date().toISOString(),
   ...(confirming ? {confirmation_send_error: pendingConfirmation} : {}),
 }).eq("id", orderId).eq("status", order.status);
 if (confirming) {
   update = update.is("confirmation_sent_at", null).is("confirmation_send_error", null);
 }
 const {data:updated,error} = await update.select("id").maybeSingle();
 if (error) return NextResponse.json({error:"No se pudo actualizar el pedido."},{status:500});
 if (!updated) return NextResponse.json({error:"El pedido cambió mientras lo editabas. Actualizá la página antes de guardar de nuevo."},{status:409});
 if (!phone) return NextResponse.json({ok:true});

 const total = itemsToValidate.reduce((sum,item) => sum + (item.retail_unit_price_bob ?? 0) * item.quantity, 0);
 const summary = itemsToValidate.map(item => item.quantity + " × " + item.product_name).join("; ");
 const method = paymentMethod === "transfer_qr" ? "transferencia o QR" : "pago contra entrega";
 const message = "¡Hola! 😊 Te confirmamos que tu pedido de MARZOE fue revisado y aprobado por nuestro equipo.\nProductos: " + summary + "\nTotal de productos: Bs " + total.toFixed(2) + " (el costo de envío se coordina por separado).\nEntrega: " + city + ", " + address + ".\nModalidad de pago acordada: " + method + ".\nNuestro equipo coordinará contigo el pago y el plazo de entrega. ¡Gracias por confiar en MARZOE!";

 let whatsappMessageId: string;
 try {
   const sent = await sendWhatsAppMessage(phone, message);
   whatsappMessageId = sent.messages[0].id;
 } catch {
   console.error("[order-confirmation] acceptance-unverified");
   return NextResponse.json({
     ok:false, orderUpdated:true,
     error:"El pedido quedó confirmado en el CRM. No se pudo verificar que WhatsApp aceptara el mensaje. Revisá WhatsApp antes de intentar un reenvío manual.",
   },{status:502});
 }

 let confirmationRecorded = false;
 try {
   const {data:marked,error:markError} = await auth.db.from("sales_orders")
     .update({confirmation_sent_at:new Date().toISOString(),confirmation_send_error:null})
     .eq("id",orderId).is("confirmation_sent_at",null).select("id").maybeSingle();
   confirmationRecorded = !markError && Boolean(marked);
 } catch {
   // Still save the message ID in the conversation for reconciliation.
 }

 let historyRecorded = false;
 try {
   const saved = await saveMessage(auth.db,{
     conversationId:order.conversation_id, direction:"outbound", body:message,
     whatsappMessageId, deliveryStatus:"sent", aiGenerated:false,
   });
   historyRecorded = saved.inserted;
 } catch {
   // An accepted message must never be sent again to repair its history.
 }

 if (!confirmationRecorded || !historyRecorded) {
   console.error("[order-confirmation] persistence-incomplete", {confirmationRecorded,historyRecorded});
   const missing = !confirmationRecorded && !historyRecorded ? "el registro de confirmación ni el historial"
     : !confirmationRecorded ? "el registro de confirmación" : "el historial de conversación";
   return NextResponse.json({
     ok:false, orderUpdated:true,
     error:"WhatsApp aceptó el mensaje, pero el CRM no pudo guardar " + missing + ". Revisá WhatsApp antes de cualquier reenvío.",
   },{status:500});
 }
 return NextResponse.json({ok:true});
}
