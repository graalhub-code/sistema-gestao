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

function isAuth(req) {
  const t = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const g = req.headers.get('X-GRAAL-Token') || '';
  return ['jp2026', 'maysa2026', 'graal2026'].includes(t) || g === 'graal-sync-2026';
}

// ── Email via MailChannels (gratuito no Cloudflare Workers) ─────────
async function sendEmail(to, subject, html) {
  const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'noreply@graalhub.com', name: 'GRAAL.hub' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  return resp.ok;
}

function emailAssinaturaTemplate(doc, pauta) {
  const tipo = doc.doc_tipo || 'PP';
  const num  = String(doc.doc_num || '').padStart(3, '0');
  const cli  = pauta?.cliente || '—';
  const camp = pauta?.campanha || '—';
  const dt   = doc.signed_at ? new Date(doc.signed_at).toLocaleString('pt-BR') : '—';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,sans-serif;background:#f5f5f5;padding:20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:linear-gradient(135deg,#E04030,#c0302a);padding:20px 24px;display:flex;align-items:center;gap:10px;">
      <div style="width:32px;height:32px;background:rgba(255,255,255,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:14px;">G</div>
      <span style="color:#fff;font-weight:700;font-size:15px;">GRAAL.hub</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 4px;color:#111;font-size:16px;">✍ Documento Assinado</h2>
      <p style="margin:0 0 20px;color:#888;font-size:12px;">${tipo} ${num} foi assinado com sucesso</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #f0f0f0;">Cliente</td><td style="padding:8px 0;color:#111;font-weight:600;border-bottom:1px solid #f0f0f0;">${cli}</td></tr>
        <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #f0f0f0;">Campanha</td><td style="padding:8px 0;color:#111;border-bottom:1px solid #f0f0f0;">${camp}</td></tr>
        <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #f0f0f0;">Assinado por</td><td style="padding:8px 0;color:#111;font-weight:600;border-bottom:1px solid #f0f0f0;">${doc.nome_assinante || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #f0f0f0;">Data/Hora</td><td style="padding:8px 0;color:#111;border-bottom:1px solid #f0f0f0;">${dt}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">IP</td><td style="padding:8px 0;color:#111;">${doc.ip_assinante || '—'}</td></tr>
      </table>
      <div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:8px;font-size:11px;color:#888;">
        Este é um e-mail automático gerado pelo sistema GRAAL.hub. O documento foi assinado eletronicamente com validade legal.
      </div>
    </div>
  </div>
</body></html>`;
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;

  // ── Rotas públicas ─────────────────────────────────────────
  // Página de assinatura
  if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+$/) && method === 'GET' && !request.headers.get('Authorization')) {
    const hash = path.split('/')[2];
    const row = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash = ?').bind(hash).first();
    if (!row) return new Response(paginaErro('Documento não encontrado'), { status: 404, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    const pauta = row.pauta_id ? await env.DB.prepare('SELECT * FROM pautas WHERE id = ?').bind(row.pauta_id).first() : null;
    return new Response(paginaAssinatura(row, pauta), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  // Assinar documento (público)
  if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+\/sign$/) && method === 'POST') {
    const hash = path.split('/')[2];
    const body = await request.json().catch(() => ({}));
    const ip = request.headers.get('CF-Connecting-IP') || '?';
    const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
    if (!body.nome) return json({ error: 'Nome obrigatório' }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE assinaturas SET nome_assinante=?,ip_assinante=?,user_agent=?,signed_at=?,status='assinado' WHERE doc_hash=?"
    ).bind(body.nome, ip, ua, now, hash).run();
    const doc = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash=?').bind(hash).first();
    let pauta = null;
    if (doc?.pauta_id) {
      await env.DB.prepare(
        "UPDATE pautas SET pp_pi_status='assinado',pp_pi_signed_at=?,pp_pi_signed_name=?,pp_pi_signed_ip=? WHERE id=?"
      ).bind(now, body.nome, ip, doc.pauta_id).run();
      pauta = await env.DB.prepare('SELECT * FROM pautas WHERE id=?').bind(doc.pauta_id).first();
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)")
        .bind('Assinatura', doc.doc_tipo+' assinado por '+body.nome, 'assinatura').run();
    }
    // Enviar e-mail de notificação para JP e Maysa
    const docAtualizado = { ...doc, nome_assinante: body.nome, ip_assinante: ip, signed_at: now };
    const emailHtml = emailAssinaturaTemplate(docAtualizado, pauta);
    const subject = `✍ ${doc?.doc_tipo||'PP'} assinado — ${pauta?.cliente || 'Cliente'}`;
    await Promise.allSettled([
      sendEmail('joao@graalhub.com', subject, emailHtml),
      sendEmail('maysa@graalhub.com', subject, emailHtml),
    ]);
    return json({ success: true, signed_at: now });
  }

  // ── Rotas autenticadas ─────────────────────────────────────
  if (!isAuth(request)) return json({ error: 'Não autorizado' }, 401);

  try {
    if (path === '/status') {
      const cnt = await env.DB.prepare('SELECT COUNT(*) as n FROM pautas').first();
      return json({ success: true, version: 'graal-api-v3', ts: new Date().toISOString(), pautas: cnt?.n || 0 });
    }

    if (path === '/pautas' && method === 'GET') {
      const ano = url.searchParams.get('ano') || new Date().getFullYear();
      const mes = url.searchParams.get('mes') || '';
      let sql = 'SELECT * FROM pautas WHERE ano = ?'; const params = [ano];
      if (mes) { sql += ' AND mes = ?'; params.push(mes); }
      sql += ' ORDER BY id DESC';
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      return json({ success: true, result: results });
    }

    if (path === '/pautas/all' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM pautas ORDER BY ano DESC, id DESC').all();
      return json({ success: true, result: results });
    }

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

    if (path.match(/^\/pautas\/\d+$/) && method === 'PUT') {
      const id = path.split('/')[2];
      const b = await request.json();
      const fields = Object.keys(b).filter(k => k !== 'id' && k !== '_new');
      if (!fields.length) return json({ success: true });
      const sets = fields.map(f => `${f} = ?`).join(', ');
      await env.DB.prepare(`UPDATE pautas SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...fields.map(f => b[f]), id).run();
      return json({ success: true });
    }

    if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+$/) && method === 'GET') {
      const hash = path.split('/')[2];
      const doc = await env.DB.prepare('SELECT * FROM assinaturas WHERE doc_hash = ?').bind(hash).first();
      if (!doc) return json({ error: 'Não encontrado' }, 404);
      const pauta = doc.pauta_id ? await env.DB.prepare('SELECT * FROM pautas WHERE id = ?').bind(doc.pauta_id).first() : null;
      return json({ success: true, doc, pauta });
    }

    if (path.match(/^\/doc\/[a-zA-Z0-9_=\-]+\/create$/) && method === 'POST') {
      const hash = path.split('/')[2];
      const b = await request.json();
      await env.DB.prepare(
        'INSERT OR IGNORE INTO assinaturas (pauta_id,doc_tipo,doc_num,doc_hash,status) VALUES (?,?,?,?,?)'
      ).bind(b.pauta_id||null, b.doc_tipo||'PP', b.doc_num||0, hash, 'pendente').run();
      return json({ success: true, hash });
    }

    if (path === '/custos' && method === 'GET') {
      const ano = url.searchParams.get('ano') || new Date().getFullYear();
      const { results } = await env.DB.prepare('SELECT * FROM custos WHERE ano = ? ORDER BY mes').bind(ano).all();
      return json({ success: true, result: results });
    }

    if (path === '/custos' && method === 'POST') {
      const b = await request.json();
      const r = await env.DB.prepare(
        'INSERT INTO custos (ano,mes,empresa,cat,desc,qtd,val,total) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(b.ano,b.mes,b.empresa||'GRAAL.hub',b.cat||'',b.desc||'',b.qtd||1,b.val||0,(b.qtd||1)*(b.val||0)).run();
      return json({ success: true, id: r.meta.last_row_id });
    }

    if (path === '/logs' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 200').all();
      return json({ success: true, result: results });
    }

    if (path === '/sync/planilha' && method === 'POST') {
      const b = await request.json();
      const rows = Array.isArray(b.rows) ? b.rows : [];
      let inserted = 0;
      for (const p of rows.slice(0, 200)) {
        if (!p.cli && !p.cliente) continue;
        const r = await env.DB.prepare(
          'INSERT OR IGNORE INTO pautas (ano,mes,empresa,cliente,veiculo,campanha,tipo,bruto,hon,st_fin) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).bind(p.ano||2026,p.mes||'Set','GRAAL.hub',(p.cli||p.cliente||'').slice(0,200),
               (p.vei||p.veiculo||'').slice(0,200),(p.camp||p.campanha||'').slice(0,300),
               (p.tipo||'').slice(0,50),parseFloat(p.bruto||0),parseFloat(p.hon||0),p.st||'Em aberto').run();
        inserted += r.meta.changes || 0;
      }
      await env.DB.prepare("INSERT INTO logs (acao,item,tipo) VALUES (?,?,?)").bind('Sync','Planilha: '+inserted+' novas','sync').run();
      return json({ success: true, inserted, total: rows.length });
    }

    return json({ error: 'Rota não encontrada: ' + path }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── Páginas HTML ───────────────────────────────────────────────
function paginaAssinatura(doc, pauta) {
  const assinado = doc.status === 'assinado';
  const tipo = doc.doc_tipo || 'PP';
  const num  = String(doc.doc_num || '').padStart(3, '0');
  const brl  = v => v ? 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GRAAL.hub — ${tipo} ${num}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.doc{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;max-width:560px;width:100%;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #2a2a2a}
.lm{width:36px;height:36px;background:linear-gradient(135deg,#E04030,#ff6b5b);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}
h1{font-size:19px;font-weight:700;color:#fff;margin-bottom:4px}
.sub{font-size:11px;color:#888;margin-bottom:20px}
.badge-tipo{display:inline-block;background:rgba(224,64,48,.15);color:#E04030;border:1px solid rgba(224,64,48,.3);border-radius:6px;padding:2px 9px;font-size:11px;font-weight:700;margin-bottom:10px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.f label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px}
.f span{font-size:13px;color:#e8e8e8;font-weight:500}
hr{border:none;border-top:1px solid #2a2a2a;margin:18px 0}
.legal{font-size:11px;color:#555;line-height:1.8;margin-bottom:20px}
.finp{width:100%;background:#111;border:1px solid #333;border-radius:8px;color:#e8e8e8;font-size:14px;padding:10px 12px;outline:none;font-family:inherit;transition:border-color .2s;margin-bottom:14px}
.finp:focus{border-color:#E04030}
.btn-a{width:100%;background:linear-gradient(135deg,#E04030,#c0302a);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
.btn-a:hover{opacity:.9}.btn-a:disabled{opacity:.4;cursor:not-allowed}
.ok{background:rgba(43,182,115,.1);border:1px solid rgba(43,182,115,.3);border-radius:10px;padding:18px;text-align:center}
.ok h2{color:#2BB673;font-size:15px;margin-bottom:6px}
.ok p{font-size:11px;color:#666;line-height:1.7}
.err{color:#E04030;font-size:11px;margin-bottom:10px;display:none}
@media(max-width:460px){.grid{grid-template-columns:1fr}.doc{padding:20px}}</style>
</head><body><div class="doc">
  <div class="logo"><div class="lm">G</div>
    <div><div style="font-size:15px;font-weight:700;color:#fff;">GRAAL.hub</div>
    <div style="font-size:10px;color:#555;">Agência de Publicidade · Salvador/BA</div></div></div>
  <div class="badge-tipo">${tipo} ${num}</div>
  <h1>${tipo === 'PP' ? 'Pedido de Produção' : 'Pedido de Inserção'}</h1>
  <p class="sub">${(pauta?.mes||'—')}/${(pauta?.ano||'—')}</p>
  <div class="grid">
    <div class="f"><label>Cliente</label><span>${pauta?.cliente||'—'}</span></div>
    <div class="f"><label>Campanha</label><span>${pauta?.campanha||'—'}</span></div>
    <div class="f"><label>R$ Bruto</label><span>${brl(pauta?.bruto)}</span></div>
    <div class="f"><label>Honorários GRAAL.hub</label><span>${brl(pauta?.hon)}</span></div>
  </div>
  <hr>
  <p class="legal">Este ${tipo === 'PP' ? 'Pedido de Produção' : 'Pedido de Inserção'} foi elaborado em conformidade com as condições acordadas entre as partes. A assinatura confirma aprovação integral do escopo, valores e prazos descritos acima. Após assinatura, o cliente autoriza a GRAAL.hub a executar os serviços especificados, comprometendo-se ao pagamento nas condições estabelecidas.</p>
  <hr>
  ${assinado ? `<div class="ok"><div style="font-size:32px;margin-bottom:8px;">✅</div>
    <h2>Documento assinado</h2>
    <p>Assinado por <strong>${doc.nome_assinante||'—'}</strong><br>
    em ${doc.signed_at ? new Date(doc.signed_at).toLocaleString('pt-BR') : '—'}<br>
    IP: ${doc.ip_assinante||'—'}</p></div>` :
  `<div id="fa"><label style="font-size:11px;color:#666;display:block;margin-bottom:6px;">Seu nome completo *</label>
    <input class="finp" type="text" id="nm" placeholder="Digite seu nome como deseja que conste" autocomplete="name">
    <div class="err" id="er">Por favor, informe seu nome completo.</div>
    <button class="btn-a" id="ba" onclick="assinar()">✍&nbsp; Assinar este documento</button>
    <p style="font-size:10px;color:#444;text-align:center;margin-top:12px;">Ao assinar, você concorda com os termos acima. Seu IP e data/hora serão registrados.</p>
  </div>
  <div id="sa" style="display:none"><div class="ok"><div style="font-size:32px;margin-bottom:8px;">✅</div>
    <h2>Assinado com sucesso!</h2><p id="sm"></p></div></div>
  <script>
  async function assinar(){
    const nm=document.getElementById('nm').value.trim();
    const er=document.getElementById('er'); const ba=document.getElementById('ba');
    if(!nm){er.style.display='block';return;} er.style.display='none';
    ba.disabled=true; ba.textContent='Registrando...';
    try{
      const r=await fetch(location.href.replace(/\\/$/','')+'/sign',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nm})});
      const d=await r.json();
      if(d.success){
        document.getElementById('fa').style.display='none';
        document.getElementById('sa').style.display='block';
        document.getElementById('sm').innerHTML='Assinado por <strong>'+nm+'</strong><br>em '+new Date(d.signed_at).toLocaleString('pt-BR')+'.';
      } else { ba.disabled=false; ba.textContent='✍ Assinar'; alert('Erro: '+(d.error||'Tente novamente')); }
    } catch(e){ ba.disabled=false; ba.textContent='✍ Assinar'; alert('Erro de conexão.'); }
  }
  </script>`}
</div></body></html>`;
}

function paginaErro(msg) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>GRAAL.hub</title>
  <style>body{font-family:sans-serif;background:#0f0f0f;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
  h1{color:#E04030;margin-bottom:8px}p{color:#888;font-size:13px}</style></head>
  <body><div><h1>Documento não encontrado</h1><p>${msg}</p></div></body></html>`;
}

export default { fetch: handleRequest };
