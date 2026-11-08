import { redirect } from "next/navigation";
import CrmSidebar from "@/app/components/crm-sidebar";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";
export default async function CatalogPage() {
 const db = await createSupabaseServerClient();
 const {data:claims,error} = await db.auth.getClaims();
 if(error || !claims) redirect("/login");
 const role=(claims.claims.app_metadata as {role?:string}|undefined)?.role ?? "";
 if(!["admin","manager","agent"].includes(role)) redirect("/");
 const {data:products,error:catalogError}=await db.from("catalog_products").select("id,sku,brand,line,name,presentation,price_bob,stock_status,is_active").order("line").order("name").limit(200);
 return <div className="workspace-layout"><CrmSidebar role={role}/><main className="workspace-main"><header className="workspace-topbar"><div><span className="topbar-breadcrumb">MARZOE / Productos</span><strong>Catálogo inteligente</strong></div><span className="workspace-environment">Entorno de pruebas</span></header><div className="dashboard-content"><h1>Catálogo de MARZOE</h1><p>Solo los productos activos pueden ser consultados por Berta. Los precios y la disponibilidad no confirmados nunca se inventan.</p>
 {catalogError ? <p>No se pudo consultar el catálogo. Verifica los permisos.</p> : <div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"left",borderSpacing:"0 12px"}}><thead><tr><th>Producto</th><th>Línea</th><th>Presentación</th><th>Precio Bs</th><th>Disponibilidad</th><th>Visible para Berta</th></tr></thead><tbody>{(products??[]).map(p=><tr key={p.id}><td>{p.name}</td><td>{p.line}</td><td>{p.presentation??"Pendiente"}</td><td>{p.price_bob==null?"Por confirmar":p.price_bob}</td><td>{p.stock_status==="available"?"Disponible":p.stock_status==="unavailable"?"Agotado":"Por confirmar"}</td><td>{p.is_active?"Sí":"No"}</td></tr>)}</tbody></table>{!products?.length&&<p>El catálogo todavía está vacío. Agrega productos para que Berta pueda consultarlos.</p>}</div>}
 {(role==="admin"||role==="manager")&&<section className="dashboard-panel" style={{marginTop:24,padding:24}}><h2>Agregar producto</h2><p>Registra solamente información confirmada. Para publicar un producto marca la casilla al final.</p><form action="/api/catalog" method="post" style={{display:"grid",gap:12,maxWidth:520}}>
 <label>Nombre del producto<input name="name" required maxLength={160} placeholder="Ej. Shampoo Fusion" style={{display:"block",width:"100%",padding:10}}/></label>
 <label>Línea<input name="line" required maxLength={100} placeholder="Ej. Fusion" style={{display:"block",width:"100%",padding:10}}/></label>
 <label>Presentación<input name="presentation" maxLength={80} placeholder="Ej. 250 ml" style={{display:"block",width:"100%",padding:10}}/></label>
 <label>Precio en bolivianos (opcional)<input name="price_bob" type="number" min="0" step="0.01" placeholder="Por confirmar" style={{display:"block",width:"100%",padding:10}}/></label>
 <label>Disponibilidad<select name="stock_status" defaultValue="unconfirmed" style={{display:"block",width:"100%",padding:10}}><option value="unconfirmed">Por confirmar</option><option value="available">Disponible</option><option value="unavailable">Agotado</option></select></label>
 <label><input type="checkbox" name="is_active" value="yes"/> Habilitar para respuestas de Berta</label>
 <button type="submit" className="dashboard-primary">Guardar producto</button></form></section>}
 </div></main></div>;
}