# GRAAL.hub — Sistema de Gestão

Sistema de gestão de demandas e faturamento para a agência GRAAL.hub.
HTML standalone — abre no browser, funciona offline, zero infraestrutura.

---

## Estrutura do projeto

```
outputs/
  GRL_prototipo_20260628_v19.html  ← base imutável (nunca editar)
  GRL_prototipo_20260628_v20.html  ← versão atual em produção
```

**v19** é a âncora de todos os builds. Qualquer sessão de patch extrai JS e body diretamente do v19, nunca do arquivo salvo.

---

## Como gerar um build

```python
# 1. Extrair do v19 limpo
js   = h19[main_e19:main_end19]   # JS puro — 340.929 chars
body = h19[:cdn_s19]               # body puro — 1.364.235 chars, 17 telas

# 2. Aplicar patches
# ...

# 3. Montar HTML final
HTML = body + cdn + "<script>
" + js + "
</script>
</body>
</html>"
```

---

## Checklist obrigatório antes de salvar

- [ ] `node --check arquivo.js` sem erros de sintaxe
- [ ] `CUSTOS` declarado exatamente 1x
- [ ] Zero IDs duplicados no HTML
- [ ] 17 telas únicas no body
- [ ] 2 ou 3 tags `<script>` (CDN + JS principal)
- [ ] Zero TDZ globais (`const`/`let` declaradas antes do primeiro uso)
- [ ] `LOGS` e `DRAFTS` declarados como `let`, nunca `const`

---

## Dados

- **1.008 pautas históricas** (2022–2026) no array `DATA`
- **42 lançamentos de custos** pré-carregados (Jun–Dez/2026) — R$ 14.331,10/mês
- Persistência via `localStorage` (por dispositivo) + exportação/importação JSON
- Sócios: João Paulo 51% · Maysa Feitosa 49%
- Reserva de Sócios: 15% dos honorários pagos a partir de Jul/2026

---

## Fluxo de trabalho com issues

### Fechar automaticamente
Referencie `Closes #N` ou `Fixes #N` na mensagem do commit. O GitHub fecha a issue sozinho ao entrar na branch principal.

### Atualizar sem fechar
Quando o entendimento de uma issue mudar (causa real descoberta, escopo alterado, virou bloqueio de outra coisa), **comente na issue no momento em que isso acontecer**. Use `Refs #N` no commit quando o progresso parcial estiver ligado a um commit específico.

### Abrir issue na hora
Ao encontrar um bug, decisão de arquitetura ou limite de plataforma novo durante o trabalho, **abra a issue imediatamente** com os labels de área/status/aprendizado — não deixe para organizar depois.

### Consultar o que está em aberto
```
is:issue is:open label:"em-aberto"
is:issue is:open label:"frontend"
is:issue is:open label:"aprendizado"
```

---

## Labels

| Label | Cor | Uso |
|---|---|---|
| `resolvido` | verde | Issue corrigida e fechada |
| `em-aberto` | vermelho | Ainda pendente |
| `parcial` | amarelo | Parcialmente resolvido |
| `frontend` | azul-teal | HTML/CSS/JS |
| `backend` | roxo | Servidor, banco, infra |
| `dados` | azul | Estrutura de dados e persistência |
| `aprendizado` | amarelo | Decisão de arquitetura ou lição aprendida |
| `seguranca` | vermelho-escuro | Item que afeta integridade ou acesso |
| `ux` | rosa | Experiência do usuário e interface |
| `build` | roxo-claro | Pipeline de geração do arquivo HTML |

---

## Manter o README fiel à realidade

Sempre que uma mudança tornar uma frase deste README desatualizada — versão, comando, arquitetura, feature que mudou — atualize o README **no mesmo commit**. Quando não der para fazer na hora, abra uma issue de `aprendizado` registrando a pendência.

README parado é o mesmo tipo de apodrecimento silencioso das issues nunca fechadas.

---

## Próximos passos

- [ ] #27 Migração localStorage → Supabase/Firebase com auth JP + Maysa
- [ ] #28 Telas incompletas: Sócios, Investimentos, Calendário
- [ ] #29 Validação de qualidade das 1.008 pautas históricas

