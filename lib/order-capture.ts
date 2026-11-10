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
 const tokens=(s:string)=>normalized(s).split(" ").filter(Boolean);
 const aliases:Record<string,string>={shp:"shampoo",champu:"shampoo",champú:"shampoo",cnd:"acondicionador",conditioner:"acondicionador",mascarilla:"mask",mascara:"mask",litro:"1000ml",litros:"1000ml"};
 const canonical=(s:string)=>tokens(s).map(t=>aliases[t]||t);
 const incoming=canonical(text).join(" ").replace(/\b(\d+)\s+(ml|g|gr)\b/g,"$1$2").split(" ");
 const hasToken=(token:string)=>incoming.includes(token);
 const exactSku=(sku:string)=>sku.length>=4&&new RegExp("(^|[^0-9a-z])"+sku+"(?=$|[^0-9a-z])","i").test(text);
 const scored=(products||[]).map(p=>{
  const sku=p.sku?.trim()||"";
  const productTokens=canonical(p.name);
  const descriptive=productTokens.filter(t=>!["wp","pro","belmed","sp"].includes(t));
  const matches=descriptive.filter(hasToken);
  const size=descriptive.filter(t=>/^(?:\d+)(?:ml|g|gr)$/.test(t));
  const type=descriptive.filter(t=>["shampoo","acondicionador","mask","serum","oil","crema"].includes(t));
  const exact=exactSku(sku);
  const score=exact?1000:matches.length;
  const valid=exact||(matches.length>=2&&matches.some(t=>!size.includes(t))&&type.every(hasToken)&&size.every(hasToken));
  return {product:p,score,valid};
 }).filter(x=>x.valid).sort((a,b)=>b.score-a.score);
 if(!scored.length||scored.length>1&&scored[0].score===scored[1].score)return {created:false,reason:"ambiguous-product"};
 const product=scored[0].product;
 const numberWords:Record<string,number>={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
 const qtyPatterns=[/\b(?:quiero|necesito|llevo|pedir|comprar|encargar|reservar)\s+(\d{1,3}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/i,/\b(\d{1,3}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:unidades?|uds?|piezas?|frascos?|botellas?|shampoos?|acondicionadores?)\b/i];
 let quantity:number|null=null;
 for(const pattern of qtyPatterns){const match=normalized(text).match(pattern);if(match){quantity=numberWords[match[1]]||Number(match[1]);break;}}
 if(!quantity||quantity<1||quantity>100)return {created:false,reason:"missing-quantity"};
 const {data:existing,error:existingError}=await db.from("sales_orders").select("id").eq("source_message_id",args.messageId).maybeSingle();
 if(existingError)throw existingError;
 if(existing)return {created:false,reason:"already-recorded"};
 const {data:order,error:orderError}=await db.from("sales_orders").insert({
   conversation_id:args.conversationId,customer_id:args.customerId,
   source_message_id:args.messageId,status:"new",
   notes:"Solicitud detectada automáticamente en WhatsApp. Requiere validación humana de producto, cantidad, precio y entrega."
 }).select("id").single();
 if(orderError){if(orderError.code==="23505")return {created:false,reason:"already-recorded"};throw orderError;}
 if(!order)throw new Error("No se pudo verificar la creación de la solicitud.");
 const {error:itemError}=await db.from("sales_order_items").insert({
   order_id:order.id,product_id:product.id,product_name:product.name,
   quantity,retail_unit_price_bob:product.price_bob
 });
 if(itemError){await db.from("sales_orders").delete().eq("id",order.id);throw itemError;}
 return {created:true,orderId:order.id};
}
