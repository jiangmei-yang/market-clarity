const HONG_KONG_DATE_TIME=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Hong_Kong",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
export function formatHongKongDateTime(value:string|number|Date){const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?String(value):`${HONG_KONG_DATE_TIME.format(date)} HKT`;}

