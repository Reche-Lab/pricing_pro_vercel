import { signHS256 } from './_jwt.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(204).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const { user, pass } = req.body || {};
  const U = process.env.ADMIN_USER || 'ground';
  const P = process.env.ADMIN_PASS || 'shop';
  if (user!==U || pass!==P) return res.status(401).json({ ok:false });

  const secret = process.env.JWT_SECRET || 'dev-secret';
  const token = signHS256({ sub:user }, secret, 7*24*3600);
  const host = req.headers.host || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const cookie = [
    `gsession=${token}`,'Path=/','HttpOnly','SameSite=Lax', isLocal?'':'Secure', `Max-Age=${7*24*3600}`
  ].filter(Boolean).join('; ');

  res.setHeader('Set-Cookie', cookie);
  res.status(200).json({ ok:true });
}
