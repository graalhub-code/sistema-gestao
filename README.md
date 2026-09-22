# GRAAL.hub — Sistema de Gestão

Sistema de gestão de demandas e faturamento da agência GRAAL.hub.
HTML standalone com backend em nuvem — abre no browser, funciona offline com fallback para `localStorage`.

---

## URLs de produção

| | URL | Observação |
|---|---|---|
| **Sistema** | https://app.graalhub.com | URL principal |
| **Alias** | https://sistema.graalhub.com | Mesmo destino |
| **Assinaturas PP/PI** | https://doc.graalhub.com | Links enviados ao cliente |
| **API status** | https://doc.graalhub.com/api/status | Worker graal-api-v3 |
| **Site institucional** | https://graalhub.com | Vercel — **não tocar** |

### Como acessar o sistema
1. Abra https://app.graalhub.com
2. O sistema carrega direto (login temporariamente desativado — ver #54)
3. Para conectar à API: Configurações → Conexão em Nuvem → token `jp2026` ou `maysa2026`

---

## Arquitetura

```
Browser (sistema-gestao.html)
    ↕ fetch / Authorization: Bearer <token>
Cloudflare Worker graal-api-v3  (doc.graalhub.com)
    ↕ D1 SQL
Cloudflare D1 graal-sistema-gestao
    ↕ INSERT OR IGNORE
Planilha Google Drive (fonte verdade durante transição — ver #50)
    ↑ Apps Script onChange trigger
```

**Fallback offline:** dados ficam em `localStorage` e sincronizam ao reconectar.

---

## Cloudflare Pages — projetos (não confundir)

| Projeto Pages | Domínio | Pode fazer deploy? |
|---|---|---|
| `graal-sistema-gestao` | app.graalhub.com | ✅ Sim |
| `graalhub` | www.graalhub.com (site institucional) | ❌ Não tocar |

> Fazer deploy no projeto `graalhub` derruba o site institucional. Ver #51.

---

## Estrutura do repositório

```
sistema-gestao.html   ← sistema completo (HTML + CSS + JS, ~1.7 MB)
worker.js             ← Cloudflare Worker graal-api-v3
wrangler.toml         ← config Workers + D1
apps_script.gs        ← Google Apps Script (trigger onChange na planilha)
CONTRIBUTING.md       ← guia para desenvolvedores
```

---

## Como gerar um build

O sistema é um único arquivo HTML. Sempre partir do v19 (âncora imutável):

```python
with open("GRL_prototipo_20260627_v19.html", "r") as f: h19 = f.read()

js   = h19[main_e19:main_end19]   # JS puro
body = h19[:cdn_s19]               # body com as 17 telas

HTML = body + cdn + "<script>\n" + js + "\n</script>\n</body>\n</html>"
```

### Checklist antes de salvar

- [ ] `node --check sistema-gestao.html` sem erros
- [ ] Todas as 17 tags `<div id="sc-*">` têm `<div` antes do `id=` (nunca `id=` solto)
- [ ] Zero IDs duplicados no HTML
- [ ] `CUSTOS`, `OR`, `LOGS`, `DRAFTS`, `INVESTIMENTOS` declarados com `let` (não `const`)
- [ ] `const AUTH_USERS` declarada **antes** da IIFE `(function(){...})()`
- [ ] Canvas e divs de dados posicionados **depois** dos controles em cada tela
- [ ] `populaAnos()` chamada no init e após `syncFromAPI()`

---

## Dados

- **D1:** 1.294 pautas (Set/2026) — sincronizadas com a planilha Google Drive
- **Planilha Drive:** `1Sdgm1PBJWDi3xsh-Vsa9rrIsj8ScVnHQfRovN0IMObI` — fonte verdade durante transição
- Sócios: João Paulo 51% · Maysa Feitosa 49%
- Reserva de Sócios: 15% dos honorários pagos a partir de Jul/2026
- Custos mensais: R$ 14.331,10/mês (Jun–Dez/2026)

---

## API Endpoints

Base: `https://doc.graalhub.com/api` · Auth: `Authorization: Bearer <token>`

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| GET | `/status` | ✅ | Health check + contagem D1 |
| GET | `/pautas?ano=2026&mes=Set` | ✅ | Listar pautas por período |
| GET | `/pautas/all` | ✅ | Histórico completo |
| POST | `/pautas` | ✅ | Criar pauta |
| PUT | `/pautas/:id` | ✅ | Editar pauta |
| GET | `/doc/:hash` | público | Visualizar PP/PI (página HTML) |
| POST | `/doc/:hash/sign` | público | Assinar documento + email automático |
| POST | `/doc/:hash/create` | ✅ | Registrar documento pendente |
| GET | `/custos?ano=2026` | ✅ | Custos mensais |
| GET | `/logs` | ✅ | Log de atividades |
| POST | `/sync/planilha` | X-GRAAL-Token | Receber pautas do Apps Script |

Tokens válidos: `jp2026` (João Paulo) · `maysa2026` (Maysa)

---

## Sincronização planilha → D1

O Apps Script instalado na planilha detecta edições e chama `POST /api/sync/planilha` automaticamente.
Para sync manual: **Configurações → Sync Planilha** no próprio sistema.
Estratégia: `INSERT OR IGNORE` — nunca duplica, nunca apaga da planilha.

---

## Fluxo de issues

Todo bug, decisão ou aprendizado vira uma issue na hora — não se anota para organizar depois.

```
Encontrou algo → abre issue com status: em-aberto + área: X (GRAAL.hub)
Commit parcial → Refs #N na mensagem
Commit resolve → Closes #N na mensagem (GitHub fecha automaticamente)
README desatualizado → atualiza no mesmo commit ou abre issue de aprendizado
```

Consultar pendências: `is:issue is:open label:"status: em-aberto"`

---

## Issues abertas

- [ ] #42 — [DNS] graalhub.com.br — configurar no registrador de domínio
- [ ] #44 — [Segurança] Tokens hardcoded em repositório público
- [ ] #50 — [Arquitetura] Coexistência planilha / D1 durante transição
- [ ] #54 — [Auth] Login implementado e temporariamente desativado
