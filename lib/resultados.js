import crypto from 'node:crypto';

/**
 * /api/resultados  — Metas e Gaps (servido por api/data.js?type=resultados; ver vercel.json)
 *
 * GET  ?ano=2026[&franquiaId=x]   metas do ano + realizado diário (Metabase)
 * PUT  ?ano=2026  {metas:{...}}   grava metas (somente admin). Mescla por franquia.
 *
 * Variáveis na Vercel:
 *   METABASE_URL            ex.: https://metabase.hyperlocal.com.br
 *   METABASE_API_KEY        a mesma usada no fetch_data.py
 *   METABASE_DASHBOARD_ID   dashboard com o resultado diário (padrão 592). O portal acha o card e as colunas sozinho
 *   RESULTADOS_CARD_ID      (opcional) pergunta própria com colunas: data, franquia, movimento, mrr, clientes.
 *                           Se existir, tem prioridade sobre o dashboard
 *   FRANQUIA_MAP (opcional) JSON {"Nome no Metabase":"avec-campinas"} quando os nomes não baterem
 *
 * Metas lidas da planilha do Google (opcional; se configurado, a planilha passa a ser a fonte oficial):
 *   GOOGLE_SERVICE_ACCOUNT  JSON da conta de serviço (secreto). Compartilhe a planilha com o e-mail dela como Leitor
 *   METAS_SHEET_ID          o código entre /d/ e /edit no link da planilha
 *   METAS_SHEET_ABA         (opcional) nome de uma aba única com o ano todo, ex.: "Metas {ano}".
 *                           Sem essa variável, o portal procura uma aba por mês (Janeiro, Jan/26, 01-2026...)
 *   GITHUB_TOKEN / PORTAL_SESSION_SECRET  já existentes
 */

const REPO = process.env.GITHUB_REPOSITORY || 'avec-franquias/Dashboard-comercial-avec';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const INDICADORES = ['new', 'upgrade', 'cross', 'down', 'churn'];

// Como cada status do Metabase entra nos indicadores do painel
const MOVIMENTOS = {
  NEW: 'new', NEW_MRR: 'new', NOVO: 'new', NOVA: 'new', NOVOS: 'new', VENDA: 'new', REACTIVATION: 'new', REATIVACAO: 'new', REACTIVATED: 'new',
  UP: 'upgrade', UPGRADE: 'upgrade', UPSELL: 'upgrade', EXPANSION: 'upgrade', EXPANSAO: 'upgrade',
  CROSS: 'cross', CROSS_SELL: 'cross', CROSSSELL: 'cross',
  DOWN: 'down', DOWNGRADE: 'down', CONTRACTION: 'down',
  CHURN: 'churn', CANCELAMENTO: 'churn', CANCELADO: 'churn', CANCELADA: 'churn', CANCEL: 'churn'
};
const movimentoDe = (v) => MOVIMENTOS[slug(v).toUpperCase().replace(/-/g, '_')] ||
  MOVIMENTOS[slug(v).toUpperCase().replace(/-/g, '')] || null;

function cors(req, res) {
  const o = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

// Mesmo formato de sessão de /api/login e /api/franquia-data
function auth(req) {
  const secret = process.env.GITHUB_TOKEN || process.env.PORTAL_SESSION_SECRET;
  if (!secret) throw Object.assign(new Error('Chave de sessao indisponivel'), { status: 500 });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [p, s] = token.split('.');
  if (!p || !s) throw Object.assign(new Error('Entre novamente'), { status: 401 });
  const exp = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  const a = Buffer.from(s), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Object.assign(new Error('Sessao invalida'), { status: 401 });
  const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (Date.now() > Number(d.exp || 0)) throw Object.assign(new Error('Sessao expirada'), { status: 401 });
  if (!d.franquiaId && d.papel !== 'admin') throw Object.assign(new Error('Usuario ainda nao vinculado a uma franquia'), { status: 403 });
  return d;
}

async function gh(path, opts = {}) {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw Object.assign(new Error('Armazenamento indisponivel'), { status: 500 });
  const r = await fetch('https://api.github.com/repos/' + REPO + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'avec-portal-api' }
  });
  const x = await r.text();
  let j = {};
  try { j = x ? JSON.parse(x) : {}; } catch {}
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(j.message || 'Falha no armazenamento'), { status: r.status });
  return { status: r.status, j };
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function idFranquia(nome) {
  let mapa = {};
  try { mapa = JSON.parse(process.env.FRANQUIA_MAP || '{}'); } catch {}
  if (mapa[nome]) return mapa[nome];
  const s = slug(nome);
  return s.startsWith('avec-') ? s : 'avec-' + s;
}

/* ---------- Metas ---------- */
async function lerMetas(ano) {
  const cur = await gh('/contents/config/metas/' + ano + '.json?ref=' + encodeURIComponent(BRANCH));
  if (cur.status === 404) return { doc: { ano, metas: {} }, sha: null };
  return { doc: JSON.parse(Buffer.from(cur.j.content, 'base64').toString('utf8')), sha: cur.j.sha };
}

function limparMetas(entrada) {
  const out = {};
  for (const [fid, inds] of Object.entries(entrada || {})) {
    const id = fid === 'rede' ? 'rede' : slug(fid);
    if (!id) continue;
    out[id] = {};
    for (const ind of INDICADORES) {
      const meses = Array.isArray(inds?.[ind]) ? inds[ind] : [];
      out[id][ind] = Array.from({ length: 12 }, (_, i) => {
        const v = Number(meses[i]);
        return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;
      });
    }
  }
  return out;
}

/* ---------- Metas da planilha do Google ---------- */
const NOMES_IND = { 'new':'new','new mrr':'new','upgrade':'upgrade','up':'upgrade','cross':'cross','cross sell':'cross','cross-sell':'cross',
  'crosssell':'cross','down':'down','downgrade':'down','churn':'churn' };
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
let CACHE_PLANILHA = { em: 0, ano: null, dados: null };
let TOKEN_GOOGLE = { valor: null, expira: 0 };

const planilhaConfigurada = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT && process.env.METAS_SHEET_ID);

async function tokenGoogle() {
  if (TOKEN_GOOGLE.valor && Date.now() < TOKEN_GOOGLE.expira - 60000) return TOKEN_GOOGLE.valor;
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const corpo = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600
  });
  const assinatura = crypto.createSign('RSA-SHA256').update(corpo).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + corpo + '.' + assinatura
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('O Google recusou a conta de serviço: ' + (j.error_description || j.error || r.status)), { status: 502 });
  TOKEN_GOOGLE = { valor: j.access_token, expira: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

function numero(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);          // (500) contábil
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 1.200 = mil e duzentos
  const n = Number(s); return isFinite(n) ? n : 0;
}

/* Aceita dois formatos de planilha:
   largo: franquia | indicador | jan | fev | ... | dez      (o mesmo do modelo baixado no portal)
   longo: franquia | indicador | mes | meta                 (mes de 1 a 12, ou jan..dez)
   Uma coluna "ano" é opcional; se existir, só as linhas do ano pedido entram. */
function lerTabela(linhas, ano) {
  const cab = (linhas[0] || []).map((c) => slug(c).replace(/-/g, '_'));
  const col = (...nomes) => cab.findIndex((c) => nomes.includes(c));
  const iF = col('franquia_id', 'franquia', 'unidade'), iI = col('indicador'), iAno = col('ano');
  const iJan = col('jan', 'janeiro'), iMes = col('mes'), iMeta = col('meta', 'valor');
  if (iF < 0 || iI < 0 || (iJan < 0 && (iMes < 0 || iMeta < 0)))
    throw Object.assign(new Error('A planilha precisa das colunas franquia e indicador, e dos meses (jan a dez) ou de mes e meta'), { status: 422 });
  const metas = {}, ignoradas = [];
  const base = (id) => (metas[id] = metas[id] || Object.fromEntries(INDICADORES.map((i) => [i, Array(12).fill(0)])));
  linhas.slice(1).forEach((l, k) => {
    if (!l || !l.some((c) => String(c ?? '').trim())) return;
    if (iAno >= 0 && String(l[iAno] ?? '').trim() && Number(l[iAno]) !== ano) return;
    const nome = String(l[iF] ?? '').trim(), ind = NOMES_IND[String(l[iI] ?? '').trim().toLowerCase()];
    if (!nome || !ind) { ignoradas.push(k + 2); return; }
    const id = /^rede\b/i.test(nome) ? 'rede' : idFranquia(nome);
    if (iJan >= 0) {
      base(id)[ind] = MESES.map((_, m) => Math.max(0, numero(l[iJan + m])));
    } else {
      const mRaw = String(l[iMes] ?? '').trim().toLowerCase().slice(0, 3);
      const m = /^\d+$/.test(mRaw) ? Number(mRaw) - 1 : MESES.indexOf(mRaw);
      if (m < 0 || m > 11) { ignoradas.push(k + 2); return; }
      base(id)[ind][m] = Math.max(0, numero(l[iMeta]));
    }
  });
  return { metas, ignoradas };
}

/* ---------- Abas mensais ---------- */
const MESES_LONGOS = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

// Descobre mês e ano pelo nome da aba: "Outubro", "Out/26", "Metas Out 2026", "10-2026", "2026-10"
function mesDaAba(titulo) {
  const s = slug(titulo), tokens = s.split('-');
  let mes = -1, ano = null;
  const num = String(titulo).match(/(?:^|\D)(\d{1,2})\s*[\/\-.]\s*(\d{2}|\d{4})(?!\d)/) || null;
  const numInv = String(titulo).match(/(\d{4})\s*[\/\-.]\s*(\d{1,2})(?!\d)/) || null;
  if (numInv && +numInv[2] >= 1 && +numInv[2] <= 12) { mes = +numInv[2] - 1; ano = +numInv[1]; }
  else if (num && +num[1] >= 1 && +num[1] <= 12) { mes = +num[1] - 1; ano = num[2].length === 2 ? 2000 + +num[2] : +num[2]; }
  if (mes < 0) {
    for (const tk of tokens) {
      const m = MESES_LONGOS.findIndex((nome) => tk === nome || (tk.length === 3 && nome.startsWith(tk)));
      if (m >= 0) { mes = m; break; }
    }
  }
  if (ano === null) {
    const a4 = tokens.find((tk) => /^20\d{2}$/.test(tk));
    const a2 = tokens.find((tk, i) => /^\d{2}$/.test(tk) && i > 0);
    ano = a4 ? +a4 : a2 ? 2000 + +a2 : null;
  }
  return mes >= 0 ? { mes, ano } : null;
}

// Reconhece a coluna (ou linha) de cada indicador, mesmo com nomes como "Meta New MRR (R$)"
function indicadorDe(texto) {
  const s = slug(texto), tk = s.split('-');
  if (!s || /realiz|ating|resultado|percent|^net/.test(s) || tk.includes('net')) return null;
  if (s.includes('cross')) return 'cross';
  if (s.includes('churn') || s.includes('cancel')) return 'churn';
  if (s.includes('downgrade') || tk.includes('down')) return 'down';
  if (s.includes('upgrade') || tk.includes('up') || tk.includes('upsell')) return 'upgrade';
  if (tk.includes('new') || s.includes('novo') || s.includes('nova')) return 'new';
  return null;
}
const ehColFranquia = (c) => /^(franquia|franquias|unidade|franqueado|territorio|nome|regiao)/.test(slug(c).replace(/-/g, ''));
const ehRede = (nome) => /^(rede|total|soma|consolidado)/i.test(String(nome).trim());

/* Lê a tabela de uma aba mensal. Aceita:
   franquias nas linhas e indicadores nas colunas (o mais comum), ou o inverso.
   O cabeçalho pode estar em qualquer uma das 15 primeiras linhas. */
function lerAbaMensal(valores, mes, metas, avisos, nomeAba) {
  const base = (id) => (metas[id] = metas[id] || Object.fromEntries(INDICADORES.map((i) => [i, Array(12).fill(0)])));
  for (let h = 0; h < Math.min(15, valores.length); h++) {
    const linha = valores[h] || [];
    const iF = linha.findIndex(ehColFranquia);
    const colunas = linha.map((c, k) => ({ k, ind: indicadorDe(c), meta: /meta/.test(slug(c)) })).filter((c) => c.ind && c.k !== iF);
    if (iF >= 0 && colunas.length) {
      // se houver "Meta X" e "X", fica com a coluna de meta
      const porInd = {};
      for (const c of colunas) if (!porInd[c.ind] || (c.meta && !porInd[c.ind].meta)) porInd[c.ind] = c;
      valores.slice(h + 1).forEach((l, k) => {
        const nome = String(l?.[iF] ?? '').trim();
        if (!nome) return;
        const vals = Object.values(porInd).map((c) => [c.ind, numero(l[c.k])]);
        if (!vals.some(([, v]) => v)) return;
        const id = ehRede(nome) ? 'rede' : idFranquia(nome);
        for (const [ind, v] of vals) base(id)[ind][mes] = Math.abs(v);
      });
      return true;
    }
  }
  // Formato transposto: indicadores na primeira coluna, franquias no cabeçalho
  const iLinhaInd = valores.findIndex((l) => indicadorDe(l?.[0]));
  if (iLinhaInd > 0) {
    const cab = valores.slice(0, iLinhaInd).reverse().find((l) => l && l.slice(1).some((c) => String(c ?? '').trim())) || [];
    valores.slice(iLinhaInd).forEach((l) => {
      const ind = indicadorDe(l?.[0]);
      if (!ind) return;
      cab.forEach((nome, k) => {
        if (!k || !String(nome ?? '').trim()) return;
        const v = numero(l[k]); if (!v) return;
        base(ehRede(nome) ? 'rede' : idFranquia(nome))[ind][mes] = Math.abs(v);
      });
    });
    return true;
  }
  avisos.push('Não encontrei a tabela de metas na aba "' + nomeAba + '". Ela precisa de uma coluna Franquia e colunas com os indicadores.');
  return false;
}

async function google(caminho) {
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(process.env.METAS_SHEET_ID) + caminho,
    { headers: { Authorization: 'Bearer ' + (await tokenGoogle()) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw Object.assign(new Error('A planilha não foi compartilhada com a conta de serviço'), { status: 502 });
  if (r.status === 404) throw Object.assign(new Error('Planilha não encontrada. Confira o METAS_SHEET_ID'), { status: 502 });
  if (!r.ok) throw Object.assign(new Error('O Google Sheets respondeu ' + r.status + ': ' + (j.error?.message || '')), { status: 502 });
  return j;
}
const intervalo = (aba) => "'" + aba.replace(/'/g, "''") + "'";

async function lerPlanilha(ano, forcar) {
  if (!forcar && CACHE_PLANILHA.ano === ano && Date.now() - CACHE_PLANILHA.em < 5 * 60 * 1000) return CACHE_PLANILHA.dados;
  let dados;
  if (process.env.METAS_SHEET_ABA) {
    // Modo aba única com o ano inteiro
    const aba = process.env.METAS_SHEET_ABA.replace('{ano}', ano);
    const j = await google('/values/' + encodeURIComponent(intervalo(aba)) + '?valueRenderOption=UNFORMATTED_VALUE');
    const r = lerTabela(j.values || [], ano);
    dados = { metas: r.metas, avisos: r.ignoradas.length ? ['Linhas ignoradas na aba "' + aba + '": ' + r.ignoradas.join(', ')] : [], abas: [aba] };
  } else {
    // Modo uma aba por mês
    const meta = await google('?fields=sheets.properties(title,hidden)');
    const candidatas = (meta.sheets || []).map((s) => s.properties).filter((p) => !p.hidden)
      .map((p) => ({ titulo: p.title, ...(mesDaAba(p.title) || {}) })).filter((p) => p.mes !== undefined);
    const escolhidas = new Map();
    for (const c of candidatas) {
      if (c.ano !== null && c.ano !== ano) continue;
      const atual = escolhidas.get(c.mes);
      if (!atual || (atual.ano === null && c.ano === ano)) escolhidas.set(c.mes, c);   // com ano explícito ganha
    }
    if (!escolhidas.size) throw Object.assign(new Error('Não encontrei abas com nome de mês para ' + ano + ' na planilha'), { status: 422 });
    const abas = [...escolhidas.values()].sort((a, b) => a.mes - b.mes);
    const j = await google('/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&' + abas.map((a) => 'ranges=' + encodeURIComponent(intervalo(a.titulo))).join('&'));
    const metas = {}, avisos = [];
    abas.forEach((a, k) => lerAbaMensal(j.valueRanges?.[k]?.values || [], a.mes, metas, avisos, a.titulo));
    const faltam = MESES.filter((_, m) => !escolhidas.has(m));
    dados = { metas, avisos, abas: abas.map((a) => a.titulo), mesesSemAba: faltam };
  }
  dados.lidoEm = new Date().toISOString();
  CACHE_PLANILHA = { em: Date.now(), ano, dados };
  return dados;
}

/* ---------- Realizado (Metabase) ---------- */
let CACHE = { em: 0, ano: null, linhas: null };

async function lerRealizado(ano) {
  const base = (process.env.METABASE_URL || '').replace(/\/$/, '');
  const card = process.env.RESULTADOS_CARD_ID;
  if (!base || !process.env.METABASE_API_KEY) return { fonte: 'pendente', linhas: [] };
  if (!card) {
    try { return await lerRealizadoDashboard(ano); }
    catch (e) { return { fonte: 'erro', linhas: [], erro: e.message }; }
  }
  if (CACHE.ano === ano && Date.now() - CACHE.em < 10 * 60 * 1000) return { fonte: 'metabase', linhas: CACHE.linhas, cache: true };

  const r = await fetch(base + '/api/card/' + encodeURIComponent(card) + '/query/json', {
    method: 'POST',
    headers: { 'x-api-key': process.env.METABASE_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'format_rows=false'
  });
  if (!r.ok) throw Object.assign(new Error('O Metabase respondeu ' + r.status + ' para a pergunta ' + card), { status: 502 });
  const brutas = await r.json();

  const linhas = [];
  for (const b of brutas) {
    const l = {};
    for (const [k, v] of Object.entries(b)) l[slug(k).replace(/-/g, '_')] = v;
    const ind = movimentoDe(l.movimento || l.status || '');
    const data = String(l.data || l.dia || '').slice(0, 10);
    if (!ind || !data.startsWith(String(ano))) continue;
    linhas.push({
      data,
      franquiaId: idFranquia(l.franquia || l.franquia_id || l.carteira || ''),
      ind,
      mrr: Math.abs(Number(l.mrr || l.mrr_diff || 0)),
      clientes: Math.abs(Number(l.clientes || 0))
    });
  }
  CACHE = { em: Date.now(), ano, linhas };
  return { fonte: 'metabase', linhas };
}

/* ---------- Diagnóstico do dashboard do Metabase (só admin) ----------
   Mostra a estrutura do dashboard: filtros, cards e colunas. Não devolve linhas:
   texto com muitos valores diferentes (nomes de clientes, por exemplo) aparece só como contagem. */
async function diagnosticarMetabase(dashId) {
  const base = (process.env.METABASE_URL || '').replace(/\/$/, '');
  if (!base || !process.env.METABASE_API_KEY) throw Object.assign(new Error('Cadastre METABASE_URL e METABASE_API_KEY na Vercel'), { status: 400 });
  const mb = async (caminho, opt = {}) => {
    const r = await fetch(base + caminho, { ...opt, headers: { 'x-api-key': process.env.METABASE_API_KEY, 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error('Metabase ' + r.status + ' em ' + caminho + ': ' + (j.message || (typeof j === 'string' ? j : ''))), { status: 502 });
    return j;
  };
  const d = await mb('/api/dashboard/' + dashId);
  const filtros = (d.parameters || []).map((p) => ({ id: p.id, nome: p.name, slug: p.slug, tipo: p.type, padrao: p.default ?? null }));
  const cards = [];
  for (const dc of (d.dashcards || d.ordered_cards || []).filter((x) => x.card_id).slice(0, 10)) {
    const card = dc.card || {};
    const info = {
      dashcard_id: dc.id, card_id: dc.card_id, nome: card.name, visual: card.display,
      tipo_query: card.dataset_query?.type,
      variaveis_sql: Object.values(card.dataset_query?.native?.['template-tags'] || {}).map((tg) => ({ nome: tg.name, tipo: tg.type, dimensao: tg['widget-type'] || null })),
      filtros_ligados: (dc.parameter_mappings || []).map((m) => ({ filtro: filtros.find((f) => f.id === m.parameter_id)?.slug, alvo: m.target }))
    };
    try {
      const q = await mb('/api/dashboard/' + dashId + '/dashcard/' + dc.id + '/card/' + dc.card_id + '/query', {
        method: 'POST', body: JSON.stringify({ parameters: [] })
      });
      const cols = q.data?.cols || [], rows = q.data?.rows || [];
      info.linhas = rows.length;
      info.colunas = cols.map((c, k) => {
        const vals = rows.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
        const col = { nome: c.name, rotulo: c.display_name, tipo: c.base_type };
        if (vals.length && vals.every((v) => typeof v === 'number')) {
          col.soma = Math.round(vals.reduce((a, v) => a + v, 0) * 100) / 100; col.min = Math.min(...vals); col.max = Math.max(...vals);
        } else if (/Date|Time/.test(c.base_type || '')) {
          const s = vals.map(String).sort(); col.de = s[0]; col.ate = s[s.length - 1];
        } else {
          const distintos = [...new Set(vals.map(String))];
          const pessoal = /client|razao|fantasia|document|cnpj|cpf|mail|telefone|fone|celular|contato|endereco|^nome$|^name$/i.test(c.name + ' ' + (c.display_name || ''));
          if (distintos.length <= 40 && !pessoal) col.valores = distintos; else col.valores_distintos = distintos.length;
        }
        return col;
      });
    } catch (e) { info.erro = e.message; }
    cards.push(info);
  }
  return { dashboard: { id: d.id, nome: d.name }, metabase: base, filtros, cards };
}

/* ---------- Leitura automática do dashboard ---------- */
async function mb(caminho, opt = {}) {
  const base = (process.env.METABASE_URL || '').replace(/\/$/, '');
  const r = await fetch(base + caminho, { ...opt, headers: { 'x-api-key': process.env.METABASE_API_KEY, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('Metabase ' + r.status + ': ' + (j.message || (typeof j === 'string' ? j : caminho))), { status: 502 });
  return j;
}

const ehData = (c) => /Date|Time/.test(c.base_type || '') || /^(dia|data|date|day|dt)(\b|_)/.test(slug(c.name).replace(/-/g, '_'));
const nomeCol = (c) => slug((c.name || '') + ' ' + (c.display_name || '')).replace(/-/g, '_');

// Descobre o papel de cada coluna olhando o nome e os valores
function mapearColunas(cols, rows) {
  const info = cols.map((c, k) => {
    const vals = rows.map((r) => r[k]).filter((v) => v !== null && v !== undefined && v !== '');
    const num = vals.length > 0 && vals.every((v) => typeof v === 'number');
    const distintos = [...new Set(vals.map(String))];
    const movs = distintos.filter((v) => movimentoDe(v)).length;
    return { k, c, nome: nomeCol(c), num, data: ehData(c), movimentoRatio: distintos.length ? movs / distintos.length : 0, movs };
  });
  const m = { formato: null };
  m.data = info.find((x) => x.data)?.k ?? null;
  const st = info.filter((x) => !x.num && x.movs >= 1 && x.movimentoRatio >= 0.5).sort((a, b) => b.movs - a.movs)[0];
  // formato "largo": uma coluna numérica por movimento (NEW, UP, DOWN...)
  const largas = info.filter((x) => x.num && movimentoDe(x.c.display_name || x.c.name));
  if (st) { m.formato = 'longo'; m.status = st.k; }
  else if (largas.length >= 2) { m.formato = 'largo'; m.largas = largas.map((x) => ({ k: x.k, ind: movimentoDe(x.c.display_name || x.c.name) })); }
  const evita = /client|qtd|quant|count|contagem|^ecs|_id$|^id_|ordem|order|percent|pct|taxa|rate/;
  const valores = info.filter((x) => x.num && !evita.test(x.nome) && x.k !== m.data);
  const prioridade = ['mrr_diff', 'diff', 'delta', 'variac', 'net', 'mrr', 'valor', 'amount', 'sum', 'soma', 'total'];
  m.valor = (valores.map((x) => ({ x, p: prioridade.findIndex((p) => x.nome.includes(p)) })).filter((y) => y.p >= 0).sort((a, b) => a.p - b.p)[0]?.x || valores[0])?.k ?? null;
  m.clientes = info.find((x) => x.num && /client|qtd|quant|count|contagem|^ecs/.test(x.nome))?.k ?? null;
  const ordemF = ['franquia', 'owner', 'franqueado', 'responsavel', 'unidade', 'territorio', 'carteira'];
  m.franquia = (info.filter((x) => !x.num && x.k !== m.status).map((x) => ({ x, p: ordemF.findIndex((p) => x.nome.includes(p)) }))
    .filter((y) => y.p >= 0).sort((a, b) => a.p - b.p)[0]?.x)?.k ?? null;
  m.pontos = (m.formato ? 10 : 0) + (m.formato === 'largo' || m.valor !== null ? 5 : 0) + (m.data !== null ? 3 : 0) + (m.franquia !== null ? 3 : 0);
  m.nomes = Object.fromEntries(['data', 'status', 'valor', 'clientes', 'franquia'].filter((p) => m[p] !== null && m[p] !== undefined).map((p) => [p, cols[m[p]].display_name || cols[m[p]].name]));
  if (m.formato === 'largo') { delete m.nomes.valor; m.nomes.movimentos = m.largas.map((l) => cols[l.k].display_name || cols[l.k].name); }
  return m;
}

function linhasDoCard(cols, rows, m, ym, nomesFranquia) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ultimo = ym + '-' + String(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate()).padStart(2, '0');
  const dataPadrao = hoje.startsWith(ym) ? hoje : ultimo;   // sem coluna de dia, o mês inteiro entra numa data só
  const agg = new Map();
  const soma = (data, fid, ind, mrr, cli) => {
    if (!ind || !data.startsWith(ym.slice(0, 4))) return;
    const k = data + '|' + fid + '|' + ind, a = agg.get(k) || { data, franquiaId: fid, ind, mrr: 0, clientes: 0 };
    a.mrr += Math.abs(Number(mrr) || 0); a.clientes += Math.abs(Number(cli) || 0); agg.set(k, a);
  };
  for (const r of rows) {
    const data = m.data !== null ? String(r[m.data] ?? '').slice(0, 10) : dataPadrao;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    const nome = m.franquia !== null ? String(r[m.franquia] ?? '').trim() : '';
    const fid = nome ? idFranquia(nome) : 'rede';
    if (nome) nomesFranquia[fid] = nome;
    if (m.formato === 'longo') soma(data, fid, movimentoDe(r[m.status]), r[m.valor], m.clientes !== null ? r[m.clientes] : 1);
    else for (const l of m.largas) soma(data, fid, l.ind, r[l.k], 0);
  }
  return [...agg.values()].map((l) => ({ ...l, mrr: Math.round(l.mrr * 100) / 100 }));
}

let ESTRUTURA = { em: 0, id: null, dash: null, escolha: null };
const CACHE_MES = new Map();

async function consultarDashcard(dashId, dc, filtroMes, ym) {
  const alvo = filtroMes && (dc.parameter_mappings || []).find((p) => p.parameter_id === filtroMes.id);
  const parameters = alvo ? [{ id: filtroMes.id, type: filtroMes.type, value: ym, target: alvo.target }] : [];
  const q = await mb('/api/dashboard/' + dashId + '/dashcard/' + dc.id + '/card/' + dc.card_id + '/query', { method: 'POST', body: JSON.stringify({ parameters }) });
  return { cols: q.data?.cols || [], rows: q.data?.rows || [], filtrado: !!alvo };
}

async function lerRealizadoDashboard(ano) {
  const dashId = Number(process.env.METABASE_DASHBOARD_ID) || 592;
  const inicio = Date.now(), PRAZO = 8000;                 // a Vercel corta a função em 10 s
  if (ESTRUTURA.id !== dashId || Date.now() - ESTRUTURA.em > 60 * 60 * 1000) {
    ESTRUTURA = { em: Date.now(), id: dashId, dash: await mb('/api/dashboard/' + dashId), escolha: null };
  }
  const dash = ESTRUTURA.dash;
  const filtroMes = (dash.parameters || []).find((p) => /month-year/.test(p.type || '')) ||
    (dash.parameters || []).find((p) => /^date/.test(p.type || '') && /mes|month|ano/.test(slug(p.name + ' ' + p.slug)));
  const agora = new Date(), anoAtual = agora.getFullYear();
  const ultimoMes = ano < anoAtual ? 12 : ano === anoAtual ? agora.getMonth() + 1 : 0;
  if (!ultimoMes) return { fonte: 'metabase', linhas: [], info: { dashboard: dash.name, meses: [] } };
  const ymAtual = ano + '-' + String(ultimoMes).padStart(2, '0');

  // Escolhe o card: testa cada um no mês mais recente e fica com o que tiver status e MRR
  if (!ESTRUTURA.escolha) {
    const candidatos = (dash.dashcards || dash.ordered_cards || []).filter((d) => d.card_id && !/text|heading|link|iframe/.test(d.card?.display || ''));
    const testes = await Promise.all(candidatos.slice(0, 12).map(async (dc) => {
      try { const r = await consultarDashcard(dashId, dc, filtroMes, ymAtual); return { dc, r, m: mapearColunas(r.cols, r.rows) }; }
      catch (e) { return null; }
    }));
    const melhor = testes.filter((x) => x && x.m.pontos >= 15).sort((a, b) => b.m.pontos - a.m.pontos || b.r.rows.length - a.r.rows.length)[0];
    if (!melhor) throw Object.assign(new Error('Nenhum card do dashboard ' + dashId + ' tem colunas de status (NEW, UP, DOWN, CHURN) e de MRR'), { status: 422 });
    ESTRUTURA.escolha = { dc: melhor.dc, m: melhor.m, filtrado: melhor.r.filtrado };
    CACHE_MES.set(dashId + '|' + melhor.dc.id + '|' + ymAtual, { em: Date.now(), cols: melhor.r.cols, rows: melhor.r.rows });
  }
  const { dc, m, filtrado } = ESTRUTURA.escolha;
  const meses = filtrado ? Array.from({ length: ultimoMes }, (_, i) => ano + '-' + String(i + 1).padStart(2, '0')) : [String(ano)];

  // Meses fechados ficam 6 h em cache; o mês corrente, 10 min. Cada mês entra no cache assim que chega.
  const pendentes = meses.filter((ym) => {
    const c = CACHE_MES.get(dashId + '|' + dc.id + '|' + ym);
    const ttl = ym === ymAtual || ym === String(ano) ? 10 * 60 * 1000 : 6 * 60 * 60 * 1000;
    return !c || Date.now() - c.em > ttl;
  });
  const fila = [...pendentes];
  await Promise.race([
    Promise.all(Array.from({ length: 4 }, async () => {
      while (fila.length) {
        const ym = fila.shift();
        try {
          const r = await consultarDashcard(dashId, dc, filtroMes, ym === String(ano) ? ymAtual : ym);
          CACHE_MES.set(dashId + '|' + dc.id + '|' + ym, { em: Date.now(), cols: r.cols, rows: r.rows });
        } catch (e) { /* tenta de novo na próxima chamada */ }
      }
    })),
    new Promise((ok) => setTimeout(ok, Math.max(0, PRAZO - (Date.now() - inicio))))
  ]);

  const nomesFranquia = {}, linhas = [], faltando = [];
  for (const ym of meses) {
    const c = CACHE_MES.get(dashId + '|' + dc.id + '|' + ym);
    if (!c) { faltando.push(ym); continue; }
    linhas.push(...linhasDoCard(c.cols, c.rows, m, ym === String(ano) ? String(ano) : ym, nomesFranquia));
  }
  return {
    fonte: 'metabase', linhas,
    info: {
      modo: 'automatico', dashboard: dash.name, dashboardId: dashId, card: dc.card?.name, cardId: dc.card_id,
      colunas: m.nomes, granularidade: m.data !== null ? 'diaria' : 'mensal',
      filtroMes: filtroMes ? filtroMes.name : null, mesesCarregando: faltando, nomesFranquia,
      semCrossSell: !linhas.some((l) => l.ind === 'cross')
    }
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const u = auth(req);
    const ano = Number(req.query?.ano) || new Date().getFullYear();
    if (ano < 2020 || ano > 2100) return res.status(400).json({ ok: false, error: 'Ano invalido' });

    if (req.method === 'GET' && req.query?.diagnostico) {
      if (u.papel !== 'admin') return res.status(403).json({ ok: false, error: 'Somente administradores' });
      const id = Number(req.query.diagnostico) || Number(process.env.METABASE_DASHBOARD_ID) || 592;
      return res.status(200).json({ ok: true, ...(await diagnosticarMetabase(id)) });
    }

    if (req.method === 'GET') {
      const usaPlanilha = planilhaConfigurada();
      const forcar = u.papel === 'admin' && req.query?.atualizar === '1';
      const [origem, real] = await Promise.all([
        usaPlanilha ? lerPlanilha(ano, forcar) : lerMetas(ano).then((x) => x.doc),
        lerRealizado(ano)
      ]);
      let metas = origem.metas || {}, linhas = real.linhas;
      // Franqueado só recebe o que é dele. O filtro é feito aqui, nunca no navegador.
      if (u.papel !== 'admin') {
        const f = u.franquiaId;
        metas = metas[f] ? { [f]: metas[f] } : {};
        linhas = linhas.filter((l) => l.franquiaId === f);
      }
      return res.status(200).json({
        ok: true, ano, papel: u.papel, franquiaId: u.franquiaId || null,
        fonte: real.fonte,
        ...(u.papel === 'admin' ? { realizadoInfo: real.info || null, realizadoErro: real.erro || null } : {}),
        carregando: !!real.info?.mesesCarregando?.length,
        granularidade: real.info?.granularidade || 'diaria',
        metasFonte: usaPlanilha ? 'planilha' : 'portal',
        atualizadoEm: usaPlanilha ? origem.lidoEm : (origem.atualizadoEm || null),
        atualizadoPor: usaPlanilha ? null : (origem.atualizadoPor || null),
        ...(usaPlanilha && u.papel === 'admin' ? {
          planilha: { url: 'https://docs.google.com/spreadsheets/d/' + process.env.METAS_SHEET_ID + '/edit', abas: origem.abas, mesesSemAba: origem.mesesSemAba || [], avisos: origem.avisos || [] }
        } : {}),
        metas, realizado: linhas
      });
    }

    if (req.method === 'PUT') {
      if (u.papel !== 'admin') return res.status(403).json({ ok: false, error: 'Somente administradores podem alterar metas' });
      if (planilhaConfigurada()) return res.status(409).json({ ok: false, error: 'As metas vêm da planilha do Google. Altere por lá.' });
      const corpo = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const novas = limparMetas(corpo.metas);
      const { doc, sha } = await lerMetas(ano);
      const final = {
        ano,
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: u.login,
        metas: corpo.substituir ? novas : { ...(doc.metas || {}), ...novas }
      };
      const body = {
        message: 'Portal: metas ' + ano + ' (' + Object.keys(novas).length + ' franquias) por ' + u.login,
        content: Buffer.from(JSON.stringify(final, null, 2)).toString('base64'),
        branch: BRANCH
      };
      if (sha) body.sha = sha;
      await gh('/contents/config/metas/' + ano + '.json', { method: 'PUT', body: JSON.stringify(body) });
      return res.status(200).json({ ok: true, ano, franquias: Object.keys(final.metas).length });
    }

    return res.status(405).json({ ok: false, error: 'Metodo nao permitido' });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }
}
