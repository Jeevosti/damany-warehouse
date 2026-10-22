import {useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, BatteryCharging, Check, ChevronDown, FileText, Plus, Printer, Save, Sun, Trash2, Zap} from 'lucide-react';
import {Button, Field, FormError, IconButton, Input, Select, Textarea} from '../components/ui';
import type {Snapshot} from '../lib/types';
import type {QuoteBrief, QuoteDraft, QuoteEquipment, QuoteSizing} from './solarQuotation';
import {newQuoteLoad, prepareQuotation, quoteCents, quoteEquipmentIssues, quoteLineTotal, quoteMoney, quotePercent, quotationLines, quotationTotals, sizeQuotation} from './solarQuotation';
import {appliancePresets, applyQuoteProduct, changeBackup, newQuoteBrief, presetLoad, previewSizing, productKind, quoteGoals, simpleStepError, siteScenarios, suggestQuoteProducts} from './simpleQuotation';
import type {EquipmentKind} from './simpleQuotation';
import './simple-quotation.css';

type Props = {draft: QuoteDraft; data: Snapshot; edit: (draft: QuoteDraft) => void; busy: boolean; error: string; onSave: () => void; onPreview: () => void; onDetailed: () => void};
const format = (value: number) => value.toLocaleString('en-KE', {maximumFractionDigits: 2});
const num = (value: string) => value === '' ? 0 : Number(value);
function lineAmount(line: ReturnType<typeof quotationLines>[number]) {if (line.unit_price_cents === null) return 'Price needed'; try {return quoteMoney(quoteLineTotal(line));} catch {return 'Check quantity / price';}}

function NumberField({label, value, onChange, step = '0.01', min = 0, max}: {label: string; value: number; onChange: (value: number) => void; step?: string; min?: number; max?: number}) {
  return <Field label={label}><Input type="number" min={min} max={max} step={step} value={value || ''} onChange={event => onChange(num(event.target.value))}/></Field>;
}

export function SimpleQuoteBuilder({draft, data, edit, busy, error, onSave, onPreview, onDetailed}: Props) {
  const [step, setStep] = useState(0), [review, setReview] = useState(false), [localError, setLocalError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const brief = draft.brief || newQuoteBrief(), equipment = draft.equipment;
  const update = (next: QuoteDraft) => {setLocalError(''); edit(next);};
  const setBrief = (values: Partial<QuoteBrief>) => update({...draft, brief: {...brief, ...values}});
  const setEquipment = <K extends keyof QuoteEquipment>(key: K, value: QuoteEquipment[K]) => update({...draft, equipment: {...equipment, [key]: value}});
  const move = (next: number) => {setStep(next); setLocalError(''); heading.current?.scrollIntoView({behavior: 'smooth', block: 'start'}); heading.current?.focus({preventScroll: true});};
  function next() {const message = simpleStepError(step, draft); if (message) {setLocalError(message); return;} move(step + 1);}
  function generate() {
    for (let index = 0; index < 2; index++) {const message = simpleStepError(index, draft); if (message) {move(index); setLocalError(message); return;}}
    if (!draft.customer.name.trim()) {setLocalError('Enter the customer name or choose an existing customer.'); return;}
    try {if (brief.budget.trim()) quoteCents(brief.budget);} catch {setLocalError('Enter the budget in KES without commas, or leave it blank.'); return;}
    update(suggestQuoteProducts(draft, data.inventory_items)); setReview(true);
    heading.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function chooseScenario(scenario: string) {
    const automaticTitle = !draft.project_title || draft.project_title === 'Solar installation' || siteScenarios.some(value => draft.project_title === `${value} solar installation`);
    update({...draft, project_title: automaticTitle ? `${scenario} solar installation` : draft.project_title, brief: {...brief, scenario}});
  }
  function toggleAppliance(name: string) {
    const existing = draft.demand.loads.some(load => load.name === name);
    const loads = existing ? draft.demand.loads.filter(load => load.name !== name) : [...draft.demand.loads.filter(load => load.name || load.watts || load.hours), presetLoad(name, brief)];
    update({...draft, demand: {...draft.demand, mode: 'appliances', loads}});
  }
  function setLoad(id: string, values: Partial<QuoteDraft['demand']['loads'][number]>) {
    update({...draft, demand: {...draft.demand, loads: draft.demand.loads.map(load => load.id === id ? {...load, ...values} : load)}});
  }
  let sizing: QuoteSizing | undefined;
  try {sizing = previewSizing(draft);} catch { /* The current step shows input guidance. */ }
  const selectedNames = draft.demand.loads.filter(load => load.name).map(load => `${load.quantity} × ${load.name}`).join(', ');

  function equipmentRow(kind: EquipmentKind) {
    const title = kind === 'panel' ? 'Solar panels' : kind === 'inverter' ? 'Inverter' : 'Battery backup';
    const Icon = kind === 'panel' ? Sun : kind === 'inverter' ? Zap : BatteryCharging;
    const candidates = data.inventory_items.filter(item => productKind(item) === kind);
    const selected = candidates.find(item => `${item.brand} ${item.model}`.trim() === equipment[`${kind}_name`]);
    return <section className="sq-product" key={kind}>
      <h3><Icon size={18}/>{title}</h3>
      <div className="sq-product-main"><Field label={`${title} from inventory`}><Select value={selected?.id || ''} onChange={event => {const item = candidates.find(row => row.id === event.target.value); if (item) update(applyQuoteProduct(draft, kind, item)); else update({...draft, equipment: {...equipment, [`${kind}_name`]: kind === 'panel' ? 'Solar panel' : kind === 'inverter' ? 'Inverter' : 'Battery bank unit', [`${kind}_price`]: ''}});}}><option value="">Enter product manually</option>{candidates.map(item => <option value={item.id} key={item.id}>{item.brand} {item.model} · {quoteMoney(Math.round(Number(item.unit_price) * 100))}{item.total_stock === 0 ? ' · Out of stock' : ''}</option>)}</Select></Field>
        <Field label={`${title} price each (KES)`}><Input inputMode="decimal" placeholder="Enter price" value={equipment[`${kind}_price`]} onChange={event => setEquipment(`${kind}_price`, event.target.value)}/></Field></div>
      {!selected && <Field label={`${title} name / model`}><Input maxLength={160} value={equipment[`${kind}_name`]} onChange={event => setEquipment(`${kind}_name`, event.target.value)}/></Field>}
      <div className="sq-grid sq-grid-2">
        {kind === 'panel' && <NumberField label="Panel rating (W each)" min={1} max={2000} value={equipment.panel_watts} onChange={value => setEquipment('panel_watts', value)}/>}
        {kind === 'inverter' && <NumberField label="Inverter output (kW)" min={0.01} max={1000} value={equipment.inverter_kw} onChange={value => setEquipment('inverter_kw', value)}/>}
        {kind === 'battery' && <><NumberField label="Battery capacity (kWh each)" min={0.01} max={1000} value={equipment.battery_kwh} onChange={value => setEquipment('battery_kwh', value)}/><NumberField label="Battery continuous output (kW each)" min={0.01} max={1000} value={equipment.battery_output_kw} onChange={value => setEquipment('battery_output_kw', value)}/></>}
      </div>
      {kind === 'battery' && <p className="sq-help">Use the battery datasheet's continuous DC output. Capacity in kWh is a different rating.</p>}
      {selected?.total_stock === 0 && <p className="sq-help sq-warning">This product is out of stock. Confirm availability before offering an installation date.</p>}
    </section>;
  }

  let lines: ReturnType<typeof quotationLines> | undefined, totals: ReturnType<typeof quotationTotals> | undefined, calculationError = '', validationError = '';
  if (review) {
    try {const actual = sizeQuotation(draft); lines = quotationLines(draft, actual); totals = quotationTotals(lines, quoteCents(draft.discount), quotePercent(draft.tax_percent), quotePercent(draft.deposit_percent)); const issues = quoteEquipmentIssues(draft, actual); if (issues.length) validationError = issues[0];}
    catch (value) {calculationError = value instanceof Error ? value.message : 'Check the equipment ratings and prices.';}
    if (!calculationError && !validationError) try {prepareQuotation(draft);} catch (value) {validationError = value instanceof Error ? value.message : 'Check the quotation details.';}
  }
  let budgetCents = 0;
  try {if (brief.budget.trim()) budgetCents = quoteCents(brief.budget);} catch { /* The budget is not included in the project total. */ }
  const needsBattery = sizing ? sizing.backup_kwh > 0 : draft.demand.mode === 'known' ? draft.demand.backup_hours > 0 : draft.demand.loads.some(load => load.backup_hours > 0);

  return <div className="sq">
    <div className="sq-intro"><span className="sq-eyebrow">DAMANY SOLAR</span><h2 ref={heading} tabIndex={-1}>{review ? 'Your itemised quotation' : 'Build a solar quote'}</h2><p>{review ? 'Review the equipment, complete the prices, then save or print.' : 'Three quick steps. Tell us about the site, its power needs and the customer.'}</p></div>
    <fieldset className="q-fieldset" disabled={busy}>
      {!review ? <div className="panel sq-card">
        <nav className="sq-steps" aria-label="Quote steps">{['Your site', 'Your needs', 'Details & budget'].map((label, index) => <button key={label} type="button" disabled={index > step} aria-current={step === index ? 'step' : undefined} onClick={() => move(index)}><span>{index < step ? <Check size={14}/> : index + 1}</span>{label}</button>)}</nav>
        <div className="sq-step-body">
          {step === 0 && <>
            <h3>What are we powering?</h3><div className="sq-choices">{siteScenarios.map(scenario => <button type="button" key={scenario} aria-pressed={brief.scenario === scenario} onClick={() => chooseScenario(scenario)}>{scenario}{brief.scenario === scenario && <Check size={15}/>}</button>)}</div>
            {!brief.scenario && <p className="sq-help">Choose a site to get started.</p>}
            {brief.scenario === 'Home' && <div className="sq-grid sq-grid-2 sq-site-fields"><Field label="Home type"><Select value={brief.site_type} onChange={event => setBrief({site_type: event.target.value})}><option value="">Select home type</option>{['Bungalow', 'Maisonette', 'Apartment', 'Villa', 'Townhouse', 'Gated community'].map(type => <option key={type}>{type}</option>)}</Select></Field><NumberField label="Number of rooms" step="1" min={1} max={10000} value={brief.rooms} onChange={rooms => setBrief({rooms})}/></div>}
            {brief.scenario && brief.scenario !== 'Home' && <Field label="Tell us a little about the site (optional)"><Input maxLength={500} placeholder="e.g. a shop with lighting, tills and two freezers" value={brief.site_notes} onChange={event => setBrief({site_notes: event.target.value})}/></Field>}
          </>}
          {step === 1 && <>
            <div className="sq-section-heading"><h3>What needs power?</h3><button type="button" className="sq-text-button" onClick={() => update({...draft, demand: {...draft.demand, mode: draft.demand.mode === 'known' ? 'appliances' : 'known'}})}>{draft.demand.mode === 'known' ? 'Choose appliances instead' : 'I know the power requirement'}</button></div>
            {draft.demand.mode === 'appliances' ? <><div className="sq-choices">{appliancePresets.map(preset => {const selected = draft.demand.loads.some(load => load.name === preset.name); return <button key={preset.name} type="button" aria-pressed={selected} onClick={() => toggleAppliance(preset.name)}>{preset.name}{selected && <Check size={15}/>}</button>;})}</div>
              <p className="sq-help">Appliance figures are starting estimates. Check quantities, watts and daily use with the customer.</p>
              <details className="sq-details"><summary>Edit appliances & quantities <ChevronDown size={15}/></summary><div className="sq-details-body">{draft.demand.loads.map(load => <div className="sq-load" key={load.id}><div className="sq-load-name"><Field label="Appliance"><Input maxLength={120} value={load.name} onChange={event => setLoad(load.id, {name: event.target.value})}/></Field><IconButton label={`Remove ${load.name || 'appliance'}`} onClick={() => update({...draft, demand: {...draft.demand, loads: draft.demand.loads.filter(item => item.id !== load.id)}})}><Trash2 size={15}/></IconButton></div><div className="sq-load-numbers"><NumberField label="Quantity" step="1" min={1} value={load.quantity} onChange={quantity => setLoad(load.id, {quantity})}/><NumberField label="Watts each" min={1} value={load.watts} onChange={watts => setLoad(load.id, {watts})}/><NumberField label="Hours / day" min={0.01} max={24} value={load.hours} onChange={hours => setLoad(load.id, {hours, backup_hours: Math.min(load.backup_hours, hours)})}/><NumberField label="Backup hours" max={load.hours} value={load.backup_hours} onChange={backup_hours => setLoad(load.id, {backup_hours})}/></div></div>)}<Button variant="secondary" type="button" disabled={draft.demand.loads.length >= 100} onClick={() => update({...draft, demand: {...draft.demand, loads: [...draft.demand.loads, newQuoteLoad()]}})}><Plus size={15}/>Add another appliance</Button><p className="sq-help">Hours are effective running hours. Set backup hours to 0 for appliances that will be off during an outage.</p></div></details>
            </> : <div className="sq-grid sq-grid-2"><NumberField label="Peak power needed (kW)" min={0.01} max={1000} value={draft.demand.peak_kw} onChange={peak_kw => update({...draft, demand: {...draft.demand, peak_kw, backup_kw: Math.min(draft.demand.backup_kw, peak_kw)}})}/><NumberField label="Daily energy needed (kWh)" min={0.01} max={24000} value={draft.demand.daily_kwh} onChange={daily_kwh => update({...draft, demand: {...draft.demand, daily_kwh}})}/></div>}
            <div className="sq-grid sq-grid-2 sq-spaced"><Field label="What should solar do?"><Select value={brief.goal} onChange={event => update(changeBackup(draft, event.target.value, brief.backup_hours || 4))}><option value="">Select your goal</option>{quoteGoals.map(goal => <option key={goal}>{goal}</option>)}</Select></Field><Field label="Backup runtime needed"><Select disabled={brief.goal === 'Reduce electricity bills'} value={brief.backup_hours} onChange={event => update(changeBackup(draft, brief.goal, Number(event.target.value)))}>{[0, 2, 4, 8, 12, 24].map(hours => <option value={hours} key={hours}>{hours === 0 ? 'No battery backup' : hours === 12 ? 'Overnight (12 hours)' : `${hours} hours`}</option>)}</Select></Field></div>
            {draft.demand.mode === 'known' && brief.backup_hours > 0 && <NumberField label="Power needed during backup (kW)" value={draft.demand.backup_kw} max={draft.demand.peak_kw} onChange={backup_kw => update({...draft, demand: {...draft.demand, backup_kw}})}/>}
            {sizing && <div className="sq-demand"><span><Zap size={16}/><strong>{format(sizing.peak_kw)} kW</strong> running load</span><span><Sun size={16}/><strong>{format(sizing.daily_kwh)} kWh</strong> per day</span></div>}
          </>}
          {step === 2 && <>
            <h3>Who is this quote for?</h3>
            <Field label="Existing customer (optional)"><Select value="" onChange={event => {const client = data.clients.find(item => item.id === event.target.value); if (client) update({...draft, customer: {name: client.name, phone: client.phone, email: client.email, address: client.location_address}, brief: {...brief, location: brief.location || client.location_address}});}}><option value="">Choose a customer or enter their name below</option>{data.clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</Select></Field>
            <div className="sq-grid sq-grid-2"><Field label="Customer name"><Input maxLength={160} autoComplete="name" value={draft.customer.name} onChange={event => update({...draft, customer: {...draft.customer, name: event.target.value}})}/></Field><Field label="Phone (optional)"><Input type="tel" maxLength={500} value={draft.customer.phone} onChange={event => update({...draft, customer: {...draft.customer, phone: event.target.value}})}/></Field><Field label="Site location / county"><Input maxLength={500} placeholder="e.g. Ruiru, Kiambu" value={brief.location} onChange={event => setBrief({location: event.target.value})}/></Field><Field label="Customer budget (KES, optional)"><Input inputMode="decimal" placeholder="e.g. 250000" value={brief.budget} onChange={event => setBrief({budget: event.target.value})}/></Field><Field label="Grid connection"><Select value={brief.grid} onChange={event => setBrief({grid: event.target.value})}><option value="">Select grid situation</option>{['Reliable grid', 'Frequent outages', 'No grid connection', 'Not sure yet'].map(value => <option key={value}>{value}</option>)}</Select></Field><Field label="Installation timeline"><Select value={brief.timeline} onChange={event => setBrief({timeline: event.target.value})}><option value="">Select a timeline (optional)</option>{['As soon as possible', 'Within 1 month', 'Within 3 months', 'Just planning'].map(value => <option key={value}>{value}</option>)}</Select></Field></div>
            <div className="sq-answers"><h4>Review your answers</h4><dl><dt>Site</dt><dd>{brief.scenario}{brief.scenario === 'Home' ? ` · ${brief.site_type} · ${brief.rooms} rooms` : ''}</dd><dt>Power needs</dt><dd>{draft.demand.mode === 'appliances' ? selectedNames : `${format(draft.demand.peak_kw)} kW peak · ${format(draft.demand.daily_kwh)} kWh/day`}</dd><dt>Goal</dt><dd>{brief.goal}</dd></dl></div>
          </>}
          <FormError message={localError || error}/>
          <div className="sq-navigation">{step > 0 && <Button type="button" variant="secondary" onClick={() => move(step - 1)}><ArrowLeft size={16}/>Back</Button>}<Button type="button" onClick={step === 2 ? generate : next}>{step === 2 ? <><FileText size={16}/>Build my quotation</> : <>Next<ArrowRight size={16}/></>}</Button></div>
        </div>
      </div> : <div className="sq-review">
        <div className="sq-review-bar"><button type="button" className="sq-text-button" onClick={() => {setReview(false); move(2);}}><ArrowLeft size={15}/>Edit answers</button><span>{draft.customer.name} · {brief.scenario || draft.project_title}{brief.location ? ` · ${brief.location}` : ''}</span></div>
        {sizing && <div className="sq-system"><div><Sun size={19}/><span>Solar array needed</span><strong>{format(sizing.minimum_solar_kw)} <small>kWp</small></strong></div><div><Zap size={19}/><span>Inverter needed</span><strong>{format(sizing.minimum_inverter_kw)} <small>kW</small></strong></div><div><BatteryCharging size={19}/><span>Battery energy needed</span><strong>{format(sizing.minimum_battery_kwh)} <small>kWh</small></strong></div></div>}
        <div className="panel sq-card sq-review-card"><div className="sq-section-heading"><div><h3>Equipment & installation</h3><p className="sq-help">Prices come from your inventory. Check product ratings and add the installation costs.</p></div></div>
          {equipmentRow('panel')}{equipmentRow('inverter')}{needsBattery && equipmentRow('battery')}
          <section className="sq-costs"><h3>Installation & other costs</h3>{draft.extras.map((line, index) => <div className="sq-cost" key={line.id}><span>{line.description || `Cost item ${index + 1}`}{line.quantity !== 1 ? ` × ${line.quantity}` : ''}</span><Field label={`${line.description || 'Cost item'} unit price (KES)`}><Input aria-label={`${line.description || 'Cost item'} unit price (KES)`} inputMode="decimal" placeholder="Enter KES price" value={line.unit_price} onChange={event => update({...draft, extras: draft.extras.map(item => item.id === line.id ? {...item, unit_price: event.target.value} : item)})}/></Field></div>)}<p className="sq-help">Enter 0 only if a cost is included at no extra charge.</p></section>
          <details className="sq-details"><summary>Discount, tax & payment terms <ChevronDown size={15}/></summary><div className="sq-details-body"><div className="sq-grid sq-grid-3"><Field label="Discount (KES)"><Input inputMode="decimal" value={draft.discount} onChange={event => update({...draft, discount: event.target.value})}/></Field><Field label="Tax rate (%)"><Input inputMode="decimal" value={draft.tax_percent} onChange={event => update({...draft, tax_percent: event.target.value})}/></Field><Field label="Deposit (%)"><Input inputMode="decimal" value={draft.deposit_percent} onChange={event => update({...draft, deposit_percent: event.target.value})}/></Field></div><p className="sq-help">Choose which lines are taxable. The rate applies only to checked lines.</p><div className="sq-tax-options">{(['panel', 'inverter', ...(needsBattery ? ['battery'] : [])] as EquipmentKind[]).map(kind => <label key={kind}><input type="checkbox" checked={equipment[`${kind}_taxable`]} onChange={event => setEquipment(`${kind}_taxable`, event.target.checked)}/>{equipment[`${kind}_name`]}</label>)}{draft.extras.map(line => <label key={line.id}><input type="checkbox" checked={line.taxable} onChange={event => update({...draft, extras: draft.extras.map(item => item.id === line.id ? {...item, taxable: event.target.checked} : item)})}/>{line.description}</label>)}</div><Field label="Valid until"><Input type="date" min={draft.issued_on} value={draft.valid_until} onChange={event => update({...draft, valid_until: event.target.value})}/></Field><Field label="Scope & terms"><Textarea rows={4} maxLength={4000} value={draft.terms} onChange={event => update({...draft, terms: event.target.value})}/></Field></div></details>
        </div>
        <div className="panel sq-card sq-total-card"><h3>Quotation summary</h3>{lines && <div className="sq-breakdown">{lines.map((line, index) => <div key={index}><span>{line.quantity} × {line.description}</span><strong>{lineAmount(line)}</strong></div>)}</div>}
          {totals ? <><div className="sq-breakdown"><div><span>Subtotal</span><strong>{quoteMoney(totals.subtotal_cents)}</strong></div>{totals.discount_cents > 0 && <div><span>Discount</span><strong>− {quoteMoney(totals.discount_cents)}</strong></div>}<div><span>Tax</span><strong>{quoteMoney(totals.tax_cents)}</strong></div></div><div className="sq-total"><span>Total project cost</span><strong>{quoteMoney(totals.total_cents)}</strong></div>{budgetCents > 0 && <p className={`sq-budget ${totals.total_cents > budgetCents ? 'sq-warning' : ''}`}>{totals.total_cents > budgetCents ? `${quoteMoney(totals.total_cents - budgetCents)} above the customer's budget. Review the scope with them.` : `Within the customer's ${quoteMoney(budgetCents)} budget.`}</p>}{totals.deposit_cents > 0 && <p className="sq-help">Deposit: {quoteMoney(totals.deposit_cents)} · Balance: {quoteMoney(totals.remainder_cents)}</p>}</> : <p className="sq-help">Complete the equipment ratings and every required price to see the full project total.</p>}
          <FormError message={localError || error || calculationError || validationError}/><p className="sq-help">Planning estimate, subject to site survey and equipment compatibility. Saving a quote does not deduct stock.</p>
          <div className="sq-final-actions"><Button type="button" disabled={!!calculationError || !!validationError} onClick={onSave}><Save size={16}/>{busy ? 'Saving…' : 'Save quotation'}</Button><Button type="button" variant="secondary" disabled={!!calculationError || !!validationError} onClick={onPreview}><Printer size={16}/>Preview / PDF</Button></div>
        </div>
      </div>}
      <div className="sq-advanced"><button type="button" className="sq-text-button" onClick={onDetailed}>Open detailed editor</button><span>For custom equipment, starting loads and design assumptions.</span></div>
    </fieldset>
  </div>;
}
