import { initCrudModule } from "../js/crud-module.js?v=12";

export async function init(){ return initCrudModule("transactions",{transactionType:"Receipt"}); }
