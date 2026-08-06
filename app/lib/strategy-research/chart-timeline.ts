type DatedPoint={date:string};

export function buildEquityTimeline(curves:DatedPoint[][]){
  return [...new Set(curves.flatMap(curve=>curve.map(point=>point.date)))].sort();
}

export function positionOnTimeline(date:string,timeline:string[],left=48,width=524){
  const index=timeline.indexOf(date);
  if(index<0)return left;
  return left+index/Math.max(1,timeline.length-1)*width;
}
