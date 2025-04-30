"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
// Usually, the props type can be inferred or imported directly
// import { type ThemeProviderProps } from "next-themes/dist/types"; 

// Using a simpler type definition, letting NextThemesProvider handle specifics
interface CustomThemeProviderProps {
    children: React.ReactNode;
    attribute?: any; // Use any to bypass strict type for now
    defaultTheme?: string;
    enableSystem?: boolean;
    disableTransitionOnChange?: boolean;
    // Add other props from next-themes if necessary
}

export function ThemeProvider({ children, ...props }: CustomThemeProviderProps) {
  // Pass props directly, assuming they match what NextThemesProvider expects
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
} 