export function validOrderQuantity(value: unknown): boolean {
 const quantity=Number(value);
 return value!==null && value!==undefined && value!=="" && Number.isInteger(quantity) && quantity>=1 && quantity<=100;
}
export function validPublicProduct(product: {is_active:boolean;price_bob:number|string|null} | null): boolean {
 return Boolean(product?.is_active && product.price_bob!==null && Number.isFinite(Number(product.price_bob)) && Number(product.price_bob)>0);
}
export function validOrderItems(items: {product_name:string;quantity:number;retail_unit_price_bob:number|null}[]): boolean {
 return items.length>0 && items.every(item=>Boolean(item.product_name?.trim()) && Number.isInteger(item.quantity) && item.quantity>=1 && item.retail_unit_price_bob!==null && Number.isFinite(Number(item.retail_unit_price_bob)) && Number(item.retail_unit_price_bob)>0);
}
export function blocksOrderTransition(current:string,next:string,confirmationSent:boolean):boolean {
 if(next==="confirmed" && (confirmationSent || ["confirmed","cancelled","delivered"].includes(current)))return true;
 if(confirmationSent && ["new","verifying"].includes(next) && next!==current)return true;
 return false;
}
