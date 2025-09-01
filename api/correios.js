// /api/correios.js
// Node 18+ (Vercel) — usa fetch nativo
// .env: defina CORREIOS_API_TOKEN com seu Bearer token oficial dos Correios

const API_URL = 'https://api.correios.com.br/preco/v1/nacional/';
const TOKEN   = process.env.CORREIOS_API_TOKEN || '';
const NUMERO_CONTRATO = process.env.CONTRATO_CORREIOS || '9912434308';

/**
 * Util: converte qualquer número/str em string, sem formatação BR.
 */
function asStr(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v);
}

/**
 * Util: soma campos string no formato "12,34" ou "12.34" com segurança.
 */
function sumMoneyStr(arr, key) {
  let s = 0;
  for (const it of arr || []) {
    const raw = (it?.[key] ?? '').toString().trim();
    if (!raw) continue;
    const n = parseFloat(raw.replace('.', '').replace(',', '.')); // "1.234,56" -> 1234.56
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

/**
 * Monta o payload oficial esperado pela API:
 * - Você pode mandar já em formato "parametrosProduto" do frontend,
 *   ou mandar "pacotes" simples e a gente transforma aqui.
 */
function buildPayload(body) {
  // 1) Se veio já no padrão oficial, só repassa
  if (Array.isArray(body?.parametrosProduto)) {
    return {
      idLote: asStr(body.idLote || Date.now()),
      parametrosProduto: body.parametrosProduto.map((p, i) => ({
        coProduto:  asStr(p.coProduto),            // ex: "04162" (SEDEX), "04669" (PAC) — confirme com seu contrato
        nuRequisicao: asStr(p.nuRequisicao || `${Date.now()}_${i}`),
        nuContrato:  asStr(NUMERO_CONTRATO),
        nuDR:        74,
        cepOrigem:   asStr(p.cepOrigem || body.cepOrigem || ''),
        cepDestino:  asStr(p.cepDestino || body.cepDestino || ''),
        psObjeto:    asStr(p.psObjeto),            // em gramas (string)
        tpObjeto:    asStr(p.tpObjeto || ''),      // opcional
        comprimento: asStr(p.comprimento),         // cm (string)
        largura:     asStr(p.largura),             // cm (string)
        altura:      asStr(p.altura),              // cm (string)
        diametro:    asStr(p.diametro || '0'),
        psCubico:    asStr(p.psCubico || ''),
        servicosAdicionais: Array.isArray(p.servicosAdicionais) ? p.servicosAdicionais : [],
        criterios:   Array.isArray(p.criterios) ? p.criterios : [],
        vlDeclarado: asStr(p.vlDeclarado || '0'),
        dtEvento:    asStr(p.dtEvento || ''),
        coUnidadeOrigem: asStr(p.coUnidadeOrigem || ''),
        dtArmazenagem:   asStr(p.dtArmazenagem || ''),
        vlRemessa:   asStr(p.vlRemessa || ''),
        nuUnidade:   asStr(p.nuUnidade || '')
      }))
    };
  }

  // 2) Caso simples: veio do seu front como "pacotes" + metadados
  // body esperado:
  // { coProduto, cepOrigem, cepDestino, pacotes: [{ pesoKg, comprimento, largura, altura, diametro }], nuContrato?, nuDR? }
  const coProduto = asStr(body.coProduto);  // ex.: "04162" (SEDEX varejo), "04669" (PAC varejo) — confirme no seu cadastro
  const cepOrigem = asStr(body.cepOrigem || '');
  const cepDestino= asStr(body.cepDestino || '');
  const nuContrato= asStr(body.nuContrato || '');
  const nuDR      = body.nuDR ?? 74;

  const pacotes = Array.isArray(body.pacotes) ? body.pacotes : [];

  return {
    idLote: asStr(body.idLote || Date.now()),
    parametrosProduto: pacotes.map((px, idx) => {
      // API espera "psObjeto" em GRAMAS como string
      // Se vier peso em kg do front, convertemos aqui:
      let psObjeto = px.psObjeto ?? (px.pesoKg != null ? Math.round(px.pesoKg * 1000) : 0);

      return {
        coProduto,
        nuRequisicao: `${Date.now()}_${idx}`,
        nuContrato,
        nuDR,
        cepOrigem,
        cepDestino,
        psObjeto: asStr(psObjeto),                     // gramas
        comprimento: asStr(px.comprimento ?? ''),      // cm
        largura:     asStr(px.largura ?? ''),
        altura:      asStr(px.altura ?? ''),
        diametro:    asStr(px.diametro ?? '0'),
        servicosAdicionais: [],                        // preencha se desejar (ex. "MP" mão própria)
        criterios: []
      };
    })
  };
}

/**
 * Normaliza a resposta para adicionar um "totalFrete" somando pcFinal (ou pcProduto como fallback).
 */
function normalizeResponse(json) {
  if (!Array.isArray(json)) return { raw: json, totalFrete: 0 };

  // A API costuma retornar array de produtos. Em cada item:
  // - pcFinal: preço final (string BR ex "12,34") — use-o quando existir
  // - pcProduto: preço do produto (também string)
  const totalFinal = sumMoneyStr(json, 'pcFinal');
  const totalProduto = sumMoneyStr(json, 'pcProduto');
  const total = totalFinal > 0 ? totalFinal : totalProduto;

  return {
    totalFrete: total, // número JS (em BRL)
    itens: json
  };
}

module.exports = async (req, res) => {
  // CORS básico p/ ser chamado do browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    if (!TOKEN) {
      return res.status(500).json({ error: 'CORREIOS_API_TOKEN ausente no ambiente (.env).' });
    }

    const body = req.body || {};
    const payload = buildPayload(body);

    console.log(payload)

    // Validações mínimas
    if (!payload?.parametrosProduto?.length) {
      return res.status(400).json({ error: 'parametrosProduto vazio. Envie pacotes ou o bloco oficial.' });
    }
    for (const p of payload.parametrosProduto) {
      if (!p.coProduto)   return res.status(400).json({ error: 'coProduto obrigatório.' });
      if (!p.cepOrigem)   return res.status(400).json({ error: 'cepOrigem obrigatório.' });
      if (!p.cepDestino)  return res.status(400).json({ error: 'cepDestino obrigatório.' });
      if (!p.psObjeto)    return res.status(400).json({ error: 'psObjeto (gramas) obrigatório.' });
      if (!p.comprimento || !p.largura || !p.altura) {
        return res.status(400).json({ error: 'comprimento/largura/altura obrigatórios.' });
      }
    }

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    // A API retorna JSON nos três casos (200/400/500) com estruturas diferentes
    let data;
    try { data = JSON.parse(text); } catch {
      // Se algo diferente de JSON vier, devolve como texto
      return res.status(502).json({ error: 'Resposta não-JSON da API dos Correios', raw: text });
    }

    if (resp.status === 200) {
      const norm = normalizeResponse(data);
      return res.status(200).json({ ok: true, ...norm });
    }

    // 400 / 500 — repassa mensagem
    return res.status(resp.status).json({ ok: false, ...data });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
