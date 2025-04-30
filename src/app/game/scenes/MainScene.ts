import Phaser from 'phaser';
import { CharacterStats, GameConfig, ManType, SUPER_MAN_STATS, MEDIUM_MAN_STATS, SMALL_MAN_STATS } from '../types';

const GORILLA_ATTACK_RANGE = 80;
const MAN_ATTACK_RANGE = 50;
const GORILLA_BASE_COOLDOWN = 1200; // Base cooldown ms
const GORILLA_COOLDOWN_VARIANCE = 300; // +/- variance ms
const MAN_BASE_COOLDOWN = 600; // Base cooldown ms
const MAN_COOLDOWN_VARIANCE = 200; // +/- variance ms

// Slightly increased Gorilla Damage & Health
const GORILLA_STATS_ADJUSTED: CharacterStats = {
  maxHealth: 750, // Increased from 500
  health: 750,    // Increased from 500
  damage: 25, 
  speed: 50, 
};

export class MainScene extends Phaser.Scene {
    private gorilla?: Phaser.Physics.Arcade.Sprite;
    private menGroup?: Phaser.Physics.Arcade.Group;
    private gameConfig: GameConfig;
    private gameOver: boolean = false;

    constructor() {
        super({ key: 'MainScene' });
        this.gameConfig = { superMenCount: 0, mediumMenCount: 0, smallMenCount: 0 };
    }

    init(data: GameConfig) {
        this.gameConfig = data;
        this.gameOver = false; // Reset game over state on init
    }

    preload() {
        // Placeholder assets
        this.load.image('gorilla', 'https://via.placeholder.com/64/FF0000/000000?text=G');
        this.load.image(ManType.SUPER, 'https://via.placeholder.com/32/0000FF/FFFFFF?text=S'); 
        this.load.image(ManType.MEDIUM, 'https://via.placeholder.com/32/00FF00/000000?text=M');
        this.load.image(ManType.SMALL, 'https://via.placeholder.com/32/FFFF00/000000?text=s'); 
        this.load.image('background', 'https://via.placeholder.com/800x600/222222/cccccc?text=Battleground');
        // Note: For custom web fonts, you'd typically load them via CSS or a font loader.
        // Using generic 'monospace' for simplicity.
    }

    create() {
        this.add.image(400, 300, 'background');

        // Create Gorilla
        this.gorilla = this.physics.add.sprite(400, 150, 'gorilla');
        this.gorilla.setCollideWorldBounds(true);
        this.gorilla.setData('stats', { ...GORILLA_STATS_ADJUSTED });
        this.gorilla.setData('nextAttackTime', 0); // Initialize next attack time
        this.gorilla.setImmovable(true); // Gorilla shouldn't be pushed easily

        // Create Men Group
        this.menGroup = this.physics.add.group();

        this.createMen(ManType.SUPER, this.gameConfig.superMenCount, SUPER_MAN_STATS, 1.1); 
        this.createMen(ManType.MEDIUM, this.gameConfig.mediumMenCount, MEDIUM_MAN_STATS, 1.0); 
        this.createMen(ManType.SMALL, this.gameConfig.smallMenCount, SMALL_MAN_STATS, 0.9); 

        // Collisions (Setup before UI)
        this.physics.add.collider(this.gorilla, this.menGroup);
        this.physics.add.collider(this.menGroup, this.menGroup);

        // Emit initial state
        this.emitStateUpdate();
    }

    createMen(type: ManType, count: number, stats: CharacterStats, scale: number) {
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(100, 700); 
            const y = Phaser.Math.Between(400, 550); 
            const man = this.menGroup?.create(x, y, type) as Phaser.Physics.Arcade.Sprite;
            if (man) {
                man.setScale(scale);
                man.setCollideWorldBounds(true);
                man.setData('stats', { ...stats });
                man.setData('type', type);
                man.setData('nextAttackTime', this.time.now + Phaser.Math.Between(0, MAN_BASE_COOLDOWN));
                man.setCircle(man.width / 2); // Adjust physics body if needed after scaling
            }
        }
    }

    takeDamage(target: Phaser.Physics.Arcade.Sprite, amount: number) {
        const stats = target.getData('stats') as CharacterStats;
        if (!stats || stats.health <= 0 || !target.active) return; // Already dead or inactive

        stats.health -= amount;
        
        target.setTint(0xff0000); 
        this.time.delayedCall(100, () => {
            if(target.active) target.clearTint();
        });

        if (target === this.gorilla) {
            if (stats.health <= 0) {
                console.log("Gorilla Defeated!");
                target.disableBody(true, true); // Also disable gorilla on defeat
                this.endGame("MEN WIN");
            }
        } else {
            // It's a man
            if (stats.health <= 0) {
                target.disableBody(true, true); 
                this.menGroup?.remove(target, true, true); 
            }
        }
    }

    endGame(result: string) {
        if (this.gameOver) return; // Prevent multiple calls
        this.gameOver = true;
        console.log(`Game Over: ${result}`);
        this.physics.pause();
        // Emit an event to the React component
        this.game.events.emit('gameEnd', result);
    }

    // Method to emit current game state
    emitStateUpdate() {
        if (this.gameOver) return;

        const gorillaStats = this.gorilla?.getData('stats') as CharacterStats | undefined;
        const state = {
            gorillaHealth: gorillaStats?.health ?? 0,
            gorillaMaxHealth: gorillaStats?.maxHealth ?? GORILLA_STATS_ADJUSTED.maxHealth,
            menLeft: this.menGroup?.countActive(true) ?? 0,
            fps: Math.round(this.game.loop.actualFps)
        };
        this.game.events.emit('stateUpdate', state);
    }

    update(time: number, delta: number) {
        if (this.gameOver || !this.gorilla || !this.menGroup) return;

        // --- Gorilla Logic ---
        if (this.gorilla.active) {
            const gorillaStats = this.gorilla.getData('stats') as CharacterStats;
            const nextAttackTime = this.gorilla.getData('nextAttackTime') as number;
            let closestMan: Phaser.Physics.Arcade.Sprite | null = null;
            let minDistanceSq = Infinity;
            let menInRange: Phaser.Physics.Arcade.Sprite[] = [];
            let canAttack = time > nextAttackTime; // Check if gorilla can attack now

            this.menGroup.children.iterate((manSprite) => {
                const man = manSprite as Phaser.Physics.Arcade.Sprite;
                if (!man.active) return true; 
                const distanceSq = Phaser.Math.Distance.Squared(this.gorilla!.x, this.gorilla!.y, man.x, man.y);
                if (distanceSq < minDistanceSq) {
                    minDistanceSq = distanceSq;
                    closestMan = man;
                }
                if (distanceSq < GORILLA_ATTACK_RANGE * GORILLA_ATTACK_RANGE) {
                    menInRange.push(man);
                }
                return true;
            });

            // Gorilla Attack AI (Area Attack - Prioritized)
            if (canAttack && menInRange.length > 0) {
                console.log(`Gorilla attacks ${menInRange.length} men!`);
                (this.gorilla.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0); // Stop moving to attack
                
                menInRange.forEach(man => {
                    if (!man.active) return; 
                    this.takeDamage(man, gorillaStats.damage);
                    const pushDirection = new Phaser.Math.Vector2(man.x - this.gorilla!.x, man.y - this.gorilla!.y).normalize();
                    const pushForce = 150; 
                    const manBody = man.body as Phaser.Physics.Arcade.Body;
                    if (manBody) {
                        manBody.setVelocity(pushDirection.x * pushForce, pushDirection.y * pushForce);
                        // Set a temporary state to prevent immediate re-engagement
                        man.setData('isRecovering', true);
                        man.setData('recoveryEndTime', time + 300); // Recover for 300ms
                    }
                });
                
                const cooldown = GORILLA_BASE_COOLDOWN + Phaser.Math.Between(-GORILLA_COOLDOWN_VARIANCE, GORILLA_COOLDOWN_VARIANCE);
                this.gorilla.setData('nextAttackTime', time + Math.max(50, cooldown));
                
                this.gorilla.setTint(0xffffff); 
                this.time.delayedCall(100, () => {
                    if(this.gorilla?.active) this.gorilla.clearTint(); 
                });
                 canAttack = false; // Reset attack flag for this frame after attacking
            }
            // Gorilla AI: Move towards the closest man only if not attacking
            else if (closestMan && this.gorilla.body) {
                this.physics.moveToObject(this.gorilla, closestMan, gorillaStats.speed);
            } else if (this.gorilla.body) {
                 (this.gorilla.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            }
        }

        // --- Men Logic ---
        this.menGroup.children.iterate((manSprite) => {
            const man = manSprite as Phaser.Physics.Arcade.Sprite;
            if (!man.active || !this.gorilla?.active) return true;

            const manStats = man.getData('stats') as CharacterStats;
            const nextAttackTime = man.getData('nextAttackTime') as number;
            const manBody = man.body as Phaser.Physics.Arcade.Body;
            const gorillaBody = this.gorilla.body as Phaser.Physics.Arcade.Body;
            let isRecovering = man.getData('isRecovering') || false;
            let recoveryEndTime = man.getData('recoveryEndTime') || 0;

            // Check if recovery period ended
            if (isRecovering && time > recoveryEndTime) {
                man.setData('isRecovering', false);
                isRecovering = false;
            }

            // Movement and Attack Logic (only if not recovering)
            if (!isRecovering) {
                 // Attack AI (Check before moving)
                if (time > nextAttackTime) {
                    const distanceToGorillaSq = Phaser.Math.Distance.Squared(manBody.center.x, manBody.center.y, gorillaBody.center.x, gorillaBody.center.y);
                    if (distanceToGorillaSq < MAN_ATTACK_RANGE * MAN_ATTACK_RANGE) {
                        manBody.setVelocity(0, 0); // Stop moving to attack
                        this.takeDamage(this.gorilla, manStats.damage);
                        const cooldown = MAN_BASE_COOLDOWN + Phaser.Math.Between(-MAN_COOLDOWN_VARIANCE, MAN_COOLDOWN_VARIANCE);
                        man.setData('nextAttackTime', time + Math.max(50, cooldown));
                        man.setTint(0x0000ff);
                        this.time.delayedCall(50, () => {
                           if(man.active) man.clearTint();
                        });
                        return true; // Skip movement logic if attacked this frame
                    }
                }
                
                // AI: Move towards the gorilla if didn't attack
                 this.physics.moveToObject(man, this.gorilla, manStats.speed);
            } 
            // If recovering, velocity might still be active from pushback, let it continue or stop it
            // else { // Optional: gradually slow down recovering men? 
            //     manBody.velocity.scale(0.95);
            // }
            
            return true;
        });

        // --- Check Win/Loss Conditions ---
        if (this.menGroup.countActive(true) === 0 && !this.gameOver) {
            console.log("All Men Defeated!");
            this.endGame("GORILLA WINS");
        }
        
        // --- Emit State Update ---
        this.emitStateUpdate(); // Emit state every frame
    }
} 