import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import pg from "pg";
// Browser tooling is installed outside the application to avoid runtime dependencies.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.COMMERCE_PLAYWRIGHT_PATH||"playwright");
const databaseUrl=process.env.COMMERCE_TEST_DATABASE_URL;
const base=process.env.COMMERCE_TEST_BASE_URL||"http://127.0.0.1:3011";
if(!databaseUrl||new URL(databaseUrl).hostname!=="127.0.0.1"||!new URL(databaseUrl).pathname.startsWith("/commerce_test_")||new URL(base).hostname!=="127.0.0.1")throw new Error("Isolated local test environment required.");
const db=new pg.Client({connectionString:databaseUrl});await db.connect();
const browser=await chromium.launch({headless:true});const errors=[];
try{
  const tenant=(await db.query("select id from tenants where slug='ground-shop'")).rows[0].id;
  const admin=(await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0].id;
  const adminToken=await new SignJWT({userId:admin,tenantId:tenant,email:"commerce-admin@example.test",role:"owner"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  const context=await browser.newContext({viewport:{width:1365,height:900}});const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${base}/loja/ground-shop`,{waitUntil:"networkidle"});
  await page.getByRole("link",{name:/Botton personalizado/}).click();
  await page.getByRole("button",{name:"Adicionar ao carrinho"}).waitFor();
  await page.getByRole("button",{name:"Adicionar ao carrinho"}).click();
  await page.getByRole("status").filter({hasText:"Produtos adicionados"}).waitFor();
  await page.getByRole("link",{name:"Ver carrinho",exact:true}).click();
  await page.getByRole("heading",{name:"Seu carrinho"}).waitFor();
  await page.getByRole("link",{name:"Continuar para entrega"}).waitFor();
  await page.screenshot({path:"/tmp/commerce-cart-desktop.png",fullPage:true});
  await page.reload({waitUntil:"networkidle"});if(await page.getByText("Seu carrinho ainda está vazio.").count())throw new Error("Cart did not persist.");
  const cookies=await context.cookies();const cookie=cookies.find(c=>c.name.startsWith("commerce_"));
  const session=(await db.query("select id from commerce_sessions where tenant_id=$1 and token_hash=$2",[tenant,createHash("sha256").update(cookie.value).digest("hex")])).rows[0].id;
  const customer=(await db.query("select id from commerce_customers where tenant_id=$1 and email='buyer@example.test'",[tenant])).rows[0].id;
  // Email delivery is intentionally not exercised against real SMTP accounts.
  await db.query("update commerce_sessions set customer_id=$2 where id=$1",[session,customer]);
  await page.goto(`${base}/loja/ground-shop/checkout`,{waitUntil:"networkidle"});
  await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Confirmar pedido"}).click();
  await page.waitForURL(/\/pedidos\/[a-f0-9-]+$/);await page.getByText("Pagar na retirada",{exact:true}).waitFor();
  await page.screenshot({path:"/tmp/commerce-order-desktop.png",fullPage:true});
  await context.addCookies([{name:"pricing_session",value:adminToken,url:base,httpOnly:true,sameSite:"Lax"}]);
  await page.goto(`${base}/commerce`,{waitUntil:"networkidle"});await page.getByRole("button",{name:/Pedidos \(/}).click();
  await page.getByRole("button",{name:"Confirmar pagamento",exact:true}).first().click();await page.getByLabel("Observação").fill("Pagamento confirmado no teste local.");await page.getByRole("dialog").getByRole("button",{name:"Confirmar",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await page.screenshot({path:"/tmp/commerce-admin-desktop.png",fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    for(const route of ["/loja/ground-shop","/loja/ground-shop/carrinho","/loja/ground-shop/conta","/commerce"]){await page.goto(base+route,{waitUntil:"networkidle"});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);if(overflow)throw new Error(`Horizontal overflow ${route} at ${width}`);await page.screenshot({path:`/tmp/commerce-${route==="/commerce"?"admin":"store"}-${width}.png`,fullPage:true});}
  }
  if(errors.length)throw new Error(errors.join("\n"));console.log("Browser smoke passed: catalog, product, persistent cart, checkout, order, admin payment confirmation, 390px and 320px overflow checks.");
}finally{await browser.close();await db.end();}
