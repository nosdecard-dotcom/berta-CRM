import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req:NextRequest) {
 const db=await createSupabaseServerClient();
 const {data:claims,error}=await db.auth.getClaims();
 if(error||!claims) return NextResponse.json({error:"Sesión no válida"},{status:401});
 const role=(claims.claims.app_metadata as {role?:string}|undefined)?.role;
 if(!["admin","manager"].includes(role??"")) return NextResponse.json({error:"No autorizado"},{status:403});
 const origin=new URL(req.url).origin;
 const referer=req.headers.get("origin");
 if(referer!==origin) return NextResponse.json({error:"Origen no permitido"},{status:403});
 let form:FormData;
 try { form=await req.formData(); } catch { return NextResponse.json({error:"Formulario inválido"},{status:400}); }
 const field=(name:string,max:number)=>String(form.get(name)??"").trim().slice(0,max);
 const name=field("name",160),line=field("line",100),presentation=field("presentation",80);
 const rawPrice=field("price_bob",30);
 const price=rawPrice===""?null:Number(rawPrice);
 const stock=field("stock_status",30);
 if(!name||!line||!["available","unavailable","unconfirmed"].includes(stock)|| (price!==null&&(!Number.isFinite(price)||price<0||price>10000000))) return NextResponse.json({error:"Datos inválidos"},{status:400});
 const {error:insertError}=await createServerSupabaseClient().from("catalog_products").insert({
 name,line,presentation:presentation||null,price_bob:price,stock_status:stock,is_active:form.get("is_active")==="yes"
 });
 if(insertError) {console.error("[catalog] insert-failed",{code:insertError.code});return NextResponse.json({error:"No se pudo guardar el producto"},{status:500});}
 return NextResponse.redirect(new URL("/catalog",req.url),303);
}
