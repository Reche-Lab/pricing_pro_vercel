export default async function handler(req,res){
  const host=req.headers.host||'';
  const isLocal=host.startsWith('localhost')||host.startsWith('127.0.0.1');
  const cookie=['gsession=','Path=/','HttpOnly','SameSite=Lax',isLocal?'':'Secure','Max-Age=0'].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie',cookie);
  res.status(200).json({ok:true});
}
