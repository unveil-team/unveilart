export async function makeToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':unveilart-admin');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyAdminToken(req: Request): Promise<boolean> {
  const password = Deno.env.get('ADMIN_PASSWORD');
  if (!password) return false;
  const token = req.headers.get('x-admin-token') || '';
  const expected = await makeToken(password);
  return token === expected;
}
