import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useTexture } from '@react-three/drei';
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import type { Region,OverlayMode } from '../analysis/types';
const W=8.7,H=5.8;
function CameraRequests({zoom,reset}:{zoom:number;reset:number}){
 const {camera,controls}=useThree();
 useEffect(()=>{if(!zoom)return;camera.position.multiplyScalar(zoom>0?.85:1.15);camera.updateProjectionMatrix()},[zoom,camera]);
 useEffect(()=>{camera.position.set(9.2,7.7,10.8);camera.lookAt(0,-.2,0);camera.updateProjectionMatrix();(controls as unknown as {target?:THREE.Vector3;update?:()=>void})?.target?.set(0,-.2,0);(controls as unknown as {update?:()=>void})?.update?.()},[reset,camera,controls]);
 return null;
}
function Imagery({url,position,title,tint}:{url:string;position:number;title:string;tint:string}){
 const tex=useTexture(url);
 useEffect(()=>{tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8},[tex]);
 return <group position={[0,position,0]}>
  <mesh position={[0,-.038,0]}><boxGeometry args={[W+.15,.085,H+.15]}/><meshStandardMaterial color="#092238" metalness={.68} roughness={.32}/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.016,0]}><planeGeometry args={[W,H]}/><meshBasicMaterial map={tex} side={THREE.DoubleSide} toneMapped={false}/></mesh>
  <mesh position={[0,.03,0]}><boxGeometry args={[W+.12,.008,H+.12]}/><meshBasicMaterial color={tint} transparent opacity={.15} wireframe/></mesh>
  <mesh position={[0,.006,H/2+.16]}><boxGeometry args={[W+.32,.027,.012]}/><meshBasicMaterial color={tint}/></mesh>
  <mesh position={[0,.006,-H/2-.16]}><boxGeometry args={[W+.32,.027,.012]}/><meshBasicMaterial color={tint}/></mesh>
  <mesh position={[W/2+.16,.006,0]}><boxGeometry args={[.014,.027,H+.32]}/><meshBasicMaterial color={tint}/></mesh>
  <mesh position={[-W/2-.16,.006,0]}><boxGeometry args={[.014,.027,H+.32]}/><meshBasicMaterial color={tint}/></mesh>
  <Html position={[-W/2, .12, H/2+.46]} center={false} distanceFactor={8} style={{pointerEvents:'none'}}><div className="plane-stamp"><span className="stamp-dot" style={{background:tint}}/>{title}</div></Html>
  {[[-W/2,-H/2],[W/2,-H/2],[-W/2,H/2],[W/2,H/2]].map(([x,z],i)=><mesh key={i} position={[x,.09,z]}><sphereGeometry args={[.035,8,8]}/><meshBasicMaterial color={tint}/></mesh>)}
 </group>
}
function Overlay({url,position,opacity}:{url:string;position:number;opacity:number}){
 const texture=useTexture(url);
 return <mesh rotation={[-Math.PI/2,0,0]} position={[0,position+.058,0]}><planeGeometry args={[W,H]}/><meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} toneMapped={false}/></mesh>;
}
function Regions({regions,selected,onSelect}:{regions:Region[];selected:number|null;onSelect:(id:number)=>void}){
 return <>{regions.slice(0,8).map(r=>{
  const x=(r.x-.5)*W,z=(r.y-.5)*H;
  return <group key={r.id} position={[x,.81,z]}>
   <mesh rotation={[-Math.PI/2,0,0]} onClick={e=>{e.stopPropagation();onSelect(r.id)}}>
    <ringGeometry args={[.095,.145,32]}/><meshBasicMaterial color={r.color} transparent opacity={selected===r.id?1:.75} side={THREE.DoubleSide}/>
   </mesh>
   <mesh position={[0,.06,0]} onClick={e=>{e.stopPropagation();onSelect(r.id)}}><sphereGeometry args={[.057,12,12]}/><meshBasicMaterial color={r.color}/></mesh>
   <Html center position={[0,.34,0]} distanceFactor={8} zIndexRange={[20,0]}><button aria-label={`Inspect region ${r.rank}`} className={'scene-pin '+(r.id===selected?'selected':'')} onClick={e=>{e.stopPropagation();onSelect(r.id)}} style={{'--pin':r.color} as CSSProperties}>{String(r.rank).padStart(2,'0')}</button></Html>
  </group>})}</>;
}
export default function ComparisonScene({before,after,overlayUrl,overlay,regions,selected,onSelect,zoom,reset}: {before:string;after:string;overlayUrl:string;overlay:OverlayMode;regions:Region[];selected:number|null;onSelect:(id:number)=>void;zoom:number;reset:number}){
 const overlayEnabled=overlay!=='none'&&Boolean(overlayUrl);
 return <Canvas dpr={[1,1.65]} gl={{antialias:true,alpha:true,powerPreference:'high-performance'}} camera={{position:[9.2,7.7,10.8],fov:42,near:.1,far:110}}>
  <color attach="background" args={['#03101e']}/>
  <ambientLight intensity={1.3}/><directionalLight position={[6,13,8]} color="#d9f4ff" intensity={2.1}/><pointLight position={[0,3,3]} color="#2ec9ff" intensity={35} distance={18}/>
  <gridHelper args={[44,40,'#184665','#0d2941']} position={[0,-2.15,0]}/>
  <Imagery url={before} position={-1.1} title="T-01   BASELINE / BEFORE" tint="#1c77ac"/>
  <Imagery url={after} position={.72} title="T-02   CURRENT / AFTER" tint="#4dedf5"/>
  {overlayEnabled&&<Overlay url={overlayUrl} position={.72} opacity={overlay==='both'?.83:1}/ >}
  <Regions regions={regions} selected={selected} onSelect={onSelect}/>
  <OrbitControls makeDefault enableDamping dampingFactor={.075} enablePan minDistance={5.6} maxDistance={26} minPolarAngle={.16} maxPolarAngle={Math.PI/2-.06} rotateSpeed={.56} zoomSpeed={.75} panSpeed={.66}/>
  <CameraRequests zoom={zoom} reset={reset}/>
 </Canvas>;
}
