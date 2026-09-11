# Como contribuir — GRAAL.hub Sistema de Gestão

## Entendendo o projeto

Sistema HTML standalone — um único arquivo que abre no browser e funciona offline.
Não há servidor, não há banco de dados, não há processo de build externo.

## Arquivos

| Arquivo | Papel |
|---|---|
| `sistema-gestao.html` | Versão atual em produção (v20) |
| `README.md` | Arquitetura, checklist e processo |

O arquivo `sistema-gestao.html` contém tudo: HTML, CSS e JS em um único arquivo de ~1,7 MB.

## Estrutura interna do arquivo

```
sistema-gestao.html
├── <head> com estilos CSS inline
├── <body> com 17 telas (sc-dashboard, sc-demandas, sc-relatorio, ...)
├── <script src="Chart.js CDN">
└── <script> com ~353k chars de JS
    ├── const DATA = [...] — 1.008 pautas históricas
    ├── let CUSTOS = [...] — 42 lançamentos Jun–Dez/2026
    ├── 83+ funções de renderização e lógica
    └── IIFE de inicialização
```

## Como fazer um patch

**REGRA FUNDAMENTAL:** sempre extrair do arquivo v19 limpo, nunca editar o v20 diretamente.

```python
import re

# 1. Carregar o v19 (base imutável)
with open('sistema-gestao.html', 'r', encoding='utf-8') as f:
    h19 = f.read()

# 2. Localizar JS e body
scripts = [(m.start(), m.end()) for m in re.finditer(r'<script[^>]*>', h19)]
js_blocks = [(s, e, h19.find('</script>', e)) for s, e in scripts]
main_s, main_e, main_end = max(js_blocks, key=lambda x: x[2]-x[1])
cdn_s = scripts[0][0]

js   = h19[main_e:main_end]    # JS puro
body = h19[:cdn_s]              # body puro

# 3. Aplicar patches no js e no body
# js = js.replace('padrão único', 'novo valor', 1)

# 4. Montar HTML final
cdn = h19[cdn_s:js_blocks[0][2]+9]
HTML = body + '\n' + cdn + '\n<script>\n' + js + '\n</script>\n</body>\n</html>'

# 5. Salvar
with open('sistema-gestao.html', 'w', encoding='utf-8') as f:
    f.write(HTML)
```

## Checklist antes de commitar

```bash
# Extrair o JS e verificar sintaxe
python3 -c "
import re
h = open('sistema-gestao.html').read()
sc = [(m.start(),m.end()) for m in re.finditer(r'<script[^>]*>',h)]
jb = [(s,e,h.find('</script>',e)) for s,e in sc]
ms,me,mend = max(jb,key=lambda x:x[2]-x[1])
open('/tmp/check.js','w').write(h[me:mend])
"
node --check /tmp/check.js
```

- [ ] Sintaxe JS sem erros (`node --check`)
- [ ] `CUSTOS` declarado exatamente 1x
- [ ] Zero IDs duplicados no HTML
- [ ] 17 telas únicas no body
- [ ] `LOGS` e `DRAFTS` declarados como `let`, nunca `const`
- [ ] `fpct`, `negCls`, `onPerChange` declaradas antes do primeiro uso

## Variáveis e funções principais

| Nome | Tipo | Descrição |
|---|---|---|
| `DATA` | `const Array` | 1.008 pautas históricas — nunca modificar inline |
| `CUSTOS` | `let Array` | Custos mensais — mutável via lsLoad/lsSave |
| `LOGS` | `let Array` | Log de atividades — **deve ser `let`**, nunca `const` |
| `DRAFTS` | `let Array` | Rascunhos de orçamento — **deve ser `let`**, nunca `const` |
| `F` | `let Object` | Filtro ativo `{emp, per, ano, mes}` |
| `VIEW` | `let String` | Tela ativa atual |
| `META_SOCIOS_PCT` | `let Number` | % Reserva de Sócios (padrão: 15) |
| `goTo(id)` | `function` | Navegar entre telas |
| `lsSave()` | `function` | Persistir no localStorage |
| `lsLoad()` | `function` | Restaurar do localStorage |
| `addLog(acao, item)` | `function` | Registrar no log de atividades |
| `renderDash()` | `function` | Renderizar o dashboard |
| `fpct(v)` | `const` | Formatar percentual — declarar antes do uso! |
| `negCls(v)` | `function` | Retorna `'neg'` se valor negativo |

## Fórmulas financeiras

```
Bruto        = valor cobrado ao cliente
Imposto      = % sobre o bruto
Honorários   = (bruto − imposto) × % comissão da agência
Reserva Sócios = 15% dos honorários PAGOS (vigente Jul/2026+)
Lucro Líquido  = Honorários − Custos Mensais − Reserva de Sócios
```

Distribuição: JP 51% · Maysa 49%

## Fluxo de trabalho com issues

- `Closes #N` no commit → GitHub fecha a issue automaticamente
- `Refs #N` no commit → progresso parcial, issue continua aberta
- Comentar na issue quando o entendimento mudar
- Abrir issue nova imediatamente ao encontrar algo relevante
- Atualizar o README no mesmo commit da mudança

## Issues em aberto

- #27 — Migração localStorage → Supabase/Firebase
- #28 — Telas incompletas: Sócios, Investimentos, Calendário
- #29 — Validação das 1.008 pautas históricas
