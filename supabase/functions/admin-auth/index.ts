import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { makeToken } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { password } = await req.json();
  if (!password) return json({ error: 'Password required' }, 400);

  const adminPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!adminPassword) return json({ error: 'ADMIN_PASSWORD not configured' }, 500);

  if (password !== adminPassword) return json({ error: 'Incorrect password' }, 401);

  const token = await makeToken(password);
  return json({ token });
});
