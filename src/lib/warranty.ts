// Date-only arithmetic in UTC. Clamp month ends like PostgreSQL date + interval.
export function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected an ISO calendar date.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
  return date;
}
export function today(timeZone = 'Africa/Nairobi'): string {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}-${p.find(x=>x.type==='day')!.value}`;
}
export function addMonths(value: string, months: number): string {
  if (!Number.isInteger(months) || months < 0 || months > 1200) throw new Error('Invalid warranty period.');
  const date = parseDay(value), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day,last)); return date.toISOString().slice(0,10);
}
export function daysBetween(from: string, to: string) { return Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000); }
export function warranty(commissioned: string, months: number, asOf = today()) {
  const expiry = addMonths(commissioned,months), days = daysBetween(asOf,expiry);
  const tone = days < 30 ? 'red' : expiry <= addMonths(asOf,6) ? 'amber' : 'green';
  const label = days < 0 ? 'Expired' : days === 0 ? 'Expires today' : days < 60 ? `${days} days left` : days < 365 ? `${Math.floor(days/30.4375)} months left` : `${(days/365.25).toFixed(1)} years left`;
  const duration=daysBetween(commissioned,expiry);const progress=duration>0?Math.min(100,Math.max(0,days/duration*100)):0; return {expiry,days,tone,label,progress};
}
export function formatDate(value: string) { return parseDay(value.slice(0,10)).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}); }
export function formatMoney(value: number) { return new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(value); }
