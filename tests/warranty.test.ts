import {describe,it,expect} from 'vitest';
import {addMonths,warranty,daysBetween,parseDay} from '../src/lib/warranty';
import {toCSV,metrics} from '../src/lib/selectors';
import {seedData} from '../src/services/seed';
describe('calendar warranty rules',()=>{
 it('clamps month end exactly like PostgreSQL',()=>{expect(addMonths('2025-01-31',1)).toBe('2025-02-28');expect(addMonths('2024-01-31',1)).toBe('2024-02-29');expect(addMonths('2024-02-29',12)).toBe('2025-02-28');expect(addMonths('2025-08-31',6)).toBe('2026-02-28');});
 it('uses commissioning date and handles expiry day',()=>{expect(warranty('2024-10-12',24,'2026-10-12')).toMatchObject({expiry:'2026-10-12',days:0,tone:'red',label:'Expires today'});expect(warranty('2024-10-11',24,'2026-10-12').label).toBe('Expired');});
 it('uses less than 30 days for red and exact six calendar months for green',()=>{expect(warranty('2025-11-10',12,'2026-10-12').tone).toBe('red');expect(warranty('2025-11-11',12,'2026-10-12').tone).toBe('amber');expect(warranty('2026-04-12',12,'2026-10-12').tone).toBe('amber');expect(warranty('2026-04-13',12,'2026-10-12').tone).toBe('green');});
 it('rejects invalid dates and warranties',()=>{expect(()=>parseDay('2025-02-30')).toThrow();expect(()=>addMonths('2026-01-01',-1)).toThrow();expect(()=>addMonths('2026-01-01',2.4)).toThrow();expect(daysBetween('2026-03-28','2026-03-30')).toBe(2);});
});
describe('dashboard and exports',()=>{
 it('calculates alerts from underlying records and excludes expired from upcoming',()=>{const data=seedData();const m=metrics(data,'2026-10-12');expect(m.low.length).toBe(3);expect(m.stock).toBe(96);expect(m.in30.every(x=>x.warranty.days>=0&&x.warranty.days<=30)).toBe(true);expect(m.in60.length).toBeGreaterThanOrEqual(m.in30.length);});
 it('neutralizes spreadsheet formulas and quotes',()=>{expect(toCSV([{name:'=HYPERLINK("bad")',phone:'+254700'}])).toContain("'=");expect(toCSV([{name:'a,"b"'}])).toContain('"a,""b"""');});
});
