"use client";

import Link from 'next/link';
import { useState } from 'react';

// Assuming @/components/ui path alias is configured
import { Button } from "@/components/ui/button"; 
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose, 
  DialogFooter 
} from "@/components/ui/dialog"; 
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col scanlines font-mono">
      {/* Navbar */}
      <nav className="py-4 px-6 flex justify-between items-center border-b border-border">
        <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-500">
          APEX DEFENDERS
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Restore Dialog */} 
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                variant="outline"
                size="icon" 
                className="w-8 h-8 rounded-full bg-primary/20 border-primary/50 hover:bg-primary/30 text-foreground cursor-pointer"
                aria-label="About"
              >
                ?
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-card-foreground font-mono sm:max-w-[525px] opacity-100 !bg-opacity-100" style={{ backgroundColor: "var(--card)" }}>
              <DialogHeader>
                <DialogTitle className="retro-text text-2xl text-primary">ABOUT APEX DEFENDERS</DialogTitle>
                <DialogDescription className="text-muted-foreground pt-1">
                  Can 100 men defeat the mighty gorilla? Strategize and simulate!
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-primary mb-1">THE CHALLENGE</h3>
                  <p className="text-sm text-foreground/80">Strategically deploy 100 men from three distinct classes against a powerful gorilla. Witness the simulation unfold and see if humanity prevails!</p>
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-primary mb-2">CHARACTER CLASSES</h3>
                  <ul className="space-y-2 text-sm">
                     <li className="flex items-start">
                       <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full mr-2 mt-1 shrink-0"></span>
                       <div><span className="font-semibold text-cyan-500 dark:text-cyan-400">Gorilla:</span> HP: 750 | DMG: 25 | Speed: Slow | Special: Area attack with pushback.</div>
                     </li>
                     <li className="flex items-start">
                       <span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full mr-2 mt-1 shrink-0"></span>
                       <div><span className="font-semibold text-blue-500 dark:text-blue-400">Super Men:</span> HP: 50 | DMG: 8 | Speed: Medium. Tough tanks.</div>
                     </li>
                     <li className="flex items-start">
                       <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full mr-2 mt-1 shrink-0"></span>
                       <div><span className="font-semibold text-green-600 dark:text-green-400">Medium Men:</span> HP: 30 | DMG: 4 | Speed: Medium. Balanced fighters.</div>
                     </li>
                     <li className="flex items-start">
                       <span className="inline-block w-2.5 h-2.5 bg-yellow-500 rounded-full mr-2 mt-1 shrink-0"></span>
                       <div><span className="font-semibold text-yellow-600 dark:text-yellow-400">Small Men:</span> HP: 15 | DMG: 2 | Speed: Fast. Quick but fragile.</div>
                     </li>
                  </ul>
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-primary mb-1">BATTLE SYSTEM</h3>
                  <p className="text-sm text-foreground/80">Men automatically move towards and attack the gorilla. The gorilla targets the closest man and uses area attacks. Physics-based pushback adds to the chaos!</p>
                </div>
              </div>
              <DialogFooter>
                 <DialogClose asChild>
                   <Button variant="outline">Close</Button>
                 </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog> 
          
          <ThemeToggle />
        </div>

      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="retro-text text-5xl md:text-6xl font-bold mb-8 neon-text">
          100 MEN VS 1 GORILLA
        </h1>
        
        <p className="text-lg md:text-xl text-foreground/80 max-w-2xl mb-12">
          Can 100 men defeat a single mighty gorilla? Experience the ultimate battle simulation and find out in this epic confrontation.
        </p>
        
        {/* Use shadcn button with variants */}
        <Button asChild size="lg" className="retro-text py-6 px-10 text-xl relative overflow-hidden group cursor-pointer" variant="outline">
          <Link href="/game">
            <span className="relative z-10">PLAY NOW</span>
            <span className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-30 transition-opacity duration-300"></span>
          </Link>
        </Button>

      </main>

      {/* Minimal Footer */}
      <footer className="py-4 px-4 text-center border-t border-border">
        <p className="text-muted-foreground text-sm">
          © 2024 APEX DEFENDERS
        </p>
      </footer>
    </div>
  );
}
