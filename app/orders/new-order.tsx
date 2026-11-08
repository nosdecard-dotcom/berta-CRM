"use client";
import {useState} from "react";import {useRouter} from "next/navigation";
export default function NewOrder({conversations,products}:{conversations:{id:string;label:string}[];products:{id:string;name:string;sku:string|null}[]}){
 const router=useRouter();const [conversationId,setConversationId]=useState(conversations[0]?.id||"");const [productId,setProductId]=useState(products[0]?.id||"");const [quantity,setQuantity]=useState(1);const [notes,setNotes]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 return <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const res=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId,productId,quantity,notes})});if(!res.ok)throw Error((await res.json()).error||"No se pudo guardar");setNotes("");router.refresh();}catch(err){setError(err instanceof Error?err.message:"Error");}finally{setBusy(false);}}} style={{display:"grid",gap:12,maxWidth:650}}>
 <label>Conversación del cliente<select required value={conversationId} onChange={e=>setConversationId(e.target.value)} style={{display:"block",width:"100%",padding:10}}>{conversations.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label>
 <label>Producto<select required value={productId} onChange={e=>setProductId(e.target.value)} style={{display:"block",width:"100%",padding:10}}>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku||"sin código"})</option>)}</select></label>
 <label>Cantidad<input type="number" min="1" max="10000" required value={quantity} onChange={e=>setQuantity(Number(e.target.value))} style={{display:"block",width:"100%",padding:10}}/></label>
 <label>Observaciones internas<textarea value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)} style={{display:"block",width:"100%",padding:10}}/></label>
 <button type="submit" disabled={busy||!conversationId||!productId}>{busy?"Guardando...":"Registrar solicitud"}</button>{error&&<p role="alert">{error}</p>}
 </form>;
}