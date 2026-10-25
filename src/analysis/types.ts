export type DetectionKey = 'flood'|'recede'|'burn'|'vegloss'|'veggain'|'build'|'dark'|'unknown';
export type Region = {
 id:number; rank:number; count:number; key:DetectionKey; type:string; group:string; color:string;
 x:number; y:number; minX:number; minY:number; maxX:number; maxY:number;
 transition:string; reason:string; score:number; maxScore:number; strength:number;
 fill:number; dLum:number; dExG:number;
};
export type AnalysisResult = {
 labels:Int32Array; heat:Uint8Array; regions:Region[];
 stats:{ affected:number; changedPct:number; mean:number; sd:number; threshold:number; adaptive:number; otsu:number;
 hist:Uint32Array; shift:{dx:number;dy:number;improvement:number}; candidates:number;
 breakdown:Record<string,{regions:number;pixels:number}>;options:Record<string,unknown>};
};
export type AnalysisOptions = {sensitivity:number;minRegion:number;smoothing:number;align:boolean;normalise:boolean;method:'adaptive'|'otsu';maxRegions:number};
export type OverlayMode='regions'|'heat'|'both'|'none';
export type AppMode='globe'|'3d'|'2d';
