"use client";

import Link from 'next/link';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { GameConfig } from './types'; // Import GameConfig type

// Assuming @/components/ui path alias is configured
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"; // Import Input component
import { Progress } from "@/components/ui/progress"; // Import Progress
import { ThemeToggle } from "@/components/theme-toggle"; // Import ThemeToggle

// Import GameStateUpdate type
import type { GameStateUpdate } from './PhaserGame'; 

// Dynamically import PhaserGame to avoid SSR issues with Phaser
const PhaserGame = dynamic(() => import('./PhaserGame'), { 
  ssr: false, // Ensure it only runs on the client side
  loading: () => <p className="text-purple-400 retro-text text-center mt-8">LOADING GAME...</p> // Loading indicator
});

export default function GamePage() {
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<{[key: string]: number}>({});
  
  // Timer state
  const [battleTime, setBattleTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Character selection state
  const [superMenCount, setSuperMenCount] = useState(10);
  const [mediumMenCount, setMediumMenCount] = useState(40);
  const [smallMenCount, setSmallMenCount] = useState(50);
  
  // State for UI display, updated by Phaser
  const [gameState, setGameState] = useState<GameStateUpdate>({
      gorillaHealth: GORILLA_STATS_ADJUSTED.maxHealth, // Use initial max health
      gorillaMaxHealth: GORILLA_STATS_ADJUSTED.maxHealth,
      menLeft: 100, // Initial count
      fps: 0
  });

  // Total men count (should always equal 100)
  const totalMen = useMemo(() => superMenCount + mediumMenCount + smallMenCount, [superMenCount, mediumMenCount, smallMenCount]);

  // Memoize gameConfig to prevent unnecessary re-renders of PhaserGame
  const gameConfig = useMemo<GameConfig>(() => ({
    superMenCount,
    mediumMenCount,
    smallMenCount,
  }), [superMenCount, mediumMenCount, smallMenCount]);
  
  // Create a ref for the game end handler to avoid stale closures
  const gameEndHandlerRef = useRef<(result: string) => void>(() => {});

  const startGame = () => {
    if (totalMen === 100) {
      // Reset game state display on start
      setGameState({
          gorillaHealth: GORILLA_STATS_ADJUSTED.maxHealth, 
          gorillaMaxHealth: GORILLA_STATS_ADJUSTED.maxHealth,
          menLeft: 100, 
          fps: 0
      });
      setGameStarted(true);
      setGameEnded(false);
      setGameResult(null);
      
      // Start the timer
      setBattleTime(0);
      const interval = setInterval(() => {
        setBattleTime(prevTime => prevTime + 1);
      }, 1000);
      setTimerInterval(interval);
    }
  };

  // Use useCallback to prevent unnecessary re-renders of PhaserGame due to handler changes
  const handleGameEnd = useCallback((result: string) => {
    // Call the current ref value which will have the latest state values
    gameEndHandlerRef.current(result);
  }, []);

   const handleStateUpdate = useCallback((newState: GameStateUpdate) => {
        setGameState(newState);
    }, []); // Empty dependency array as setter is stable

  const resetGame = () => {
    setGameStarted(false);
    setGameEnded(false);
    setGameResult(null);
    setFinalScore(null);
    setScoreBreakdown({});
    // Reset counts to default or last selected?
    setSuperMenCount(10);
    setMediumMenCount(40);
    setSmallMenCount(50);
    // Reset displayed state too
    setGameState({
        gorillaHealth: GORILLA_STATS_ADJUSTED.maxHealth, 
        gorillaMaxHealth: GORILLA_STATS_ADJUSTED.maxHealth,
        menLeft: 100, 
        fps: 0
    });
    // Reset timer
    setBattleTime(0);
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
  }
  
  // Helper function to handle input changes and validation
  const handleCountChange = ( 
    value: string, 
    currentCount: number,
    setter: React.Dispatch<React.SetStateAction<number>>,
    otherCount1: number,
    otherCount2: number
  ) => {
    const newValue = parseInt(value, 10);
    if (isNaN(newValue) || newValue < 0) {
        // Allow clearing the input or handle invalid input (optional: set to 0?)
        if (value === '') setter(0); // Or maybe keep current value? Setting to 0 for now.
        return; 
    }

    const currentTotalWithoutThis = otherCount1 + otherCount2;
    const maxAllowed = 100 - currentTotalWithoutThis;
    
    setter(Math.min(newValue, maxAllowed)); // Ensure new value doesn't exceed max allowed
  };

  // Helper function to set max value for a type
  const handleSetMax = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    otherCount1: number,
    otherCount2: number
  ) => {
    const currentTotalWithoutThis = otherCount1 + otherCount2;
    setter(100 - currentTotalWithoutThis);
  };

  // Calculate health percentage and determine color class
  const gorillaHealthPercent = gameState.gorillaMaxHealth > 0 
    ? (gameState.gorillaHealth / gameState.gorillaMaxHealth) * 100 
    : 0;
  
  // Always use red for gorilla health bar
  const healthColor = '#ef4444'; // red-500 color

  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate score based on various factors
  const calculateScore = () => {
    // Base score starts at 1000
    let score = 1000;
    const breakdown: {[key: string]: number} = {};
    
    // 1. Calculate time factor (faster = better score)
    // Max time bonus of 1000 if completed under 30 seconds, decreases linearly until 180 seconds
    const maxTimeBonus = 1000;
    const minTimeThreshold = 30;  // seconds
    const maxTimeThreshold = 180; // seconds (3 minutes)
    
    let timeBonus = 0;
    if (battleTime <= minTimeThreshold) {
      timeBonus = maxTimeBonus;
    } else if (battleTime < maxTimeThreshold) {
      timeBonus = Math.floor(maxTimeBonus * (1 - (battleTime - minTimeThreshold) / (maxTimeThreshold - minTimeThreshold)));
    }
    score += timeBonus;
    breakdown['Time Bonus'] = timeBonus;
    
    // 2. Remaining men bonus (each surviving man = points)
    const survivingMen = gameState.menLeft;
    const survivorBonus = survivingMen * 10; // 10 points per surviving man
    score += survivorBonus;
    breakdown['Survivor Bonus'] = survivorBonus;
    
    // 3. Strategy bonus based on men composition
    // Small men are most efficient (high risk/reward), super men are least efficient
    const strategyScore = (
      smallMenCount * 2 +  // Small men are high value (2 points each)
      mediumMenCount * 1 + // Medium men are medium value (1 point each)
      superMenCount * 0.5  // Super men are low value (0.5 points each)
    ) * 5; // Multiply by 5 to make the impact meaningful
    
    const strategyBonus = Math.floor(strategyScore);
    score += strategyBonus;
    breakdown['Strategy Bonus'] = strategyBonus;
    
    // 4. Difficulty multiplier based on composition
    // More small men = higher difficulty
    const smallMenPercentage = smallMenCount / 100;
    const difficultyMultiplier = 1 + (smallMenPercentage * 0.5); // 1.0 to 1.5x multiplier
    
    // Apply multiplier
    score = Math.floor(score * difficultyMultiplier);
    breakdown['Difficulty Multiplier'] = Math.floor((difficultyMultiplier - 1) * 100) / 100; // Format as decimal
    
    // Set final score
    setFinalScore(score);
    setScoreBreakdown(breakdown);
  };

  // Update the handleGameEnd ref with fresh state values
  useEffect(() => {
    // Re-create the callback when these dependencies change
    gameEndHandlerRef.current = (result: string) => {
      setGameEnded(true);
      setGameResult(result);
      setGameStarted(false);
      
      // Stop the timer when game ends
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      
      // Calculate score if men win
      if (result === 'MEN WIN') {
        calculateScore();
      } else {
        setFinalScore(null);
        setScoreBreakdown({});
      }
    };
  }, [timerInterval, gameState.menLeft, superMenCount, mediumMenCount, smallMenCount, battleTime]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col scanlines font-mono">
      {/* Navbar - Use theme variables */}
      <nav className="py-4 px-6 flex justify-between items-center border-b border-border">
        <Link 
          href="/" 
          className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-500"
        >
          APEX DEFENDERS
        </Link>
        <div className="flex items-center space-x-4"> 
          <div className="text-primary hidden sm:block">100 MEN VS 1 GORILLA</div> 
          <ThemeToggle /> 
        </div>
      </nav>

      {/* Main Game Area */}
      <main className="flex-1 container mx-auto p-2 sm:p-4 flex flex-col items-center">

       {/* Conditionally Render Game UI Bar OR Selection/Result */}
        {gameStarted ? (
            // Game UI Bar - Use theme variables 
            <div className="w-full max-w-[800px] mb-2 p-2 sm:p-3 bg-card/80 border border-border rounded-lg flex flex-wrap justify-between items-center gap-2">
                {/* Men Count */}
                <div className="text-base sm:text-lg order-1">
                    MEN LEFT: <span className="text-cyan-500 dark:text-cyan-400 font-bold">{gameState.menLeft}</span>
                </div>
                 {/* FPS Counter */}
                <div className="text-xs sm:text-sm text-muted-foreground opacity-75 order-3 sm:order-2">
                    FPS: {gameState.fps}
                </div>
                {/* Gorilla Health */} 
                <div className="w-full sm:flex-1 px-0 sm:px-6 flex flex-col items-center order-2 sm:order-3">
                    <div className="text-xs sm:text-sm text-red-500 font-bold mb-1">GORILLA HEALTH</div>
                    <Progress 
                        value={gorillaHealthPercent} 
                        className="h-3 sm:h-4 w-full bg-muted border border-border [&>div]:bg-red-500" 
                        style={{ '--health-color': healthColor } as React.CSSProperties} 
                    />
                     <div className="text-[0.6rem] sm:text-xs text-muted-foreground mt-1">{Math.max(0, gameState.gorillaHealth)} / {gameState.gorillaMaxHealth}</div>
                </div>
            </div>
        ) : !gameEnded ? (
            // Character Selection Card - Use theme variables 
            <Card className="max-w-2xl w-full bg-card/90 border-border text-card-foreground font-mono mt-4 sm:mt-8">
              <CardHeader className="items-center pb-2 sm:pb-4">
                <CardTitle className="retro-text text-xl sm:text-2xl text-primary">SELECT YOUR FIGHTERS</CardTitle>
                <CardDescription className={`text-base sm:text-lg font-bold ${totalMen === 100 ? 'text-green-500' : 'text-red-500'}`}>
                  {totalMen}/100 MEN SELECTED
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
                {[ 
                     { type: 'Super Men', count: superMenCount, setCount: setSuperMenCount, other1: mediumMenCount, other2: smallMenCount, colorClass: 'text-blue-500 dark:text-blue-400', stats: "HP: 50 | Dmg: 8" },
                    { type: 'Medium Men', count: mediumMenCount, setCount: setMediumMenCount, other1: superMenCount, other2: smallMenCount, colorClass: 'text-green-600 dark:text-green-400', stats: "HP: 30 | Dmg: 4" },
                    { type: 'Small Men', count: smallMenCount, setCount: setSmallMenCount, other1: superMenCount, other2: mediumMenCount, colorClass: 'text-yellow-600 dark:text-yellow-400', stats: "HP: 15 | Dmg: 2 | Fast" },
                ].map((manType) => (
                  <div key={manType.type} className={`p-2 sm:p-3 bg-background/40 rounded border border-border/50`}>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
                      <div className="flex-1 pr-0 sm:pr-4 text-center sm:text-left">
                        <h3 className={`${manType.colorClass} font-bold text-sm sm:text-base`}>{manType.type.toUpperCase()}</h3>
                        <p className="text-xs text-muted-foreground">{manType.stats}</p>
                      </div>
                      <div className="flex items-center space-x-1 flex-wrap justify-center sm:justify-end">
                         <Button variant="outline" size="sm" className={`h-7 px-2 cursor-pointer`} onClick={() => manType.setCount(0)} disabled={manType.count <= 0}>Min</Button>
                        <Button variant="outline" size="icon" className={`w-7 h-7 cursor-pointer`} onClick={() => manType.setCount(Math.max(0, manType.count - 1))} disabled={manType.count <= 0}>-</Button>
                        <Input type="number" className="h-7 w-16 sm:w-20 text-center bg-input border-border/80 focus-visible:ring-primary" value={manType.count} onChange={(e) => handleCountChange(e.target.value, manType.count, manType.setCount, manType.other1, manType.other2)} min={0}/>
                        <Button variant="outline" size="icon" className={`w-7 h-7 cursor-pointer`} onClick={() => handleCountChange(String(manType.count + 1), manType.count, manType.setCount, manType.other1, manType.other2) } disabled={totalMen >= 100}>+</Button>
                         <Button variant="outline" size="sm" className={`h-7 px-2 cursor-pointer`} onClick={() => handleSetMax(manType.setCount, manType.other1, manType.other2)} disabled={totalMen >= 100}>Max</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="px-3 sm:px-6 pb-4 sm:pb-6">
                 {/* Use primary button style */} 
                <Button 
                  variant="outline"
                  className={`retro-text w-full py-3 text-base sm:text-lg relative overflow-hidden transition-colors duration-300 cursor-pointer ${
                    totalMen === 100 
                    ? 'border-primary hover:bg-primary/10' 
                    : 'opacity-60 cursor-not-allowed'
                  }`} 
                  disabled={totalMen !== 100} 
                  onClick={startGame}
                > 
                  START BATTLE 
                </Button>
              </CardFooter>
            </Card>
        ) : (
             // Game Result Card - Use theme variables 
            <Card className="max-w-md w-full bg-card border-border text-card-foreground font-mono mt-8 text-center">
                 <CardHeader>
                    <CardTitle className="retro-text text-2xl text-primary">BATTLE OVER</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className={`text-xl mb-4 ${gameResult === 'MEN WIN' ? 'text-green-500' : 'text-red-500'}`}>
                        {gameResult}
                    </p>
                    <div className="text-base text-muted-foreground mb-3">
                      Battle Duration: <span className="font-bold text-primary">{formatTime(battleTime)}</span>
                    </div>
                    
                    {finalScore !== null && (
                      <div className="mt-4 space-y-3">
                        <div className="bg-primary/10 border border-primary/30 rounded-lg py-3 px-4 mb-4">
                          <div className="text-sm uppercase tracking-wide text-primary mb-1">Final Score</div>
                          <div className="text-4xl font-bold text-primary font-mono">
                            {finalScore.toLocaleString()}
                          </div>
                        </div>
                        
                        <div className="bg-background/50 p-3 rounded text-left text-sm">
                          <h3 className="text-primary font-semibold mb-2">Score Breakdown:</h3>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Base Score:</span>
                              <span>1,000</span>
                            </div>
                            {Object.entries(scoreBreakdown).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span>{key}:</span>
                                <span className={value >= 0 ? 'text-green-500' : 'text-red-500'}>
                                  {key === 'Difficulty Multiplier' 
                                    ? `${value > 0 ? '+' : ''}${value}x` 
                                    : `${value > 0 ? '+' : ''}${value.toLocaleString()}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="text-xs text-muted-foreground mt-2">
                          Men Remaining: {gameState.menLeft}/100
                        </div>
                      </div>
                    )}
                    
                    {finalScore === null && gameResult === 'GORILLA WINS' && (
                      <div className="text-sm text-muted-foreground mt-4">
                        No score awarded. The men must win to earn points.
                      </div>
                    )}
                </CardContent>
                <CardFooter className="justify-center">
                     {/* Use primary button style */} 
                    <Button 
                      variant="outline"
                      className="retro-text py-3 px-6 text-lg border-primary hover:bg-primary/10 cursor-pointer" 
                      onClick={resetGame}
                    > 
                      PLAY AGAIN 
                    </Button>
                </CardFooter>
            </Card>
        )}

       {/* Phaser Canvas Container - Center it */} 
        {gameStarted && (
            <div className="w-full flex justify-center mt-4">
                <PhaserGame 
                    config={gameConfig} 
                    onGameEnd={handleGameEnd} 
                    onStateUpdate={handleStateUpdate} 
                />
            </div>
        )}
        
      </main>

      {/* Footer - Use theme variables */}
      <footer className="py-3 px-4 text-center border-t border-border">
        <p className="text-muted-foreground text-xs">
          © 2024 APEX DEFENDERS
        </p>
      </footer>
    </div>
  );
}

// Need to get initial stats from somewhere accessible to this component
// This is a simple way, ideally imported or fetched if more complex
const GORILLA_STATS_ADJUSTED = { 
  maxHealth: 750, 
  health: 750,    
  damage: 25, 
  speed: 50, 
}; 