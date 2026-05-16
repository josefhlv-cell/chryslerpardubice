// Simplified theme hook for OBD module
// Uses the app's existing theme system

import { useState, useCallback } from 'react';

export type ColorMode = 'dark' | 'light';
export type DashboardTheme = 'default' | 'metal' | 'carbon' | 'neon';
export type LayoutMode = 'normal' | 'pro';

export function useTheme() {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('pro');
  const [dashboardTheme, setDashboardTheme] = useState<DashboardTheme>('default');
  
  const isDark = document.documentElement.classList.contains('dark');
  const colorMode: ColorMode = isDark ? 'dark' : 'light';

  return {
    colorMode,
    dashboardTheme,
    layoutMode,
    setColorMode: () => {},
    setDashboardTheme,
    setLayoutMode,
    toggleColorMode: () => {},
  };
}
