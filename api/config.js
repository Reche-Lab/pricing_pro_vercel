import { verifyHS256 } from './_jwt.js';

export default async function handler(req, res) {
  const cookie = (req.headers.cookie || '');
  const m = cookie.match(/(?:^|;\s*)gsession=([^;]+)/);
  const token = m ? m[1] : null;
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const payload = token ? verifyHS256(token, secret) : null;
  if (!payload) return res.status(401).json({ ok:false });

  const cfg = {
    name: process.env.COMPANY_NAME || 'Ground Shop',
    phone: process.env.COMPANY_PHONE || '(12) 9119-7234',
    site: process.env.COMPANY_SITE || 'https://www.groundshop.com.br/',
    logo: process.env.LOGO_URL || '/logo.jpeg',
  };
  res.status(200).json(cfg);
}
