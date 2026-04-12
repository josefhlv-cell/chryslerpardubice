import { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, RoundedBox, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { sensorDecoder } from '@/lib/sensor-decoder';
import { useVehicle } from '@/hooks/use-vehicle';
import pacificaXray from '@/assets/pacifica-xray.png';
import tcXray from '@/assets/tc-xray.png';
import engineXray from '@/assets/engine-xray.png';
import transmissionXray from '@/assets/transmission-xray.png';
import brakesXray from '@/assets/brakes-xray.png';
import electricalXray from '@/assets/electrical-xray.png';
import hvacXray from '@/assets/hvac-xray.png';
import exhaustXray from '@/assets/exhaust-xray.png';
import steeringXray from '@/assets/steering-xray.png';

const subsystemImages: Record<string, string> = {
  engine: engineXray,
  transmission: transmissionXray,
  brakes: brakesXray,
  electrical: electricalXray,
  hvac: hvacXray,
  exhaust: exhaustXray,
  steering: steeringXray,
  body: pacificaXray,
};

// ─── Types ───
type SubsystemID = 'engine' | 'transmission' | 'hvac' | 'brakes' | 'electrical' | 'body' | 'exhaust' | 'steering';

type SubsystemData = {
  id: SubsystemID;
  label: string;
  temp: number;
  load: number;
  active: boolean;
  status: 'normal' | 'warm' | 'hot' | 'critical';
};

// ─── Color Helpers ───
function tempToColor(temp: number, max: number): THREE.Color {
  const t = Math.min(temp / max, 1);
  if (t < 0.3) return new THREE.Color(0.1, 0.4, 0.9); // cool blue
  if (t < 0.6) return new THREE.Color(0.1, 0.8, 0.3); // green
  if (t < 0.8) return new THREE.Color(0.9, 0.7, 0.1); // amber
  return new THREE.Color(0.9, 0.15, 0.1); // red
}

function loadToEmissive(load: number): number {
  return Math.min(load / 100, 1) * 0.4;
}

// ─── Subsystem 3D Block ───
function SubsystemBlock({ data, position, size, onClick, selected }: {
  data: SubsystemData;
  position: [number, number, number];
  size: [number, number, number];
  onClick: () => void;
  selected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => tempToColor(data.temp, 120), [data.temp]);
  const emissiveIntensity = loadToEmissive(data.load);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Pulse effect when active
    if (data.active) {
      const scale = 1 + Math.sin(Date.now() * 0.003) * 0.02;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 5);
    }
  });

  return (
    <group position={position}>
      <RoundedBox
        ref={meshRef}
        args={size}
        radius={0.05}
        smoothness={4}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.4}
          transparent
          opacity={selected ? 1 : 0.85}
        />
      </RoundedBox>
      {/* Selection wireframe */}
      {selected && (
        <RoundedBox args={[size[0] + 0.06, size[1] + 0.06, size[2] + 0.06]} radius={0.06} smoothness={4}>
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} />
        </RoundedBox>
      )}
      {/* Label */}
      <Text
        position={[0, size[1] / 2 + 0.15, 0]}
        fontSize={0.1}
        color="white"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {data.label}
      </Text>
      {/* Status indicator dot */}
      <mesh position={[size[0] / 2 - 0.05, size[1] / 2 - 0.05, size[2] / 2 + 0.01]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color={data.active ? '#22c55e' : '#666666'} />
      </mesh>
    </group>
  );
}

// ─── Car Body Shell ───
function CarBody() {
  const bodyRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (bodyRef.current) {
      bodyRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={bodyRef}>
      {/* Lower body */}
      <RoundedBox args={[3.6, 0.5, 1.5]} radius={0.08} smoothness={4} position={[0, 0, 0]}>
        <meshStandardMaterial color="#2a2a4e" metalness={0.7} roughness={0.3} transparent opacity={0.55} />
      </RoundedBox>
      {/* Upper cabin */}
      <RoundedBox args={[2.8, 0.6, 1.4]} radius={0.12} smoothness={4} position={[0.1, 0.5, 0]}>
        <meshStandardMaterial color="#1e2a5e" metalness={0.6} roughness={0.2} transparent opacity={0.35} />
      </RoundedBox>
      {/* Hood */}
      <RoundedBox args={[0.9, 0.15, 1.3]} radius={0.05} smoothness={4} position={[-1.5, 0.25, 0]}>
        <meshStandardMaterial color="#1a3a70" metalness={0.5} roughness={0.3} transparent opacity={0.45} />
      </RoundedBox>
      {/* Windshield */}
      <RoundedBox args={[0.1, 0.5, 1.3]} radius={0.02} smoothness={4} position={[-0.85, 0.55, 0]} rotation={[0, 0, 0.3]}>
        <meshStandardMaterial color="#4488cc" metalness={0.9} roughness={0.1} transparent opacity={0.2} />
      </RoundedBox>
      {/* Rear window */}
      <RoundedBox args={[0.1, 0.45, 1.2]} radius={0.02} smoothness={4} position={[1.3, 0.5, 0]} rotation={[0, 0, -0.2]}>
        <meshStandardMaterial color="#4488cc" metalness={0.9} roughness={0.1} transparent opacity={0.2} />
      </RoundedBox>
      {/* Headlights */}
      <mesh position={[-1.8, 0.1, 0.5]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#88ccff" />
      </mesh>
      <mesh position={[-1.8, 0.1, -0.5]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#88ccff" />
      </mesh>
      {/* Taillights */}
      <mesh position={[1.75, 0.1, 0.55]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#ff3333" />
      </mesh>
      <mesh position={[1.75, 0.1, -0.55]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#ff3333" />
      </mesh>

      {/* Wheels */}
      {[[-1.2, -0.35, 0.8], [-1.2, -0.35, -0.8], [1.1, -0.35, 0.8], [1.1, -0.35, -0.8]].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.08, 12, 20]} />
            <meshStandardMaterial color="#444" metalness={0.8} roughness={0.4} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 12]} />
            <meshStandardMaterial color="#666" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Ground plane grid */}
      <gridHelper args={[8, 20, '#222244', '#111133']} position={[0, -0.6, 0]} />
    </group>
  );
}

// ─── Subsystem Layout in Car ───
function SubsystemsOverlay({ subsystems, selected, onSelect }: {
  subsystems: SubsystemData[];
  selected: SubsystemID | null;
  onSelect: (id: SubsystemID) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  const layout: Record<SubsystemID, { pos: [number, number, number]; size: [number, number, number] }> = {
    engine:       { pos: [-1.2, 0.15, 0],    size: [0.7, 0.4, 0.8] },
    transmission: { pos: [-0.4, -0.05, 0],   size: [0.5, 0.3, 0.5] },
    exhaust:      { pos: [0.3, -0.15, 0.5],  size: [1.2, 0.15, 0.2] },
    hvac:         { pos: [-0.5, 0.55, 0],     size: [0.5, 0.25, 0.6] },
    brakes:       { pos: [0, -0.3, 0],        size: [2.8, 0.1, 1.2] },
    electrical:   { pos: [0.8, 0.3, 0],       size: [0.4, 0.3, 0.4] },
    body:         { pos: [0.5, 0.55, 0],      size: [0.6, 0.25, 0.8] },
    steering:     { pos: [-0.9, 0.45, 0.3],   size: [0.25, 0.2, 0.25] },
  };

  return (
    <group ref={groupRef}>
      {subsystems.map(sub => {
        const l = layout[sub.id];
        return (
          <SubsystemBlock
            key={sub.id}
            data={sub}
            position={l.pos}
            size={l.size}
            onClick={() => onSelect(sub.id)}
            selected={selected === sub.id}
          />
        );
      })}
    </group>
  );
}

// ─── Scene ───
function Scene({ subsystems, selected, onSelect }: {
  subsystems: SubsystemData[];
  selected: SubsystemID | null;
  onSelect: (id: SubsystemID) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#4488ff" />
      <pointLight position={[-5, 3, -5]} intensity={0.7} color="#ff4488" />
      <spotLight position={[0, 8, 0]} intensity={0.8} angle={0.5} penumbra={0.8} color="#ffffff" />

      <CarBody />
      <SubsystemsOverlay subsystems={subsystems} selected={selected} onSelect={onSelect} />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={10}
        autoRotate={false}
        target={[0, 0.2, 0]}
      />
    </>
  );
}

// ─── Main View ───
export function Vehicle3DView({ elmReady }: { elmReady: boolean }) {
  const [selected, setSelected] = useState<SubsystemID | null>(null);
  const [subsystems, setSubsystems] = useState<SubsystemData[]>(getDefaultSubsystems());
  const { vehicle, isPacifica } = useVehicle();
  const vehicleImg = isPacifica ? pacificaXray : tcXray;

  // Poll sensor decoder for live data
  useEffect(() => {
    const interval = setInterval(() => {
      const sensors = sensorDecoder.getSensors();
      setSubsystems(prev => prev.map(sub => {
        const updated = { ...sub };

        switch (sub.id) {
          case 'engine': {
            const coolant = sensors.find(s => s.did === 0xF420);
            const rpm = sensors.find(s => s.did === 0xF426);
            if (coolant && typeof coolant.value === 'number') updated.temp = coolant.value;
            if (rpm && typeof rpm.value === 'number') updated.load = Math.min((rpm.value / 6000) * 100, 100);
            updated.active = (rpm && typeof rpm.value === 'number' && rpm.value > 0) || updated.active;
            break;
          }
          case 'transmission': {
            const tft = sensors.find(s => s.did === 0xF42B);
            if (tft && typeof tft.value === 'number') updated.temp = tft.value;
            updated.active = updated.temp > 30;
            break;
          }
          case 'hvac': {
            const ac = sensors.find(s => s.did === 0xF42C);
            if (ac && typeof ac.value === 'number') updated.load = Math.min((ac.value / 2000) * 100, 100);
            updated.active = updated.load > 5;
            break;
          }
          case 'electrical': {
            const batt = sensors.find(s => s.did === 0xF425);
            if (batt && typeof batt.value === 'number') updated.load = Math.min((batt.value / 14.5) * 100, 100);
            updated.active = true;
            break;
          }
          case 'brakes': {
            const speed = sensors.find(s => s.did === 0xF427);
            if (speed && typeof speed.value === 'number') updated.load = Math.min((speed.value / 200) * 100, 100);
            updated.active = updated.load > 0;
            break;
          }
          case 'steering': {
            const sas = sensors.find(s => s.did === 0xF42D);
            if (sas && typeof sas.value === 'number') updated.load = Math.min(Math.abs(sas.value) / 7.8, 100);
            updated.active = updated.load > 2;
            break;
          }
          default: break;
        }

        // Compute status from temp
        updated.status = updated.temp < 60 ? 'normal' : updated.temp < 90 ? 'warm' : updated.temp < 110 ? 'hot' : 'critical';
        return updated;
      }));
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const selectedData = subsystems.find(s => s.id === selected);

  return (
    <div className="flex flex-col h-full">
      {/* 3D Canvas */}
      <div className="flex-1 relative min-h-[300px]" style={{ touchAction: 'none' }}>
        <Canvas
          camera={{ position: [3, 2.5, 3], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <Suspense fallback={null}>
            <Scene
              subsystems={subsystems}
              selected={selected}
              onSelect={setSelected}
            />
          </Suspense>
        </Canvas>

        {/* Vehicle X-Ray overlay */}
        <div className="absolute top-3 left-3 right-3 space-y-1">
          <div className="bg-background/40 backdrop-blur-sm rounded-lg p-2">
            <img src={vehicleImg} alt={vehicle.label} className="w-full h-24 object-contain opacity-70"
              style={{ filter: 'drop-shadow(0 0 10px hsla(185,70%,45%,0.3))' }} width={1024} height={512} loading="lazy" />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-0.5 rounded">
            {vehicle.label}
          </p>
          <p className="text-[9px] text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-0.5 rounded">
            Přiblížit/Otočit gesty
          </p>
        </div>

        {/* Subsystem legend */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          {subsystems.filter(s => s.active).map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`text-[9px] px-2 py-0.5 rounded backdrop-blur-sm transition-colors text-right ${
                selected === s.id
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-background/50 text-muted-foreground'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                s.status === 'critical' ? 'bg-destructive' : s.status === 'hot' ? 'bg-amber-500' : s.status === 'warm' ? 'bg-yellow-400' : 'bg-emerald-400'
              }`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedData && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border bg-card"
          >
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{selectedData.label}</h3>
                  <p className="text-[10px] text-muted-foreground">Detail subsystému</p>
                </div>
                <div className="flex gap-1">
                  <Badge
                    variant={selectedData.status === 'critical' ? 'destructive' : selectedData.status === 'hot' ? 'destructive' : 'secondary'}
                    className="text-[9px] h-4"
                  >
                    {selectedData.status.toUpperCase()}
                  </Badge>
                  <Badge variant={selectedData.active ? 'default' : 'outline'} className="text-[9px] h-4">
                    {selectedData.active ? 'AKTIVNÍ' : 'SPÁNEK'}
                  </Badge>
                </div>
              </div>

              {/* Subsystem X-Ray Image */}
              {subsystemImages[selectedData.id] && (
                <div className="rounded-lg overflow-hidden bg-background/30 p-1">
                  <img
                    src={subsystemImages[selectedData.id]}
                    alt={`${selectedData.label} X-Ray`}
                    className="w-full h-28 object-contain"
                    style={{ filter: 'drop-shadow(0 0 12px hsla(185,70%,45%,0.35))' }}
                    width={768}
                    height={768}
                    loading="lazy"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[9px] text-muted-foreground">Teplota</p>
                  <p className={`text-lg font-mono font-bold ${
                    selectedData.temp > 100 ? 'text-destructive' : selectedData.temp > 80 ? 'text-amber-400' : 'text-foreground'
                  }`}>
                    {selectedData.temp.toFixed(1)}°C
                  </p>
                  <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selectedData.temp > 100 ? 'bg-destructive' : selectedData.temp > 80 ? 'bg-amber-400' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min((selectedData.temp / 120) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[9px] text-muted-foreground">Zatížení</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {selectedData.load.toFixed(0)}%
                  </p>
                  <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(selectedData.load, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelected(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Klikněte mimo pro zrušení výběru
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Default Subsystem Data ───
function getDefaultSubsystems(): SubsystemData[] {
  return [
    { id: 'engine', label: 'Motor', temp: 84, load: 25, active: true, status: 'warm' },
    { id: 'transmission', label: 'Převodovka', temp: 65, load: 15, active: true, status: 'normal' },
    { id: 'hvac', label: 'Klimatizace', temp: 22, load: 40, active: true, status: 'normal' },
    { id: 'brakes', label: 'Brzdy', temp: 45, load: 0, active: false, status: 'normal' },
    { id: 'electrical', label: 'Elektrika', temp: 35, load: 86, active: true, status: 'normal' },
    { id: 'body', label: 'Karoserie', temp: 28, load: 10, active: false, status: 'normal' },
    { id: 'exhaust', label: 'Výfuk', temp: 95, load: 30, active: true, status: 'hot' },
    { id: 'steering', label: 'Řízení', temp: 40, load: 5, active: false, status: 'normal' },
  ];
}
