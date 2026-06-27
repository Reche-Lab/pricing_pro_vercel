import fs from "node:fs/promises";
import pg from "pg";

const tenantSlug = process.argv[2] ?? "ground-shop";
const csvPath = process.argv[3] ?? "boxes.csv";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not loaded. Check your .env file.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: resolveSslConfig(databaseUrl, process.env.DATABASE_SSL ?? "auto")
});

await client.connect();

try {
  const csv = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(csv);
  await client.query("begin");

  const tenant = await one("select id from tenants where slug = $1", [tenantSlug]);
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const variants = await client.query(
    `
      select id, sku
      from product_variants
      where tenant_id = $1 and sku in ('BOTTON-25', 'BOTTON-35', 'BOTTON-45', 'BOTTON-55')
    `,
    [tenant.id]
  );
  const variantBySku = Object.fromEntries(variants.rows.map((row) => [row.sku, row.id]));

  const mappings = [
    ["BOTTON-25", "botton_2.5_quantity"],
    ["BOTTON-35", "botton_3.5_quantity"],
    ["BOTTON-45", "botton_4.5_quantity"],
    ["BOTTON-55", "botton_5.5_quantity"]
  ];

  let boxCount = 0;
  let capacityCount = 0;

  for (const row of rows) {
    const box = await one(
      `
        insert into packaging_boxes (
          tenant_id,
          name,
          height_cm,
          width_cm,
          length_cm,
          weight_kg,
          active
        )
        values ($1, $2, $3, $4, $5, $6, true)
        on conflict (tenant_id, name) do update
          set height_cm = excluded.height_cm,
              width_cm = excluded.width_cm,
              length_cm = excluded.length_cm,
              weight_kg = excluded.weight_kg,
              active = true,
              updated_at = now()
        returning id
      `,
      [
        tenant.id,
        row.medidas_caixa,
        number(row.altura_embalagem),
        number(row.largura_embalagem),
        number(row.comprimento_embalagem),
        number(row.peso_embalagem)
      ]
    );
    boxCount += 1;

    for (const [sku, column] of mappings) {
      const variantId = variantBySku[sku];
      const capacity = Math.trunc(number(row[column]));
      if (!variantId || capacity <= 0) continue;

      await client.query(
        `
          insert into packaging_capacities (
            tenant_id,
            packaging_box_id,
            product_variant_id,
            capacity
          )
          values ($1, $2, $3, $4)
          on conflict (tenant_id, packaging_box_id, product_variant_id) do update
            set capacity = excluded.capacity,
                updated_at = now()
        `,
        [tenant.id, box.id, variantId, capacity]
      );
      capacityCount += 1;
    }
  }

  await client.query("commit");
  console.log(`Imported ${boxCount} boxes and ${capacityCount} capacities for tenant ${tenantSlug}.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

async function one(sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0] ?? null;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const output = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      output.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  output.push(current.trim());
  return output;
}

function number(value) {
  const parsed = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSslConfig(databaseUrlValue, mode) {
  if (mode === "true") return { rejectUnauthorized: false };
  if (mode === "false") return undefined;

  const host = new URL(databaseUrlValue).hostname;
  const isSupabaseHost =
    host.endsWith(".supabase.co") ||
    host.includes(".pooler.supabase.com") ||
    host.includes("supabase.com");

  return isSupabaseHost ? { rejectUnauthorized: false } : undefined;
}
