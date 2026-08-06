export function createLatestRequestGate(){
  let latest=0;
  return {
    begin(){latest+=1;return latest},
    invalidate(){latest+=1},
    isCurrent(requestId:number){return requestId===latest},
  };
}
