import { verifyHS256 } from './_jwt.js';

export default async function handler(req, res) {
  const cookie = (req.headers.cookie || '');
  const m = cookie.match(/(?:^|;\s*)gsession=([^;]+)/);
  const token = m ? m[1] : null;
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const payload = token ? verifyHS256(token, secret) : null;
  if (!payload) return res.status(401).json({ error:'unauthorized' });

  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if (req.method==='OPTIONS') return res.status(204).end();

  const allowed = [
    'nCdEmpresa','sDsSenha','sCepOrigem','sCepDestino','nVlPeso','nCdFormato',
    'nVlComprimento','nVlAltura','nVlLargura','nVlDiametro','sCdMaoPropria',
    'nVlValorDeclarado','sCdAvisoRecebimento','nCdServico','StrRetorno'
  ];
  const sp = new URLSearchParams();
  const q = req.query || {};
  for (const k of allowed) if (q[k]) sp.set(k, q[k]);

  if (!sp.get('StrRetorno')) sp.set('StrRetorno','xml');
  if (!sp.get('nCdEmpresa') && process.env.CORREIOS_EMPRESA) sp.set('nCdEmpresa', process.env.CORREIOS_EMPRESA);
  if (!sp.get('sDsSenha')   && process.env.CORREIOS_SENHA)   sp.set('sDsSenha',   process.env.CORREIOS_SENHA);
  if (!sp.get('sCepOrigem') && process.env.CORREIOS_CEP_ORIGEM) sp.set('sCepOrigem', process.env.CORREIOS_CEP_ORIGEM);

  const upstream = 'https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?' + sp.toString();
  try {
    const r = await fetch(upstream);
    const body = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/xml; charset=utf-8').send(body);
  } catch (e) {
    res.status(502).json({ error:'Upstream error', detail:String(e) });
  }
}
