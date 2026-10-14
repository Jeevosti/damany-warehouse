import {useState} from 'react';
import {createPortal} from 'react-dom';
import {useQuery} from '@tanstack/react-query';
import {Plus, ReceiptText, Wallet, Clock3, CircleCheck, Printer, Trash2, RotateCcw, Ban, RefreshCw, ChevronLeft, ChevronRight} from 'lucide-react';
import {Badge, Button, Empty, Field, FormError, IconButton, Input, Loading, Modal, PageHead, SearchBox, Select, StatCard} from '../components/ui';
import type {PageProps} from './Overview';
import type {Client} from '../lib/types';
import type {CreateCreditInvoice, CreditInvoice, CreditLine, InvoiceStatus, PaymentMethod, RecordCreditPayment} from '../lib/creditInvoices';
import {balanceCents, creditDueDate, creditError, creditMoney, invoiceStatus, invoiceTotal, moneyToCents, paidCents, paymentMethods, validateCreditInvoice, validateCreditPayment} from '../lib/creditInvoices';
import {formatDate, today} from '../lib/warranty';
import {creditApi} from '../services/creditInvoices';
import '../credit-invoices.css';

type Props = PageProps & {mode: 'live' | 'demo'; userId: string};
const tones: Record<InvoiceStatus, string> = {'Unpaid': 'neutral', 'Part paid': 'amber', 'Paid': 'green', 'Overdue': 'red', 'Voided': 'neutral'};
function Status({invoice}: {invoice: CreditInvoice}) {const status = invoiceStatus(invoice); return <Badge tone={tones[status]} dot>{status}</Badge>;}

export function Invoices({data, query, setQuery, filter, setFilter, open, mode, userId}: Props) {
  const service = creditApi(mode, userId, data.clients);
  const result = useQuery({queryKey: ['credit-invoices', mode, userId], queryFn: () => service.load(), enabled: !!userId, refetchInterval: 60000, retry: 1});
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const invoices = result.data || [];
  const selected = invoices.find(invoice => invoice.id === selectedId);
  const active = invoices.filter(invoice => !invoice.voided_at);
  const outstanding = active.reduce((sum, invoice) => sum + balanceCents(invoice), 0);
  const overdue = active.filter(invoice => invoiceStatus(invoice) === 'Overdue');
  const collected = active.reduce((sum, invoice) => sum + paidCents(invoice), 0);
  const search = query.trim().toLocaleLowerCase();
  const filtered = invoices.filter(invoice => {
    const matches = [invoice.invoice_number, invoice.customer.name, invoice.customer.phone, invoice.customer.email].some(value => value.toLocaleLowerCase().includes(search));
    return matches && (filter === 'all' || invoiceStatus(invoice) === filter);
  });
  const actualPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 20) - 1));
  const visible = filtered.slice(actualPage * 20, actualPage * 20 + 20);
  const refresh = async () => {await result.refetch();};
  return <div className="credit-page">
    <PageHead eyebrow="CUSTOMER ACCOUNTS" title="Credit invoices" description="Keep track of what customers owe, when it is due, and what they have paid.">
      <Button disabled={result.isPending || !!result.error || !data.clients.length} onClick={() => setCreating(true)}><Plus size={17}/>New invoice</Button>
    </PageHead>
    {mode === 'demo' && <div className="credit-notice">Demo invoices stay in this browser. Switch to Live workspace to record real customer invoices.</div>}
    {notice && <div className="credit-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
    {result.isPending ? <Loading/> : result.error ? <div className="panel error-state"><h2>Invoices could not be loaded</h2><FormError message={creditError(result.error)}/><Button onClick={() => result.refetch()}><RefreshCw size={16}/>Try again</Button></div> : <>
      <div className="stats-grid credit-stats">
        <StatCard label="Outstanding" value={creditMoney(outstanding)} caption={`${active.filter(invoice => balanceCents(invoice) > 0).length} invoices awaiting payment`} Icon={Wallet} onClick={() => {setFilter('all'); setPage(0);}}/>
        <StatCard label="Overdue" value={creditMoney(overdue.reduce((sum, invoice) => sum + balanceCents(invoice), 0))} caption={`${overdue.length} invoices past their due date`} Icon={Clock3} tone="amber" onClick={() => {setFilter('Overdue'); setPage(0);}}/>
        <StatCard label="Payments received" value={creditMoney(collected)} caption="Recorded payments, excluding reversals" Icon={CircleCheck} onClick={() => {setFilter('all'); setPage(0);}}/>
        <StatCard label="Credit invoices" value={active.length} caption={`${active.filter(invoice => invoiceStatus(invoice) === 'Paid').length} fully paid`} Icon={ReceiptText} onClick={() => {setFilter('all'); setPage(0);}}/>
      </div>
      <section className="panel">
        <div className="credit-toolbar">
          <label className="credit-filter">Status<Select aria-label="Filter invoices by status" value={filter} onChange={event => {setFilter(event.target.value); setPage(0);}}>{['all', 'Unpaid', 'Part paid', 'Overdue', 'Paid', 'Voided'].map(status => <option key={status} value={status}>{status === 'all' ? 'All invoices' : status}</option>)}</Select></label>
          <SearchBox value={query} onChange={value => {setQuery(value); setPage(0);}} placeholder="Search customer or invoice…"/>
        </div>
        {visible.length ? <div className="table-scroll"><table className="credit-table"><thead><tr><th>Invoice / customer</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th><span className="credit-sr-only">Open invoice</span></th></tr></thead><tbody>{visible.map(invoice => <tr key={invoice.id}>
          <td><button className="credit-invoice-link" onClick={() => setSelectedId(invoice.id)}><strong>{invoice.invoice_number}</strong><span>{invoice.customer.name}</span></button></td>
          <td className={invoiceStatus(invoice) === 'Overdue' ? 'credit-overdue' : ''}>{formatDate(invoice.due_on)}</td>
          <td>{creditMoney(invoice.total_cents)}</td><td>{creditMoney(paidCents(invoice))}</td><td><strong>{creditMoney(balanceCents(invoice))}</strong></td><td><Status invoice={invoice}/></td>
          <td><IconButton label={`Open ${invoice.invoice_number}`} onClick={() => setSelectedId(invoice.id)}><ChevronRight size={18}/></IconButton></td>
        </tr>)}</tbody></table></div> : <Empty title={!invoices.length ? 'Your first credit invoice starts here' : 'No matching invoices'} description={!data.clients.length ? 'Add a customer before creating an invoice.' : 'Create an invoice when a customer buys now and pays later.'} action={!data.clients.length ? <Button onClick={() => open({type: 'client'})}><Plus size={16}/>Add customer</Button> : <Button onClick={() => {if (invoices.length) {setFilter('all'); setQuery('');} else setCreating(true);}}>{invoices.length ? 'Clear filters' : 'Create invoice'}</Button>}/>}
        {filtered.length > 20 && <div className="credit-pagination"><span>{actualPage * 20 + 1}–{Math.min(actualPage * 20 + 20, filtered.length)} of {filtered.length} invoices</span><IconButton label="Previous page" disabled={!actualPage} onClick={() => setPage(actualPage - 1)}><ChevronLeft size={18}/></IconButton><IconButton label="Next page" disabled={(actualPage + 1) * 20 >= filtered.length} onClick={() => setPage(actualPage + 1)}><ChevronRight size={18}/></IconButton></div>}
      </section>
    </>}
    {creating && <CreateInvoice clients={data.clients} mode={mode} save={input => service.create(input)} onClose={() => setCreating(false)} onSaved={async id => {setCreating(false); setNotice('Invoice created. You can record payments as they arrive.'); await refresh(); setSelectedId(id);}}/>}
    {selected && <InvoiceDetails key={selected.id} invoice={selected} mode={mode} service={service} refresh={refresh} onClose={() => setSelectedId(null)}/>}
  </div>;
}

type DraftLine = {id: string; description: string; quantity: string; price: string};
const blankLine = (): DraftLine => ({id: crypto.randomUUID(), description: '', quantity: '1', price: ''});
function CreateInvoice({clients, mode, save, onSaved, onClose}: {clients: Client[]; mode: Props['mode']; save: (input: CreateCreditInvoice) => Promise<string>; onSaved: (id: string) => Promise<void>; onClose: () => void}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [clientId, setClientId] = useState('');
  const [issuer, setIssuer] = useState('Damany');
  const [issued, setIssued] = useState(today());
  const [due, setDue] = useState(creditDueDate(today()));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const patchLine = (id: string, change: Partial<DraftLine>) => setLines(current => current.map(line => line.id === id ? {...line, ...change} : line));
  const parseLines = (): CreditLine[] => lines.map(line => ({description: line.description.trim(), quantity: Number(line.quantity), unit_price_cents: moneyToCents(line.price)}));
  let total = 0; try {total = invoiceTotal(parseLines());} catch { /* Show zero until the draft is valid. */ }
  return <Modal title="New credit invoice" subtitle="Choose a customer, add the goods or services, and set a payment deadline." wide onClose={() => {if (!pending) onClose();}}>
    <form onSubmit={async event => {
      event.preventDefault(); if (pending) return; setError('');
      try {
        const input: CreateCreditInvoice = {request_id: requestId, client_id: clientId, issuer_name: issuer.trim(), issued_on: issued, due_on: due, notes, items: parseLines()};
        validateCreditInvoice(input); setPending(true); const id = await save(input); await onSaved(id);
      } catch (failure) {setError(creditError(failure));} finally {setPending(false);}
    }}>
      <fieldset disabled={pending} className="credit-fieldset">
        <div className="credit-form-grid">
          <Field label="Customer"><Select required value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Select customer</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}{client.phone ? ` · ${client.phone}` : ''}</option>)}</Select></Field>
          <Field label="Your business name"><Input required maxLength={120} value={issuer} onChange={event => setIssuer(event.target.value)}/></Field>
          <Field label="Invoice date"><Input required type="date" max={today()} value={issued} onChange={event => setIssued(event.target.value)}/></Field>
          <Field label="Payment due"><Input required type="date" min={issued} value={due} onChange={event => setDue(event.target.value)}/></Field>
        </div>
        <div className="credit-items-heading"><h3>Invoice items</h3><span>Prices in KES</span></div>
        <div className="credit-draft-lines">{lines.map((line, index) => <div className="credit-draft-line" key={line.id}>
          <Field label={`Item ${index + 1}`}><Input required maxLength={300} placeholder="Description of goods or services" value={line.description} onChange={event => patchLine(line.id, {description: event.target.value})}/></Field>
          <Field label="Quantity"><Input aria-label={`Quantity for item ${index + 1}`} required type="number" min={1} max={1000000} step={1} value={line.quantity} onChange={event => patchLine(line.id, {quantity: event.target.value})}/></Field>
          <Field label="Unit price (KES)"><Input aria-label={`Unit price for item ${index + 1}`} required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="0.00" value={line.price} onChange={event => patchLine(line.id, {price: event.target.value})}/></Field>
          <IconButton type="button" disabled={lines.length === 1} label={`Remove item ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.id !== line.id))}><Trash2 size={17}/></IconButton>
        </div>)}</div>
        <div className="credit-line-actions"><Button type="button" variant="secondary" disabled={lines.length >= 100} onClick={() => setLines(current => [...current, blankLine()])}><Plus size={15}/>Add item</Button><div><span>Invoice total</span><strong>{creditMoney(total)}</strong></div></div>
        <Field label="Notes / payment instructions" hint="Add payment details or any agreed terms to show on the invoice."><textarea className="input credit-notes-input" rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)}/></Field>
        <p className="credit-help">Creating an invoice records the amount owed. Stock movements are managed separately in Inventory.</p>
        <FormError message={error}/>
        <div className="credit-form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">{pending ? 'Creating…' : mode === 'demo' ? 'Create demo invoice' : 'Create invoice'}</Button></div>
      </fieldset>
    </form>
  </Modal>;
}

type Service = ReturnType<typeof creditApi>;
function InvoiceDetails({invoice, mode, service, refresh, onClose}: {invoice: CreditInvoice; mode: Props['mode']; service: Service; refresh: () => Promise<void>; onClose: () => void}) {
  const [action, setAction] = useState<{type: 'payment' | 'void' | 'reverse'; paymentId?: string} | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (pending) return;
    setPending(true); setError('');
    try {await work(); await refresh(); setAction(null); setNotice(message);} catch (failure) {setError(creditError(failure));} finally {setPending(false);}
  };
  return <Modal title={invoice.invoice_number} subtitle={invoice.customer.name} wide onClose={() => {if (!pending) onClose();}}>
    <div className="credit-detail-actions"><Status invoice={invoice}/><Button variant="secondary" onClick={() => window.print()}><Printer size={16}/>Print / save PDF</Button>{!invoice.voided_at && balanceCents(invoice) > 0 && <Button disabled={pending} onClick={() => {setError(''); setAction({type: 'payment'});}}>Record payment</Button>}</div>
    {notice && <p className="credit-notice" role="status">{notice}</p>}
    {action?.type === 'payment' && <PaymentForm invoice={invoice} pending={pending} error={error} onCancel={() => {setAction(null); setError('');}} save={input => run(() => service.pay(input), 'Payment recorded. The balance has been updated.')}/>}
    {(action?.type === 'void' || action?.type === 'reverse') && <CorrectionForm type={action.type} pending={pending} error={error} onCancel={() => {setAction(null); setError('');}} save={reason => run(() => action.type === 'void' ? service.voidInvoice(invoice.id, reason) : service.reversePayment(action.paymentId!, reason), action.type === 'void' ? 'Invoice voided. Its history has been kept.' : 'Payment reversed. Its history has been kept.')}/>}
    <InvoiceDocument invoice={invoice} demo={mode === 'demo'}/>
    <section className="credit-payments"><h3>Payment history</h3>{invoice.payments.length ? <ul>{invoice.payments.map(payment => <li key={payment.id} className={payment.reversed_at ? 'credit-reversed' : ''}>
      <div><strong>{creditMoney(payment.amount_cents)} {payment.reversed_at && <span>· Reversed</span>}</strong><p>{formatDate(payment.paid_on)} · {payment.method}{payment.reference && ` · ${payment.reference}`}</p>{payment.reversal_reason && <p>Reason: {payment.reversal_reason}</p>}</div>
      {!payment.reversed_at && !invoice.voided_at && <Button variant="ghost" disabled={pending} onClick={() => {setError(''); setAction({type: 'reverse', paymentId: payment.id});}}><RotateCcw size={14}/>Reverse</Button>}
    </li>)}</ul> : <p className="credit-help">No payments recorded yet.</p>}</section>
    {!invoice.voided_at && paidCents(invoice) === 0 && <div className="credit-void-action"><Button variant="ghost" disabled={pending} onClick={() => {setError(''); setAction({type: 'void'});}}><Ban size={14}/>Void invoice</Button></div>}
    {createPortal(<div className="credit-print-copy"><InvoiceDocument invoice={invoice} demo={mode === 'demo'}/></div>, document.body)}
  </Modal>;
}

export function InvoiceDocument({invoice, demo = false}: {invoice: CreditInvoice; demo?: boolean}) {
  return <article className="credit-document">
    {demo && <div className="credit-demo-stamp">DEMO — SAMPLE RECORD</div>}
    <header><div><strong className="credit-business-name">{invoice.issuer_name}</strong><p>Customer credit invoice</p></div><div><h2>INVOICE</h2><strong>{invoice.invoice_number}</strong></div></header>
    <div className="credit-document-parties"><div><span className="credit-doc-label">BILL TO</span><h3>{invoice.customer.name}</h3>{[invoice.customer.location_address, invoice.customer.phone, invoice.customer.email].filter(Boolean).map((text, index) => <p key={index}>{text}</p>)}</div><dl><dt>Invoice date</dt><dd>{formatDate(invoice.issued_on)}</dd><dt>Payment due</dt><dd>{formatDate(invoice.due_on)}</dd><dt>Status</dt><dd>{invoiceStatus(invoice)}</dd><dt>Currency</dt><dd>KES</dd></dl></div>
    <div className="credit-document-items"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={index}><td>{item.description}</td><td>{item.quantity}</td><td>{creditMoney(item.unit_price_cents)}</td><td>{creditMoney(item.quantity * item.unit_price_cents)}</td></tr>)}</tbody></table></div>
    <dl className="credit-document-totals"><dt>Invoice total</dt><dd>{creditMoney(invoice.total_cents)}</dd><dt>Payments received</dt><dd>{creditMoney(paidCents(invoice))}</dd><dt className="credit-balance">Balance due</dt><dd className="credit-balance">{creditMoney(balanceCents(invoice))}</dd></dl>
    {invoice.voided_at && <p className="credit-void-stamp">VOIDED · {invoice.void_reason}</p>}
    {invoice.notes && <section className="credit-document-notes"><h3>Notes / payment instructions</h3><p>{invoice.notes}</p></section>}
    <footer>Please include invoice number {invoice.invoice_number} with your payment.</footer>
  </article>;
}

function PaymentForm({invoice, pending, error, save, onCancel}: {invoice: CreditInvoice; pending: boolean; error: string; save: (input: RecordCreditPayment) => Promise<void>; onCancel: () => void}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState((balanceCents(invoice) / 100).toFixed(2));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('M-Pesa');
  const [reference, setReference] = useState('');
  const [localError, setLocalError] = useState('');
  return <form className="credit-action-form" onSubmit={async event => {event.preventDefault(); if (pending) return; setLocalError(''); try {const input = {request_id: requestId, invoice_id: invoice.id, amount_cents: moneyToCents(amount), paid_on: date, method, reference}; validateCreditPayment(invoice, input); await save(input);} catch (failure) {setLocalError(creditError(failure));}}}>
    <h3>Record a payment</h3><p className="credit-help">Enter money already received from the customer. This records the payment; it does not charge them.</p>
    <fieldset disabled={pending} className="credit-fieldset"><div className="credit-form-grid">
      <Field label="Amount received (KES)"><Input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={amount} onChange={event => setAmount(event.target.value)}/></Field>
      <Field label="Payment date"><Input required type="date" min={invoice.issued_on} max={today()} value={date} onChange={event => setDate(event.target.value)}/></Field>
      <Field label="Payment method"><Select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}>{paymentMethods.map(value => <option key={value}>{value}</option>)}</Select></Field>
      <Field label="Reference (optional)"><Input maxLength={120} placeholder="M-Pesa code or bank reference" value={reference} onChange={event => setReference(event.target.value)}/></Field>
    </div><FormError message={localError || error}/><div className="credit-form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">{pending ? 'Saving…' : 'Save payment'}</Button></div></fieldset>
  </form>;
}

function CorrectionForm({type, pending, error, save, onCancel}: {type: 'void' | 'reverse'; pending: boolean; error: string; save: (reason: string) => Promise<void>; onCancel: () => void}) {
  const [reason, setReason] = useState('');
  return <form className="credit-action-form" onSubmit={event => {event.preventDefault(); if (!pending) void save(reason);}}><h3>{type === 'void' ? 'Void this invoice' : 'Reverse this payment entry'}</h3><p className="credit-help">{type === 'void' ? 'This removes the amount from outstanding balances and keeps the invoice history.' : 'This corrects the recorded balance and keeps the original entry. It does not send a refund.'}</p><fieldset disabled={pending} className="credit-fieldset"><Field label="Reason"><Input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the correction"/></Field><FormError message={error}/><div className="credit-form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" variant="danger">{pending ? 'Saving…' : type === 'void' ? 'Void invoice' : 'Reverse entry'}</Button></div></fieldset></form>;
}
