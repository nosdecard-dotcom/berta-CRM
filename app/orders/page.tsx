import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/ssr-server";
import {createServerSupabaseClient} from "@/lib/supabase/server";
import CrmSidebar from "@/app/components/crm-sidebar";
import LiveInboxRefresh from "@/app/conversations/live-inbox-refresh";
import NewOrder from "./new-order";import OrderActions from "./order-actions";
export const dynamic="force-dynamic";
export default async function OrdersPage(){
 const session=await createSupabaseServerClient();const {data:claims,error}=await session.auth.getClaims();
 if(error||!claims)redirect("/login");
 const role=(claims.claims.app_metadata as {role?:string}|undefined)?.role||"";
 const userId=String(claims.claims.sub||"");
 if(!["admin","manager","agent"].includes(role))redirect("/");
 const db=createServerSupabaseClient();
 const {data:profile}=await db.from("profiles").select("is_active,role").eq("id",userId).maybeSingle();
 if(!profile?.is_active||!["admin","manager","agent"].includes(profile.role))redirect("/");
 let convQuery=db.from("conversations").select("id,assigned_to,customer:customers!conversations_customer_id_fkey(full_name,phone)").neq("status","closed").order("last_message_at",{ascending:false}).limit(100);
 if(profile.role==="agent")convQuery=convQuery.eq("assigned_to",userId);
 const [{data:convs},{data:products},{data:orders}]=await Promise.all([convQuery,db.from("catalog_products").select("id,sku,name").order("name").limit(300),db.from("sales_orders").select("id,status,created_at,notes,recipient_full_name,delivery_city,delivery_address,google_maps_url,payment_method,confirmation_sent_at,conversation:conversations!sales_orders_conversation_id_fkey(assigned_to),customer:customers!sales_orders_customer_id_fkey(full_name,phone),items:sales_order_items(product_name,quantity,retail_unit_price_bob)").order("created_at",{ascending:false}).limit(100)]);
 const conversations=(convs||[]).map(c=>{const customer=c.customer as unknown as {full_name:string|null;phone:string}|null;return {id:c.id,label:customer?.full_name||customer?.phone||"Cliente"};});
 const visibleOrders=(orders||[]).filter(o=>profile.role!=="agent"||(o.conversation as unknown as {assigned_to:string|null}|null)?.assigned_to===userId);
 return <div className="workspace-layout"><CrmSidebar role={role}/><main className="workspace-main"><header className="workspace-topbar"><div><span className="topbar-breadcrumb">MARZOE / Ventas</span><strong>Pedidos</strong></div><span className="workspace-environment">Entorno de pruebas</span></header><div className="dashboard-content"><h1>Solicitudes y pedidos</h1><LiveInboxRefresh /><p>Registra solicitudes recibidas por WhatsApp. Ningún pedido queda confirmado hasta que el equipo verifique disponibilidad y entrega.</p><section className="dashboard-panel" style={{padding:24,marginBottom:24}}><h2>Registrar solicitud</h2><NewOrder conversations={conversations} products={products||[]}/></section><section className="dashboard-panel" style={{padding:24}}><h2>Seguimiento de solicitudes</h2>{!visibleOrders.length&&<p>Todavía no hay solicitudes registradas.</p>}{visibleOrders.map(o=>{const customer=o.customer as unknown as {full_name:string|null;phone:string}|null;const items=o.items as unknown as {product_name:string;quantity:number;retail_unit_price_bob:number|null}[]|null;return <article key={o.id} style={{borderBottom:"1px solid #ddd",padding:"14px 0"}}><strong>{customer?.full_name||customer?.phone||"Cliente"}</strong><p>{new Date(o.created_at).toLocaleString("es-BO")} · {items?.map(i=>i.quantity+" × "+i.product_name).join(", ")||"Sin productos"}</p>{o.notes&&<p>Nota interna: {o.notes}</p>}<OrderActions orderId={o.id} status={o.status} recipientFullName={o.recipient_full_name||""} deliveryCity={o.delivery_city||""} deliveryAddress={o.delivery_address||""} googleMapsUrl={o.google_maps_url||""} paymentMethod={o.payment_method||""} confirmationSentAt={o.confirmation_sent_at||null}/></article>;})}</section></div></main></div>;
}