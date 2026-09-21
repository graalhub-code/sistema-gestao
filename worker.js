const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-GRAAL-Token',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status, headers: { 'Content-Type': 'text/html;charset=utf-8', ...CORS },
  });
}

// Auth — token de usuário OU token de sync da planilha
function isAuth(request) {
  const auth = request.headers.get('Authorization') || '';
  const graal = request.headers.get('X-GRAAL-Token') || '';
  const t = auth.replace('Bearer ', '');
  return ['jp2026', 'maysa2026', 'graal2026'].includes(t) || graal === 'graal-sync-2026';
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;

  // ── Rotas públicas (sem auth) ──────────────────────────────────
  // Página pública de assinatura — #37
  if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+$/) && method === 'GET' && !request.headers.get('Authorization')) {
    const hash = path.split('/')[2];
    const row = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash = ?').bind(hash).first();
    if (!row) return html(paginaErro('Documento não encontrado'), 404);
    const pauta = row.pauta_id
      ? await env.DB.prepare('SELECT * FROM pautas WHERE id = ?').bind(row.pauta_id).first()
      : null;
    return html(paginaAssinatura(row, pauta));
  }

  // POST assinatura (cliente assina)
  if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+\/sign$/) && method === 'POST') {
    const hash = path.split('/')[2];
    const body = await request.json().catch(() => ({}));
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '?';
    const ua = request.headers.get('User-Agent') || '';
    if (!body.nome) return json({ error: 'Nome obrigatório' }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE assinaturas SET nome_assinante=?,ip_assinante=?,user_agent=?,signed_at=?,status='assinado' WHERE doc_hash=?"
    ).bind(body.nome, ip, ua.slice(0,200), now, hash).run();
    const doc = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash=?').bind(hash).first();
    if (doc?.pauta_id) {
      await env.DB.prepare(
        "UPDATE pautas SET pp_pi_status='assinado',pp_pi_signed_at=?,pp_pi_signed_name=?,pp_pi_signed_ip=? WHERE id=?"
      ).bind(now, body.nome, ip, doc.pauta_id).run();
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)")
        .bind('Assinatura', 'Doc #'+hash.slice(0,8)+' assinado por '+body.nome, 'assinatura').run();
    }
    return json({ success: true, signed_at: now });
  }

  // ── Rotas autenticadas ─────────────────────────────────────────
  if (!isAuth(request)) return json({ error: 'Não autorizado' }, 401);

  try {
    // GET /status
    if (path === '/status') {
      const cnt = await env.DB.prepare('SELECT COUNT(*) as n FROM pautas').first();
      return json({ success: true, version: 'graal-api-v2', ts: new Date().toISOString(), pautas: cnt?.n || 0 });
    }

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

    // GET /pautas/all
    if (path === '/pautas/all' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM pautas ORDER BY ano DESC, id DESC').all();
      return json({ success: true, result: results });
    }

    // POST /pautas
    if (path === '/pautas' && method === 'POST') {
      const b = await request.json();
      const r = await env.DB.prepare(
        'INSERT INTO pautas (ano,mes,empresa,cliente,veiculo,campanha,tipo,bruto,hon,st,st_fin,obs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(b.ano,b.mes,b.empresa||'GRAAL.hub',b.cli||b.cliente||'',b.vei||b.veiculo||'',
             b.camp||b.campanha||'',b.tipo||'',b.bruto||0,b.hon||0,
             b.st||'Em aberto',b.st_fin||'Em aberto',b.obs||'').run();
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)").bind('Criar','Pauta: '+(b.cli||b.cliente||''),'pauta').run();
      return json({ success: true, id: r.meta.last_row_id });
    }

    // PUT /pautas/:id
    if (path.match(/^\/pautas\/\d+$/) && method === 'PUT') {
      const id = path.split('/')[2];
      const b = await request.json();
      const fields = Object.keys(b).filter(k => k !== 'id' && k !== '_new');
      if (!fields.length) return json({ success: true });
      const sets = fields.map(f => `${f} = ?`).join(', ');
      const vals = fields.map(f => b[f]);
      await env.DB.prepare(`UPDATE pautas SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...vals, id).run();
      return json({ success: true });
    }

    // GET /doc/:hash (autenticado — retorna dados JSON)
    if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+$/) && method === 'GET') {
      const hash = path.split('/')[2];
      const doc = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash = ?').bind(hash).first();
      if (!doc) return json({ error: 'Não encontrado' }, 404);
      const pauta = doc.pauta_id
        ? await env.DB.prepare('SELECT * FROM pautas WHERE id = ?').bind(doc.pauta_id).first()
        : null;
      return json({ success: true, doc, pauta });
    }

    // POST /doc/:hash/create — registrar documento pendente
    if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+\/create$/) && method === 'POST') {
      const hash = path.split('/')[2];
      const b = await request.json();
      await env.DB.prepare(
        'INSERT OR IGNORE INTO assinaturas (pauta_id,doc_tipo,doc_num,doc_hash,status) VALUES (?,?,?,?,?)'
      ).bind(b.pauta_id||null, b.doc_tipo||'PP', b.doc_num||0, hash, 'pendente').run();
      return json({ success: true, hash });
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
      const r = await env.DB.prepare(
        'INSERT INTO custos (ano,mes,empresa,cat,desc,qtd,val,total) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(b.ano,b.mes,b.empresa||'GRAAL.hub',b.cat||'',b.desc||'',b.qtd||1,b.val||0,(b.qtd||1)*(b.val||0)).run();
      return json({ success: true, id: r.meta.last_row_id });
    }

    // GET /logs
    if (path === '/logs' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 200').all();
      return json({ success: true, result: results });
    }

    // POST /sync/planilha — #39 webhook Apps Script
    if (path === '/sync/planilha' && method === 'POST') {
      const b = await request.json();
      const rows = Array.isArray(b.rows) ? b.rows : [];
      let inserted = 0;
      for (const p of rows.slice(0, 200)) {
        if (!p.cli && !p.cliente) continue;
        const r = await env.DB.prepare(
          'INSERT OR IGNORE INTO pautas (ano,mes,empresa,cliente,veiculo,campanha,tipo,bruto,hon,st_fin) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).bind(p.ano||2026,p.mes||'Set','GRAAL.hub',
               (p.cli||p.cliente||'').slice(0,200),
               (p.vei||p.veiculo||'').slice(0,200),
               (p.camp||p.campanha||'').slice(0,300),
               (p.tipo||'').slice(0,50),
               parseFloat(p.bruto||0),parseFloat(p.hon||0),
               p.st||'Em aberto').run();
        inserted += r.meta.changes || 0;
      }
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)")
        .bind('Sync','Planilha: '+inserted+' novas','sync').run();
      return json({ success: true, inserted, total: rows.length });
    }

    return json({ error: 'Rota não encontrada: ' + path }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── #37 Página pública de assinatura ─────────────────────────────
function paginaAssinatura(doc, pauta) {
  const assinado = doc.status === 'assinado';
  const tipo = doc.doc_tipo || 'PP';
  const num  = String(doc.doc_num || '').padStart(3, '0');
  const cli  = pauta?.cliente || '—';
  const camp = pauta?.campanha || '—';
  const bruto = pauta?.bruto ? 'R$ '+Number(pauta.bruto).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
  const hon   = pauta?.hon   ? 'R$ '+Number(pauta.hon).toLocaleString('pt-BR',{minimumFractionDigits:2})   : '—';
  const mes   = pauta ? (pauta.mes+'/'+pauta.ano) : '—';
  const hash  = doc.doc_hash;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GRAAL.hub — ${tipo} ${num}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .doc{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;max-width:580px;width:100%;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .logo{display:flex;align-items:center;gap:10px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #2a2a2a}
  .logo-mark{width:36px;height:36px;background:linear-gradient(135deg,#E04030,#ff6b5b);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}
  .logo-name{font-size:16px;font-weight:700;color:#fff}
  .logo-sub{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px}
  .tipo-badge{display:inline-block;background:rgba(224,64,48,.15);color:#E04030;border:1px solid rgba(224,64,48,.3);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:8px}
  h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:4px}
  .sub{font-size:12px;color:#888;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
  .field label{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px}
  .field span{font-size:13px;color:#e8e8e8;font-weight:500}
  .sep{border:none;border-top:1px solid #2a2a2a;margin:20px 0}
  .texto-legal{font-size:11px;color:#666;line-height:1.7;margin-bottom:24px}
  .form-group{margin-bottom:14px}
  .form-group label{font-size:11px;color:#999;display:block;margin-bottom:6px}
  .form-group input{width:100%;background:#111;border:1px solid #333;border-radius:8px;color:#e8e8e8;font-size:14px;padding:10px 12px;outline:none;font-family:inherit;transition:border-color .2s}
  .form-group input:focus{border-color:#E04030}
  .btn-assinar{width:100%;background:linear-gradient(135deg,#E04030,#c0302a);color:#fff;border:none;border-radius:10px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .2s}
  .btn-assinar:hover{opacity:.9}
  .btn-assinar:disabled{opacity:.4;cursor:not-allowed}
  .success{background:rgba(43,182,115,.1);border:1px solid rgba(43,182,115,.3);border-radius:10px;padding:20px;text-align:center}
  .success .icon{font-size:36px;margin-bottom:8px}
  .success h2{color:#2BB673;font-size:16px;margin-bottom:6px}
  .success p{font-size:12px;color:#888;line-height:1.6}
  .error-msg{color:#E04030;font-size:11px;margin-top:6px;display:none}
  @media(max-width:480px){.grid{grid-template-columns:1fr}.doc{padding:20px}}
</style>
</head>
<body>
<div class="doc">
  <div class="logo">
    <div class="logo-mark">G</div>
    <div><div class="logo-name">GRAAL.hub</div><div class="logo-sub">Agência de Publicidade</div></div>
  </div>

  <div class="tipo-badge">${tipo} ${num}</div>
  <h1>${tipo === 'PP' ? 'Pedido de Produção' : 'Pedido de Inserção'}</h1>
  <p class="sub">${mes}</p>

  <div class="grid">
    <div class="field"><label>Cliente</label><span>${cli}</span></div>
    <div class="field"><label>Campanha</label><span>${camp}</span></div>
    <div class="field"><label>R$ Bruto</label><span>${bruto}</span></div>
    <div class="field"><label>R$ Honorários GRAAL.hub</label><span>${hon}</span></div>
  </div>

  <hr class="sep">
  <p class="texto-legal">Este ${tipo === 'PP' ? 'Pedido de Produção' : 'Pedido de Inserção'} foi elaborado em conformidade com as condições acordadas entre as partes. A assinatura deste documento confirma a aprovação integral do escopo, valores e prazos descritos acima. Após assinatura, o cliente autoriza formalmente a GRAAL.hub a executar os serviços e/ou realizar os investimentos especificados, comprometendo-se ao pagamento nas condições estabelecidas.</p>
  <hr class="sep">

  ${assinado ? `
  <div class="success">
    <div class="icon">✅</div>
    <h2>Documento assinado</h2>
    <p>Assinado por <strong>${doc.nome_assinante||'—'}</strong><br>
    em ${doc.signed_at ? new Date(doc.signed_at).toLocaleString('pt-BR') : '—'}<br>
    IP: ${doc.ip_assinante||'—'}</p>
  </div>
  ` : `
  <div id="formArea">
    <div class="form-group">
      <label>Seu nome completo *</label>
      <input type="text" id="nomeInp" placeholder="Digite seu nome completo como deseja que conste" autocomplete="name">
      <div class="error-msg" id="errMsg">Por favor, informe seu nome completo.</div>
    </div>
    <button class="btn-assinar" id="btnAssinar" onclick="assinar()">
      ✍&nbsp; Assinar este documento
    </button>
    <p style="font-size:10px;color:#555;text-align:center;margin-top:12px;">Ao assinar, você confirma que leu e concorda com os termos acima. Seu IP e data/hora serão registrados como evidência.</p>
  </div>
  <div id="successArea" style="display:none">
    <div class="success">
      <div class="icon">✅</div>
      <h2>Documento assinado com sucesso!</h2>
      <p id="successMsg"></p>
    </div>
  </div>
  <script>
  async function assinar() {
    const nome = document.getElementById('nomeInp').value.trim();
    const err  = document.getElementById('errMsg');
    const btn  = document.getElementById('btnAssinar');
    if (!nome) { err.style.display='block'; return; }
    err.style.display='none';
    btn.disabled=true; btn.textContent='Registrando...';
    try {
      const r = await fetch(window.location.href.replace(/\\/$/, '')+'/sign', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({nome})
      });
      const d = await r.json();
      if (d.success) {
        document.getElementById('formArea').style.display='none';
        document.getElementById('successArea').style.display='block';
        const dt = new Date(d.signed_at).toLocaleString('pt-BR');
        document.getElementById('successMsg').innerHTML =
          'Assinado por <strong>'+nome+'</strong><br>em '+dt+'.';
      } else {
        btn.disabled=false; btn.textContent='✍ Assinar este documento';
        alert('Erro: '+(d.error||'Tente novamente'));
      }
    } catch(e) {
      btn.disabled=false; btn.textContent='✍ Assinar este documento';
      alert('Erro de conexão. Tente novamente.');
    }
  }
  </script>
  `}
</div>
</body>
</html>`;
}

function paginaErro(msg) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>GRAAL.hub</title>
  <style>body{font-family:sans-serif;background:#0f0f0f;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
  h1{color:#E04030;margin-bottom:8px}p{color:#888;font-size:14px}</style></head>
  <body><div><h1>Documento não encontrado</h1><p>${msg}</p><p style="margin-top:16px;font-size:12px;color:#555">GRAAL.hub — Sistema de Gestão</p></div></body></html>`;
}

export default { fetch: handleRequest };
