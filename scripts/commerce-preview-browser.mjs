import { createRequire } from "node:module";
import { SignJWT } from "jose";
import pg from "pg";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright",
);
const databaseUrl = process.env.COMMERCE_TEST_DATABASE_URL;
const base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (
  !databaseUrl ||
  new URL(databaseUrl).hostname !== "127.0.0.1" ||
  !new URL(databaseUrl).pathname.startsWith("/commerce_test_") ||
  new URL(base).hostname !== "127.0.0.1"
)
  throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const browser = await chromium.launch({ headless: true });
let product, store;
const errors = [];
try {
  store = (
    await db.query(
      "select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'",
    )
  ).rows[0];
  product = (
    await db.query(
      "select * from commerce_products where tenant_id=$1 limit 1",
      [store.tenant_id],
    )
  ).rows[0];
  const admin = (
    await db.query(
      "select id from app_users where email='commerce-admin@example.test'",
    )
  ).rows[0].id;
  const counts = async () =>
    (
      await db.query(
        "select (select count(*) from commerce_orders) as orders, (select count(*) from commerce_artworks) as artworks, (select count(*) from commerce_sessions) as sessions",
      )
    ).rows[0];
  const before = await counts();
  await db.query(
    "update commerce_stores set enabled=false,status='draft' where tenant_id=$1",
    [store.tenant_id],
  );
  await db.query("update commerce_products set snapshot=$2 where id=$1", [
    product.id,
    {
      ...product.snapshot,
      personalized: true,
      geometry: {
        shape: "circle",
        widthMm: 35,
        heightMm: 35,
        cornerStyle: "sharp",
        cornerRadiusMm: 0,
        rotationDegrees: 0,
        allowPrintRotation: true,
      },
    },
  ]);
  const token = await new SignJWT({
    userId: admin,
    tenantId: store.tenant_id,
    email: "commerce-admin@example.test",
    role: "owner",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(
      new TextEncoder().encode(
        "commerce-local-test-secret-at-least-32-characters",
      ),
    );
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addCookies([
    {
      name: "pricing_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/store/"))
      errors.push("Public commerce API called in preview: " + request.url());
  });
  const prefix = `${base}/commerce/ground-shop/preview`;
  await page.goto(`${prefix}/produto/${product.id}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page
    .getByRole("link", { name: "Abrir carrinho e preparar artes" })
    .click();
  await page.getByRole("heading", { name: "Seu carrinho" }).waitFor();
  const image = await sharp({
    create: { width: 400, height: 400, channels: 3, background: "#19ad82" },
  })
    .png()
    .toBuffer();
  await page.locator('input[type="file"]').setInputFiles({
    name: "arte-teste.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.getByRole("button", { name: "Retocar", exact: true }).click();
  const canvas = page.locator('canvas[aria-label^="Editor da arte"]');
  await canvas.waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector(
      'canvas[aria-label^="Editor da arte"]',
    );
    return (
      canvas?.width > 100 &&
      canvas
        .getContext("2d")
        .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3] > 0
    );
  });
  const bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.4,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.5,
    { steps: 8 },
  );
  await page.mouse.up();
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    ) {
      await page.screenshot({
        path: "/tmp/commerce-preview-overflow.png",
        fullPage: true,
      });
      console.log(
        await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 15)
            .map((el) => ({
              tag: el.tagName,
              cls: el.className,
              width: el.getBoundingClientRect().width,
              right: el.getBoundingClientRect().right,
            })),
        ),
      );
      throw new Error(`Retouch overflow at ${width}`);
    }
    await page.screenshot({
      path: `/tmp/commerce-preview-retouch-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Salvar versão", exact: true })
    .click();
  await canvas.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Enquadrar", exact: true }).click();
  await page
    .getByText("Centralizar e enquadrar arte", { exact: true })
    .waitFor();
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw new Error(`Crop overflow at ${width}`);
    await page.screenshot({
      path: `/tmp/commerce-preview-crop-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Preparar arte", exact: true })
    .click();
  await page
    .getByText("Centralizar e enquadrar arte", { exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Aprovar arte", exact: true }).click();
  await page.getByRole("button", { name: "Aprovada", exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/commerce-preview-approved-320.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Continuar para entrega" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Concluir simulação" }).click();
  await page.getByText("Simulação concluída", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/commerce-preview-complete-320.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Voltar às artes" }).click();
  await page.getByRole("button", { name: "Aprovada", exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByText("Seu carrinho ainda está vazio.", { exact: true })
    .waitFor();
  if (JSON.stringify(before) !== JSON.stringify(await counts()))
    throw new Error("Preview persisted commerce data");
  if (
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith("commerce_"),
    )
  )
    throw new Error("Preview created buyer cookies");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Preview passed: disabled draft, add/cart/upload/retouch/crop/approve/checkout, 1365/390/320px, nonblank canvas, no buyer APIs/cookies or persisted commerce records, reload resets state.",
  );
} finally {
  await browser.close();
  if (product)
    await db.query("update commerce_products set snapshot=$2 where id=$1", [
      product.id,
      product.snapshot,
    ]);
  if (store)
    await db.query(
      "update commerce_stores set enabled=$2,status=$3 where tenant_id=$1",
      [store.tenant_id, store.enabled, store.status],
    );
  await db.end();
}
