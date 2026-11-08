"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function OrderActions({orderId,status}:{orderId:string;status:string}){
 const router=useRouter();const [value,setValue]=useState(status);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
 <select value={value} onChange={e=>setValue(e.target.value)} aria-label="Estado del pedido">
 {Object.entries({new:"Nuevo",verifying:"Verificando",confirmed:"Confirmado",preparing:"Preparando",shipped:"Enviado",delivered:"Entregado",cancelled:"Cancelado"}).map(([key,label])=><option key={key} value={key}>{label}</option>)}
 </select><button disabled={busy||value===status} onClick={async()=>{setBusy(true);setError("");try{const res=await fetch("/api/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId,status:value})});if(!res.ok)throw Error((await res.json()).error||"No se pudo guardar");router.refresh();}catch(e){setError(e instanceof Error?e.message:"Error");}finally{setBusy(false);}}}>Guardar estado</button>{error&&<span role="alert">{error}</span>}</div>;
}