const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;

  // Auth simples — token fixo por ora
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!['jp2026', 'maysa2026', 'graal2026'].includes(token)) {
    return json({ error: 'Não autorizado' }, 401);
  }

  try {
    // GET /pautas
    if (path === '/pautas' && method === 'GET') {
      const ano = url.searchParams.get('ano') || new Date().getFullYear();
      const mes = url.searchParams.get('mes') || '';
      let sql = 'SELECT * FROM pautas WHERE ano = ?';
      const params = [ano];
      if (mes) { sql += ' AND mes = ?'; params.push(mes); }
      sql += ' ORDER BY id DESC';
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      return json({ success: true, result: results });
    }

    // GET /pautas/all — todas as pautas (histórico)
    if (path === '/pautas/all' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM pautas ORDER BY ano DESC, id DESC').all();
      return json({ success: true, result: results });
    }

    // POST /pautas
    if (path === '/pautas' && method === 'POST') {
      const body = await request.json();
      const { ano, mes, empresa, cliente, campanha, tipo, veiculo, bruto, imp, com, hon, st, st_fin, obs } = body;
      const result = await env.DB.prepare(
        'INSERT INTO pautas (ano,mes,empresa,cliente,campanha,tipo,veiculo,bruto,imp,com,hon,st,st_fin,obs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(ano, mes, empresa, cliente, campanha||'', tipo||'', veiculo||'', bruto||0, imp||0, com||0, hon||0, st||'Em aberto', st_fin||'Em aberto', obs||'').run();
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)").bind('Criar', cliente, 'pauta').run();
      return json({ success: true, id: result.meta.last_row_id });
    }

    // PUT /pautas/:id
    if (path.startsWith('/pautas/') && method === 'PUT') {
      const id = path.split('/')[2];
      const body = await request.json();
      const fields = Object.keys(body).filter(k => k !== 'id');
      const sets = fields.map(f => `${f} = ?`).join(', ');
      const vals = fields.map(f => body[f]);
      await env.DB.prepare(`UPDATE pautas SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...vals, id).run();
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)").bind('Editar', `Pauta #${id}`, 'pauta').run();
      return json({ success: true });
    }

    // GET /doc/:hash — página pública de assinatura
    if (path.startsWith('/doc/') && method === 'GET') {
      const hash = path.split('/')[2];
      const { results } = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash = ?').bind(hash).all();
      if (!results.length) return json({ error: 'Documento não encontrado' }, 404);
      const doc = results[0];
      const pauta = doc.pauta_id ? (await env.DB.prepare('SELECT * FROM pautas WHERE id = ?').bind(doc.pauta_id).first()) : null;
      return json({ success: true, doc, pauta });
    }

    // POST /doc/:hash/sign — assinar documento
    if (path.startsWith('/doc/') && path.endsWith('/sign') && method === 'POST') {
      const hash = path.split('/')[2];
      const body = await request.json();
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '?';
      const ua = request.headers.get('User-Agent') || '';
      await env.DB.prepare(
        "UPDATE assinaturas SET nome_assinante=?, ip_assinante=?, user_agent=?, signed_at=datetime('now'), status='assinado' WHERE doc_hash=?"
      ).bind(body.nome, ip, ua, hash).run();
      const doc = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash = ?').bind(hash).first();
      if (doc?.pauta_id) {
        await env.DB.prepare("UPDATE pautas SET pp_pi_status='assinado', pp_pi_signed_at=datetime('now'), pp_pi_signed_name=?, pp_pi_signed_ip=? WHERE id=?")
          .bind(body.nome, ip, doc.pauta_id).run();
        await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)").bind('Assinar', `Doc #${hash.slice(0,8)}`, 'assinatura').run();
      }
      return json({ success: true, signed_at: new Date().toISOString() });
    }

    // GET /custos
    if (path === '/custos' && method === 'GET') {
      const ano = url.searchParams.get('ano') || new Date().getFullYear();
      const { results } = await env.DB.prepare('SELECT * FROM custos WHERE ano = ? ORDER BY mes').bind(ano).all();
      return json({ success: true, result: results });
    }

    // POST /custos
    if (path === '/custos' && method === 'POST') {
      const b = await request.json();
      const r = await env.DB.prepare('INSERT INTO custos (ano,mes,empresa,cat,desc,qtd,val,total) VALUES (?,?,?,?,?,?,?,?)')
        .bind(b.ano,b.mes,b.empresa,b.cat,b.desc,b.qtd||1,b.val||0,(b.qtd||1)*(b.val||0)).run();
      return json({ success: true, id: r.meta.last_row_id });
    }

    // GET /logs
    if (path === '/logs' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 200').all();
      return json({ success: true, result: results });
    }

    // GET /status — health check
    if (path === '/status') {
      return json({ success: true, version: 'graal-api-v1', ts: new Date().toISOString() });
    }

    return json({ error: 'Rota não encontrada: ' + path }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export default { fetch: handleRequest };
