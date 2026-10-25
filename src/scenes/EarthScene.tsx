import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html, useTexture } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function CameraRequests({zoom, reset}: {zoom:number;reset:number}) {
 const {camera, controls}=useThree();
 useEffect(()=>{ if(!zoom) return; const length=camera.position.length(); const bounded=THREE.MathUtils.clamp(length*(zoom>0 ? .85:1.16),3.2,10.5); if(length>0)camera.position.multiplyScalar(bounded/length); camera.updateProjectionMatrix(); },[zoom,camera]);
 useEffect(()=>{ camera.position.set(0,1,6.7); camera.lookAt(0,0,0); camera.updateProjectionMatrix(); (controls as unknown as {target?:THREE.Vector3;update?:()=>void})?.target?.set(0,0,0); (controls as unknown as {update?:()=>void})?.update?.();},[reset,camera,controls]);
 return null;
}
function Satellite({phase,motion}:{phase:number;motion:boolean}){
 const g=useRef<THREE.Group>(null);
 useFrame(({clock})=>{if(motion&&g.current){const a=clock.elapsedTime*.12+phase;g.current.position.set(Math.sin(a)*3.35, .6+Math.cos(a*.7)*.32,Math.cos(a)*3.35);g.current.rotation.y=a}});
 return <group ref={g} scale={.22}>
  <mesh><boxGeometry args={[.8,.42,.55]}/><meshStandardMaterial color="#bac9da" metalness={.78} roughness={.25}/></mesh>
  {[-1,1].map((s)=><mesh key={s} position={[s*1.85,0,0]}><boxGeometry args={[2.65,.06,.84]}/><meshStandardMaterial color="#16618c" metalness={.28} roughness={.4} emissive="#063e6d" emissiveIntensity={.5}/></mesh>)}
  <pointLight position={[0,0,.4]} color="#45e7ff" intensity={.65} distance={3}/>
 </group>
}
function Globe({motion}:{motion:boolean}){
 const map=useTexture('/assets/earth-ocean.jpg');
 const globe=useRef<THREE.Mesh>(null);
 useEffect(()=>{map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8},[map]);
 useFrame((_,dt)=>{if(motion&&globe.current)globe.current.rotation.y+=Math.min(dt,.04)*.018});
 const rings=[0,1,2];
 return <>
  <mesh ref={globe} rotation={[0,-.55,0]}><sphereGeometry args={[2.25,96,64]}/><meshStandardMaterial map={map} metalness={0.04} roughness={.86} emissive="#063252" emissiveIntensity={.16}/></mesh>
  <mesh scale={1.036}><sphereGeometry args={[2.25,64,48]}/><meshBasicMaterial color="#12bded" transparent opacity={.074} side={THREE.BackSide} depthWrite={false}/></mesh>
  <mesh scale={1.095}><sphereGeometry args={[2.25,64,48]}/><meshBasicMaterial color="#2c8ccc" transparent opacity={.035} side={THREE.BackSide} depthWrite={false}/></mesh>
  {rings.map((x)=><mesh key={x} rotation={[Math.PI/2.6+x*.4,.35+x*.3,x*.3]}>
   <torusGeometry args={[2.74+x*.23,.0038,5,160]}/><meshBasicMaterial color={x===0?'#43d8fa':'#275c89'} transparent opacity={x===0?.6:.37}/>
  </mesh>)}
  <group position={[0,0,0]}><mesh rotation={[Math.PI/2.1,-.3,0]}><torusGeometry args={[2.34,.005,5,180]}/><meshBasicMaterial color="#5bcfee" transparent opacity={.28}/></mesh></group>
  <Satellite phase={0} motion={motion}/>
  <Satellite phase={2.8} motion={motion}/>
 </>;
}
export default function EarthScene({zoom,reset,reducedMotion}:{zoom:number;reset:number;reducedMotion:boolean}) {
 return <Canvas dpr={[1,1.6]} gl={{antialias:true,alpha:true,powerPreference:'high-performance'}} camera={{position:[0,1,6.7],fov:43,near:.1,far:120}}>
  <color attach="background" args={['#03101e']}/>
  <fog attach="fog" args={['#03101e',13,38]}/>
  <ambientLight intensity={1.05}/><directionalLight position={[6,4,8]} intensity={3.8} color="#d5f6ff"/>
  <pointLight position={[-6,-3,-2]} intensity={23} distance={18} color="#059dce"/>
  <Stars radius={70} depth={35} count={1200} factor={2.6} fade speed={reducedMotion?0:.12}/>
  <Globe motion={!reducedMotion}/>
  <OrbitControls makeDefault enableDamping dampingFactor={.07} enablePan={false} enableZoom minDistance={3.2} maxDistance={10.5} minPolarAngle={.16} maxPolarAngle={Math.PI-.16} rotateSpeed={.55} autoRotate={false}/>
  <CameraRequests zoom={zoom} reset={reset}/>
  <Html position={[0,-3.13,0]} center transform={false} style={{pointerEvents:'none'}}><div className="scene-micro">EARTH OBSERVATION • 3D ORBIT</div></Html>
 </Canvas>;
}
