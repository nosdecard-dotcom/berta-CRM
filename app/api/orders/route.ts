import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
 let payload:{orderId?:unknown;status?:unknown};
 try{payload=await req.json();}catch{return NextResponse.json({error:"Datos inválidos"},{status:400});}
 const orderId=typeof payload.orderId==="string"?payload.orderId:"";
 const status=typeof payload.status==="string"?payload.status:"";
 if(!/^[0-9a-f-]{36}$/i.test(orderId)||!allowedStatuses.includes(status))return NextResponse.json({error:"Estado inválido"},{status:400});
 const {data:order}=await auth.db.from("sales_orders").select("id,conversation:conversations!sales_orders_conversation_id_fkey(assigned_to)").eq("id",orderId).maybeSingle();
 if(!order)return NextResponse.json({error:"Solicitud no encontrada"},{status:404});
 const conversation=order.conversation as unknown as {assigned_to:string|null}|null;
 if(auth.role==="agent"&&conversation?.assigned_to!==auth.userId)return NextResponse.json({error:"Sin acceso"},{status:403});
 const {error}=await auth.db.from("sales_orders").update({status,updated_at:new Date().toISOString()}).eq("id",orderId);
 if(error)return NextResponse.json({error:"No se pudo actualizar"},{status:500});
 return NextResponse.json({ok:true});
}