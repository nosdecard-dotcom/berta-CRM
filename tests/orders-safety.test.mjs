import test from "node:test";
import assert from "node:assert/strict";
import {validOrderQuantity,validPublicProduct,validOrderItems,blocksOrderTransition} from "../lib/order-validation.ts";

test("quantities accept only whole units from 1 to 100",()=>{
 for(const value of [1,2,100])assert.equal(validOrderQuantity(value),true);
 for(const value of [0,-1,101,1.5,"",null,undefined,"abc",Infinity])assert.equal(validOrderQuantity(value),false);
});
test("inactive and missing-price products cannot be sold",()=>{
 assert.equal(validPublicProduct({is_active:true,price_bob:"205.20"}),true);
 for(const product of [null,{is_active:false,price_bob:205},{is_active:true,price_bob:null},{is_active:true,price_bob:0},{is_active:true,price_bob:-1},{is_active:true,price_bob:"NaN"}])assert.equal(validPublicProduct(product),false);
});
test("confirmation requires complete priced items",()=>{
 assert.equal(validOrderItems([{product_name:"Fusion",quantity:1,retail_unit_price_bob:205.2}]),true);
 for(const items of [[],[{product_name:"",quantity:1,retail_unit_price_bob:10}],[{product_name:"Fusion",quantity:0,retail_unit_price_bob:10}],[{product_name:"Fusion",quantity:1,retail_unit_price_bob:null}]])assert.equal(validOrderItems(items),false);
});
test("already confirmed orders cannot be confirmed twice or rolled back",()=>{
 assert.equal(blocksOrderTransition("confirmed","confirmed",true),true);
 assert.equal(blocksOrderTransition("preparing","confirmed",true),true);
 assert.equal(blocksOrderTransition("confirmed","new",true),true);
 assert.equal(blocksOrderTransition("confirmed","verifying",true),true);
 assert.equal(blocksOrderTransition("new","confirmed",false),false);
 assert.equal(blocksOrderTransition("confirmed","preparing",true),false);
});
