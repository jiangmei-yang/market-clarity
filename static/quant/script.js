const $ = (selector) => document.querySelector(selector);
let currentRule = null;

document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tabs button,.panel').forEach((item) => item.classList.remove('active'));
  button.classList.add('active'); document.getElementById(button.dataset.tab).classList.add('active');
}));
document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => $('#ruleText').value = button.dataset.example));

async function json(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || '请求失败');
  return payload;
}

$('#parseRule').addEventListener('click', async () => {
  const button = $('#parseRule'); button.disabled = true; button.textContent = '正在整理…';
  try { const parsed = await json('/quant/rules/parse', { method: 'POST', body: JSON.stringify({ text: $('#ruleText').value }) }); currentRule = parsed.rule_set; renderRule(parsed); }
  catch (error) { $('#rulePreview').innerHTML = `<div class="empty"><b>无法整理规则</b><span>${error.message}</span></div>`; }
  finally { button.disabled = false; button.textContent = '整理成规则'; }
});

function renderRule(parsed) {
  const items = parsed.rule_set.conditions.map((item) => `<div class="condition"><i>✓</i><div><b>${item.description}</b><p>${item.definition}</p></div><strong>${item.category}</strong></div>`).join('');
  const questions = parsed.clarification_questions.length ? `<div class="clarify"><b>仍需确认</b><br>${parsed.clarification_questions.join('<br>')}</div>` : '';
  $('#rulePreview').innerHTML = `<div class="rule-summary"><div><h3>${parsed.rule_set.name}</h3><p>${parsed.rule_set.conditions.length} 条条件 · 尚未确认</p></div><span class="badge">草稿</span></div><div class="condition-list">${items || '<div class="empty"><b>没有可执行条件</b><span>请补充指标、方向和阈值。</span></div>'}</div>${questions}<div class="preview-actions"><button class="secondary" id="editRule">返回修改</button><button class="primary" id="confirmRule" ${items ? '' : 'disabled'}>确认并保存</button></div>`;
  $('#editRule').onclick = () => $('#ruleText').focus(); $('#confirmRule').onclick = confirmRule;
}

async function confirmRule() {
  try { const saved = await json('/quant/rules', { method: 'POST', body: JSON.stringify({ rule_set: currentRule }) }); const confirmed = await json(`/quant/rules/${saved.rule_set.rule_set_id}/confirm`, { method: 'POST' }); currentRule = confirmed.rule_set; $('.rule-summary p').textContent = `${currentRule.conditions.length} 条条件 · 已确认`; $('.rule-summary .badge').textContent = '已确认'; $('#confirmRule').textContent = '规则已生效'; $('#confirmRule').disabled = true; }
  catch (error) { alert(error.message); }
}

$('#runScreen').addEventListener('click', async () => {
  if (!currentRule?.confirmed_at) return alert('请先整理并确认规则');
  try { const data = await json('/quant/screen', { method: 'POST', body: JSON.stringify({ rule_set_id: currentRule.rule_set_id, limit: 20, current_holdings: ['600183'] }) }); renderScreen(data.results); }
  catch (error) { alert(error.message); }
});
function renderScreen(results) {
  const cell = (items, state, word) => `<span class="state ${state}">${items.length} ${word}</span>${items.length ? `<details><summary>查看明细</summary>${items.map(x => `<p>${x.label}：${x.actual ?? '暂无数据'} ${x.unit}<br>${x.data_date} · ${x.source}</p>`).join('')}</details>` : ''}`;
  $('#screenResult').innerHTML = `<table class="screen-table"><thead><tr><th>标的</th><th>通过条件</th><th>未通过条件</th><th>数据缺失</th><th>与持仓关系</th></tr></thead><tbody>${results.map(row => `<tr><td class="stock"><b>${row.name}</b><small>${row.code} · ${row.sector}</small></td><td>${cell(row.matched_conditions,'pass','通过')}</td><td>${cell(row.failed_conditions,'fail','未通过')}</td><td>${cell(row.missing_conditions,'unknown','缺失')}</td><td>${row.portfolio_overlap.length ? '<span class="state unknown">当前持有</span>' : '无重复'}</td></tr>`).join('')}</tbody></table>`;
}

$('#runValidate').addEventListener('click', async () => {
  const text = currentRule ? currentRule.source_text : $('#ruleText').value;
  try { const parsed = await json('/v1/quant/parse', { method:'POST', body:JSON.stringify({ question:text, stock_code:'600183' }) }); parsed.hypothesis.confirmed_at = new Date().toISOString(); const run = await json('/v1/quant/run', { method:'POST', body:JSON.stringify(parsed.hypothesis) }); const r=run.result; const cards=document.querySelectorAll('.validation-grid article'); cards[0].querySelector('b').textContent=r.conclusion; cards[0].querySelector('p').textContent=r.conclusion_reason; cards[1].querySelector('b').textContent=`${r.metrics.max_drawdown}%`; cards[1].querySelector('small').textContent='历史峰谷跌幅'; cards[2].querySelector('b').textContent=`${r.cost_impact_pct}%`; cards[2].querySelector('small').textContent=`往返成本 ${r.cost_sensitivity[1].round_trip_bps} bp`; cards[3].querySelector('b').textContent=r.audit.parameter_fragility?'敏感':'方向一致'; cards[3].querySelector('small').textContent='阈值 ±20% 检查'; }
  catch(error){ alert(error.message); }
});

function positions(){ return ['p1','p2','p3'].map(id=>$('#'+id).value.split(',')).filter(x=>x[0]).map(([code,name,market_value,sector])=>({code,name,market_value:Number(market_value),sector})); }
$('#runRisk').addEventListener('click', async () => { const [sector,shock]=$('#scenario').value.split(','); try { const data=await json('/quant/portfolio/scenario',{method:'POST',body:JSON.stringify({positions:positions(),scenarios:[{name:`${sector}行业下跌 ${Math.abs(shock)}%`,sector,shock_pct:Number(shock)}]})}); $('#riskResult').innerHTML=data.exposures.map(x=>`<div class="exposure-row"><header><b>${x.name}</b><span>${x.weight_pct}%</span></header><div class="bar"><i style="width:${x.weight_pct}%"></i></div></div>`).join('')+`<div class="scenario-result"><b>组合估算影响 ${data.scenarios[0].estimated_impact_pct}%</b><p>${data.scenarios[0].calculation_note}</p><p>${data.disclaimer}</p></div>`; } catch(error){alert(error.message);} });

$('#runAlerts').addEventListener('click', async () => { if(!currentRule?.confirmed_at)return alert('请先确认规则'); try{const data=await json('/quant/alerts/evaluate',{method:'POST',body:JSON.stringify({rule_set_id:currentRule.rule_set_id})}); $('#alertResult').innerHTML=data.items.length?data.items.map(x=>`<article class="alert-row"><span class="badge">${x.severity==='high'?'高':'需复核'}</span><div><h3>${x.asset_code} · ${x.title}</h3><p>${x.suggestion}</p></div><button data-alert="${x.alert_id}">标记已读</button></article>`).join(''):'<div class="empty"><b>当前没有偏离</b><span>所有有数据的条件仍满足。</span></div>'; document.querySelectorAll('[data-alert]').forEach(b=>b.onclick=async()=>{await json(`/quant/alerts/${b.dataset.alert}/read`,{method:'PUT'});b.textContent='已读';b.disabled=true;});}catch(error){alert(error.message);} });
