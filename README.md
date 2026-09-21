# GRAAL.hub — Sistema de Gestão

Sistema de gestão de demandas e faturamento para a agência GRAAL.hub.
HTML standalone com backend em nuvem — abre no browser, funciona offline com fallback.

---

## 🌐 Sistema em produção

| | URL |
|---|---|
| **Sistema** | https://graal-sistema-gestao.pages.dev |
| **API** | https://graal-api.graal-hub.workers.dev/api/status |
| **Banco D1** | graal-sistema-gestao (Cloudflare) |

### Como acessar
1. Abra https://graal-sistema-gestao.pages.dev
2. Vá em **Configurações → Conexão em Nuvem**
3. João Paulo digita `jp2026` · Maysa digita `maysa2026`
4. Clique Conectar — dados sincronizam automaticamente

---

## Arquitetura

```
Browser (sistema-gestao.html)
    ↕ fetch
Cloudflare Workers (graal-api.graal-hub.workers.dev)
    ↕ SQL
Cloudflare D1 (graal-sistema-gestao)
```

**Fallback offline:** quando sem conexão, dados ficam no `localStorage` e sincronizam ao reconectar.

---

## Estrutura do projeto

```
sistema-gestao.html   ← sistema completo (HTML + CSS + JS)
worker.js             ← API Cloudflare Workers
wrangler.toml         ← config Workers + D1
CONTRIBUTING.md       ← guia para desenvolvedores
```

---

## Como gerar um build

```python
# Sempre partir do v19 limpo
with open("GRL_prototipo_20260627_v19.html", "r") as f: h19 = f.read()

# Extrair
js   = h19[main_e19:main_end19]  # JS puro — 340.929 chars
body = h19[:cdn_s19]              # body puro — 17 telas

# Montar
HTML = body + cdn + "<script>
" + js + "
</script>
</body>
</html>"
```

---

## Checklist antes de salvar

- [ ] `node --check` sem erros
- [ ] `CUSTOS` declarado 1x
- [ ] Zero IDs duplicados
- [ ] 17 telas no body
- [ ] `LOGS` e `DRAFTS` como `let`

---

## Dados

- **1.008 pautas históricas** (2022–2026)
- **42 lançamentos de custos** pré-carregados (Jun–Dez/2026) — R$ 14.331,10/mês
- Sócios: João Paulo 51% · Maysa Feitosa 49%
- Reserva de Sócios: 15% dos honorários pagos a partir de Jul/2026

---

## API Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/status` | Health check |
| GET | `/api/pautas?ano=2026&mes=Set` | Listar pautas |
| GET | `/api/pautas/all` | Histórico completo |
| POST | `/api/pautas` | Criar pauta |
| PUT | `/api/pautas/:id` | Editar pauta |
| GET | `/api/doc/:hash` | Visualizar PP/PI |
| POST | `/api/doc/:hash/sign` | Assinar documento |
| GET | `/api/custos` | Custos mensais |
| GET | `/api/logs` | Log de atividades |

---

## Fluxo de trabalho com issues

- `Closes #N` no commit → GitHub fecha a issue automaticamente
- `Refs #N` → progresso parcial, issue continua aberta
- Atualizar README no mesmo commit da mudança

## Issues abertas

- [ ] #28 — Telas incompletas: Sócios, Investimentos, Calendário
- [ ] #29 — Validação das 1.008 pautas históricas

