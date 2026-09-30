// Edge Function "enviar-push": entrega avisos al teléfono (Web Push) aunque la app esté cerrada.
// La llama la base de datos (app.enviar_push, con pg_net) con la clave AVISOS_SECRETO.
//
// Secretos que necesita (Supabase → Edge Functions → Secrets): VAPID_PUBLICA, VAPID_PRIVADA, AVISOS_SECRETO y, opcional,
// VAPID_CONTACTO (mailto:correo@empresa.com). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
// Al crearla, desactiva "Verify JWT": la seguridad la da AVISOS_SECRETO.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Pedido { usuarios: string[]; titulo: string; cuerpo?: string; url?: string; tag?: string }

Deno.serve(async (req) => {
  const secreto = Deno.env.get('AVISOS_SECRETO');
  if (!secreto || req.headers.get('Authorization') !== `Bearer ${secreto}`) return new Response('No autorizado', { status: 401 });
  if (req.method !== 'POST') return new Response('Usa POST', { status: 405 });

  const { usuarios, titulo, cuerpo, url, tag } = (await req.json()) as Pedido;
  if (!Array.isArray(usuarios) || usuarios.length === 0 || !titulo) return Response.json({ enviados: 0 });

  webpush.setVapidDetails(Deno.env.get('VAPID_CONTACTO') ?? 'mailto:avisos@nova.app', Deno.env.get('VAPID_PUBLICA')!, Deno.env.get('VAPID_PRIVADA')!);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: subs, error } = await sb.from('push_suscripciones').select('id,endpoint,p256dh,auth').in('usuario_id', usuarios);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const carga = JSON.stringify({ titulo, cuerpo: cuerpo ?? '', url: url ?? './', tag });
  let enviados = 0;
  const vencidas: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 86400, urgency: 'high' });
        enviados++;
      } catch (e) {
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) vencidas.push(s.id); // el teléfono ya no acepta avisos: se borra la suscripción
      }
    })
  );
  if (vencidas.length) await sb.from('push_suscripciones').delete().in('id', vencidas);
  return Response.json({ enviados, vencidas: vencidas.length });
});
