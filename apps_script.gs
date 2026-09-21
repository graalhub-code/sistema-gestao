// ═══════════════════════════════════════════════════════════════
// GRAAL.hub — Google Apps Script
// Sincronização automática Planilha → D1 (Cloudflare)
// Instalar em: Extensões → Apps Script → Novo projeto
// Trigger: Editar → Acionadores → onChange ou onEdit
// ═══════════════════════════════════════════════════════════════

const GRAAL_API = 'https://graal-api.graal-hub.workers.dev/api';
const SYNC_TOKEN = 'graal-sync-2026';

// Mapeamento de meses
const MES_MAP = {
  '1':'Jan','2':'Fev','3':'Mar','4':'Abr','5':'Mai','6':'Jun',
  '7':'Jul','8':'Ago','9':'Set','10':'Out','11':'Nov','12':'Dez',
  'Janeiro':'Jan','Fevereiro':'Fev','Março':'Mar','Abril':'Abr',
  'Maio':'Mai','Junho':'Jun','Julho':'Jul','Agosto':'Ago',
  'Setembro':'Set','Outubro':'Out','Novembro':'Nov','Dezembro':'Dez'
};

function parseBRL(v) {
  if (!v) return 0;
  var s = String(v).replace(/R\$\s*/g,'').replace(/\./g,'').replace(',','.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function mapStatus(v) {
  var s = String(v||'').toLowerCase().trim();
  if (s.includes('pago') || s === 'p') return 'Pago';
  if (s.includes('cancelad')) return 'Cancelada';
  if (s.includes('enviado') || s.includes('nf')) return 'Em aberto';
  return 'Em aberto';
}

// Extrair pautas de uma aba
function extrairPautas(sheet, ano, mes) {
  var data = sheet.getDataRange().getValues();
  var pautas = [];
  var headerRow = -1;

  // Encontrar linha de cabeçalho
  for (var i = 0; i < Math.min(data.length, 15); i++) {
    var row = data[i].map(function(c){ return String(c).toLowerCase(); });
    if (row.indexOf('cliente') >= 0 && (row.indexOf('campanha') >= 0 || row.indexOf('veículo') >= 0)) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return pautas;

  var header = data[headerRow].map(function(c){ return String(c).toLowerCase().trim(); });
  var cCli   = header.indexOf('cliente');
  var cVei   = Math.max(header.indexOf('veículo fornecedor'), header.indexOf('veículo'));
  var cCamp  = Math.max(header.indexOf('campanha'), header.indexOf('autorização cliente'));
  var cTipo  = header.indexOf('tipo');
  var cBruto = Math.max(header.indexOf('r$ autorizado'), header.indexOf('r$ bruto veículo / fornecedor'));
  var cHon   = Math.max(header.indexOf('r$ honorários graal.hub'), header.indexOf('honorários'));
  var cSt    = Math.max(header.indexOf('status'), header.indexOf('pago'));

  for (var r = headerRow + 1; r < data.length; r++) {
    var row = data[r];
    var cli = String(row[cCli] || '').trim();
    if (!cli || cli.toLowerCase().includes('total') || cli.toLowerCase() === 'cliente') continue;

    pautas.push({
      ano: ano,
      mes: mes,
      cli: cli,
      vei: cVei >= 0 ? String(row[cVei]||'').trim() : '',
      camp: cCamp >= 0 ? String(row[cCamp]||'').trim() : '',
      tipo: cTipo >= 0 ? String(row[cTipo]||'').trim() : '',
      bruto: cBruto >= 0 ? parseBRL(row[cBruto]) : 0,
      hon: cHon >= 0 ? parseBRL(row[cHon]) : 0,
      st: cSt >= 0 ? mapStatus(row[cSt]) : 'Em aberto'
    });
  }
  return pautas;
}

// Enviar pautas para o D1
function enviarParaD1(pautas) {
  if (!pautas.length) return { inserted: 0 };
  var payload = JSON.stringify({ rows: pautas });
  var resp = UrlFetchApp.fetch(GRAAL_API + '/sync/planilha', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-GRAAL-Token': SYNC_TOKEN },
    payload: payload,
    muteHttpExceptions: true
  });
  return JSON.parse(resp.getContentText());
}

// Trigger principal — chamado em onChange
function onPlanilhaChange(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var nomAba = sheet.getName(); // Ex: "Set 2026", "Setembro 2026"

  // Detectar mês/ano no nome da aba
  var anoMatch = nomAba.match(/20\d\d/);
  var ano = anoMatch ? parseInt(anoMatch[0]) : new Date().getFullYear();
  var mesMatch = nomAba.match(/(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i);
  var mesRaw = mesMatch ? mesMatch[1] : String(new Date().getMonth() + 1);
  var mes = MES_MAP[mesRaw] || MES_MAP[mesRaw.charAt(0).toUpperCase()+mesRaw.slice(1).toLowerCase()] || 'Set';

  var pautas = extrairPautas(sheet, ano, mes);
  if (!pautas.length) return;

  var result = enviarParaD1(pautas);
  if (result.inserted > 0) {
    Logger.log('GRAAL Sync: ' + result.inserted + ' novas pautas inseridas no D1 (' + mes + '/' + ano + ')');
  }
}

// Sync manual — rodar para sincronizar toda a planilha
function syncCompleto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalInserido = 0;

  sheets.forEach(function(sheet) {
    var nome = sheet.getName();
    var anoMatch = nome.match(/20\d\d/);
    if (!anoMatch) return;
    var ano = parseInt(anoMatch[0]);

    var mesMatch = nome.match(/(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i);
    if (!mesMatch) return;
    var mesRaw = mesMatch[1];
    var mes = MES_MAP[mesRaw] || MES_MAP[mesRaw.charAt(0).toUpperCase()+mesRaw.slice(1).toLowerCase()];
    if (!mes) return;

    var pautas = extrairPautas(sheet, ano, mes);
    if (!pautas.length) return;

    var result = enviarParaD1(pautas);
    totalInserido += result.inserted || 0;
    Logger.log(nome + ': ' + (result.inserted||0) + ' inseridas');
    Utilities.sleep(500); // respeitar rate limit
  });

  SpreadsheetApp.getUi().alert('Sync concluído!\n' + totalInserido + ' pautas novas enviadas ao D1.');
}

// Menu na planilha
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('GRAAL.hub')
    .addItem('Sincronizar com sistema', 'syncCompleto')
    .addToUi();
}
