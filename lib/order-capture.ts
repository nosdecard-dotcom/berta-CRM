import type { SupabaseClient } from "@supabase/supabase-js";

/** Conservative capture: never infer a purchase from a price enquiry. */
export async function captureOrderRequest(db:SupabaseClient, args:{
 conversationId:string;customerId:string;messageId:string;body:string
}) {
 const text=args.body.trim();
 if(!/\b(quiero|quisiera|necesito|pedido|pedir|comprar|comprame|comprarme|llevo|encargar|reservar|confirmo)\b/i.test(text))return {created:false,reason:"no-intent"};
 const {data:products,error:catalogError}=await db.from("catalog_products").select("id,sku,name,price_bob").order("name").limit(1000);
 if(catalogError)throw catalogError;
 const normalized=(s:string)=>s.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
 const normalizedText=" "+normalized(text)+" ";
 const matches=(products||[]).filter(p=>{
   const sku=p.sku?.trim()||"";
   const exactSku=sku.length>=4&&new RegExp("(^|[^0-9a-z])"+sku.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?=$|[^0-9a-z])","i").test(text);
   const name=normalized(p.name);
   return exactSku||(name.length>=12&&normalizedText.includes(" "+name+" "));
 });
 // Ambiguous requests require manual clarification; do not create the wrong order.
 if(matches.length!==1)return {created:false,reason:"ambiguous-product"};
 const product=matches[0];
 const qtyPatterns=[/\b(?:quiero|necesito|llevo|pedir|comprar|encargar|reservar)\s+(\d{1,3})\b/i,/\b(\d{1,3})\s*(?:unidades?|uds?|piezas?|frascos?|botellas?)\b/i];
 let quantity:number|null=null;
 for(const pattern of qtyPatterns){const match=text.match(pattern);if(match){quantity=Number(match[1]);break;}}
 if(!quantity||quantity<1||quantity>100)return {created:false,reason:"missing-quantity"};
 const {data:order,error:orderError}=await db.from("sales_orders").upsert({
   conversation_id:args.conversationId,customer_id:args.customerId,
   source_message_id:args.messageId,status:"new",
   notes:"Solicitud detectada automáticamente en WhatsApp. Requiere validación humana de producto, cantidad, precio y entrega."
 },{onConflict:"source_message_id",ignoreDuplicates:true}).select("id").maybeSingle();
 if(orderError)throw orderError;
 if(!order)return {created:false,reason:"already-recorded"};
 const {error:itemError}=await db.from("sales_order_items").insert({
   order_id:order.id,product_id:product.id,product_name:product.name,
   quantity,retail_unit_price_bob:product.price_bob
 });
 if(itemError){await db.from("sales_orders").delete().eq("id",order.id);throw itemError;}
 return {created:true,orderId:order.id};
}
