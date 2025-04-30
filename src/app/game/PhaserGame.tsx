"use client";

import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { GameConfig } from './types';

// Define the structure of the state updates
export interface GameStateUpdate {
  gorillaHealth: number;
  gorillaMaxHealth: number;
  menLeft: number;
  fps: number;
}

interface PhaserGameProps {
  config: GameConfig;
  onGameEnd?: (result: string) => void; 
  onStateUpdate?: (state: GameStateUpdate) => void; // Callback for state updates
}

const PhaserGame: React.FC<PhaserGameProps> = ({ config, onGameEnd, onStateUpdate }) => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let gameEndHandler: ((result: string) => void) | undefined;
    let stateUpdateHandler: ((state: GameStateUpdate) => void) | undefined;

    if (gameContainerRef.current && !gameInstanceRef.current) {
      const phaserConfig: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO, 
        width: 800,       
        height: 600,      
        parent: gameContainerRef.current, 
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 }, 
            debug: process.env.NODE_ENV === 'development', 
          },
        },
        scene: MainScene, 
        backgroundColor: '#1a1a1a', 
      };

      gameInstanceRef.current = new Phaser.Game(phaserConfig);
      
      gameInstanceRef.current.scene.start('MainScene', config);

      // Listener for game end
      if (onGameEnd) {
          gameEndHandler = (result: string) => {
            onGameEnd(result);
          };
          gameInstanceRef.current.events.on('gameEnd', gameEndHandler);
      }

      // Listener for state updates
      if (onStateUpdate) {
        stateUpdateHandler = (state: GameStateUpdate) => {
          onStateUpdate(state);
        };
        gameInstanceRef.current.events.on('stateUpdate', stateUpdateHandler);
      }
    }

    // Cleanup function
    return () => {
      if (gameInstanceRef.current) { 
        if (gameEndHandler) {
             gameInstanceRef.current.events.off('gameEnd', gameEndHandler);
        }
        if (stateUpdateHandler) {
            gameInstanceRef.current.events.off('stateUpdate', stateUpdateHandler);
        }
        gameInstanceRef.current.destroy(true); 
        gameInstanceRef.current = null;
      }
    };
  // Add onStateUpdate to dependency array
  }, [config, onGameEnd, onStateUpdate]); 

  // The div only holds the Phaser canvas
  return <div ref={gameContainerRef} style={{ width: '800px', height: '600px' }} />;
};

export default PhaserGame; 