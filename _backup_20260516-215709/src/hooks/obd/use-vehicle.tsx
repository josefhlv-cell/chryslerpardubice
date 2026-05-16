import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type VehicleModel = 'tc' | 'pacifica';

export interface VehicleConfig {
  model: VehicleModel;
  year: number;
  label: string;
}

const VEHICLES: VehicleConfig[] = [
  ...Array.from({ length: 7 }, (_, i) => ({
    model: 'tc' as VehicleModel,
    year: 2010 + i,
    label: `Town & Country ${2010 + i}`,
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    model: 'pacifica' as VehicleModel,
    year: 2017 + i,
    label: `Pacifica ${2017 + i}`,
  })),
];

interface VehicleContextType {
  vehicle: VehicleConfig;
  vehicles: VehicleConfig[];
  setVehicle: (v: VehicleConfig) => void;
  isPacifica: boolean;
  isTownCountry: boolean;
}

const VehicleContext = createContext<VehicleContextType | null>(null);

export function VehicleProvider({ children }: { children: ReactNode }) {
  const [vehicle, setVehicle] = useState<VehicleConfig>(VEHICLES[0]);

  return (
    <VehicleContext.Provider
      value={{
        vehicle,
        vehicles: VEHICLES,
        setVehicle,
        isPacifica: vehicle.model === 'pacifica',
        isTownCountry: vehicle.model === 'tc',
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used within VehicleProvider');
  return ctx;
}
