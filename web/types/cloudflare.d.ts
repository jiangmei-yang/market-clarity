declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & {DB?: D1Database};
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T={meta:{changes?:number}}>() : Promise<T>;
  all<T=unknown>(): Promise<{results?:T[]}>;
  first<T=unknown>(): Promise<T|null>;
}

interface D1Database {
  prepare(query:string): D1PreparedStatement;
  batch<T=unknown>(statements:D1PreparedStatement[]): Promise<T[]>;
  exec(query:string): Promise<unknown>;
  dump(): Promise<ArrayBuffer>;
}

interface Fetcher {
  fetch(input:RequestInfo|URL,init?:RequestInit): Promise<Response>;
}
