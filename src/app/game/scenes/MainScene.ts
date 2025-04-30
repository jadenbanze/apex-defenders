import Phaser from 'phaser';
import { CharacterStats, GameConfig, ManType, SUPER_MAN_STATS, MEDIUM_MAN_STATS, SMALL_MAN_STATS, StrategyType } from '../types';

// Quadtree implementation for spatial partitioning
class QuadTree {
    private boundary: { x: number, y: number, width: number, height: number };
    private capacity: number;
    private objects: Array<Phaser.Physics.Arcade.Sprite>;
    private divided: boolean;
    private northwest?: QuadTree;
    private northeast?: QuadTree;
    private southwest?: QuadTree;
    private southeast?: QuadTree;

    constructor(boundary: { x: number, y: number, width: number, height: number }, capacity: number) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.objects = [];
        this.divided = false;
    }

    // Subdivide this quadtree into four equal quadrants
    subdivide() {
        const x = this.boundary.x;
        const y = this.boundary.y;
        const w = this.boundary.width / 2;
        const h = this.boundary.height / 2;

        const ne = { x: x + w, y: y, width: w, height: h };
        const nw = { x: x, y: y, width: w, height: h };
        const se = { x: x + w, y: y + h, width: w, height: h };
        const sw = { x: x, y: y + h, width: w, height: h };

        this.northwest = new QuadTree(nw, this.capacity);
        this.northeast = new QuadTree(ne, this.capacity);
        this.southwest = new QuadTree(sw, this.capacity);
        this.southeast = new QuadTree(se, this.capacity);

        this.divided = true;

        // Redistribute existing objects into subdivisions
        for (const obj of this.objects) {
            this.insert(obj);
        }
        this.objects = [];
    }

    // Check if this quadtree contains object
    contains(sprite: Phaser.Physics.Arcade.Sprite) {
        return sprite.x >= this.boundary.x - sprite.width/2 &&
               sprite.x < this.boundary.x + this.boundary.width + sprite.width/2 &&
               sprite.y >= this.boundary.y - sprite.height/2 &&
               sprite.y < this.boundary.y + this.boundary.height + sprite.height/2;
    }

    // Insert a new object into the quadtree
    insert(sprite: Phaser.Physics.Arcade.Sprite): boolean {
        // Ignore inactive sprites
        if (!sprite.active) return false;

        if (!this.contains(sprite)) {
            return false;
        }

        if (this.objects.length < this.capacity && !this.divided) {
            this.objects.push(sprite);
            return true;
        }

        if (!this.divided) {
            this.subdivide();
        }

        return (
            this.northwest!.insert(sprite) ||
            this.northeast!.insert(sprite) ||
            this.southwest!.insert(sprite) ||
            this.southeast!.insert(sprite)
        );
    }

    // Clear all objects from the quadtree
    clear() {
        this.objects = [];

        if (this.divided) {
            this.northwest!.clear();
            this.northeast!.clear();
            this.southwest!.clear();
            this.southeast!.clear();
            this.divided = false;
            this.northwest = undefined;
            this.northeast = undefined;
            this.southwest = undefined;
            this.southeast = undefined;
        }
    }

    // Find all objects that could collide with the given object
    query(sprite: Phaser.Physics.Arcade.Sprite, found: Array<Phaser.Physics.Arcade.Sprite> = []): Array<Phaser.Physics.Arcade.Sprite> {
        if (!this.contains(sprite)) {
            return found;
        }

        for (const obj of this.objects) {
            if (obj !== sprite && obj.active) {
                found.push(obj);
            }
        }

        if (this.divided) {
            this.northwest!.query(sprite, found);
            this.northeast!.query(sprite, found);
            this.southwest!.query(sprite, found);
            this.southeast!.query(sprite, found);
        }

        return found;
    }

    // Find objects within a certain range of a target position
    queryRadius(x: number, y: number, radius: number, found: Array<Phaser.Physics.Arcade.Sprite> = []): Array<Phaser.Physics.Arcade.Sprite> {
        // If the circle is far away from this quad, there's no need to search further
        const distX = Math.max(this.boundary.x - x, 0, x - (this.boundary.x + this.boundary.width));
        const distY = Math.max(this.boundary.y - y, 0, y - (this.boundary.y + this.boundary.height));
        if (Math.sqrt(distX * distX + distY * distY) > radius) {
            return found;
        }

        // Check all objects in this quad
        for (const obj of this.objects) {
            if (obj.active) {
                const dx = obj.x - x;
                const dy = obj.y - y;
                const distSquared = dx * dx + dy * dy;
                if (distSquared <= radius * radius) {
                    found.push(obj);
                }
            }
        }

        // Recursively check children
        if (this.divided) {
            this.northwest!.queryRadius(x, y, radius, found);
            this.northeast!.queryRadius(x, y, radius, found);
            this.southwest!.queryRadius(x, y, radius, found);
            this.southeast!.queryRadius(x, y, radius, found);
        }

        return found;
    }
}

const GORILLA_ATTACK_RANGE = 80;
const MAN_ATTACK_RANGE = 50;
const GORILLA_BASE_COOLDOWN = 1200; // Base cooldown ms
const GORILLA_COOLDOWN_VARIANCE = 300; // +/- variance ms
const MAN_BASE_COOLDOWN = 600; // Base cooldown ms
const MAN_COOLDOWN_VARIANCE = 200; // +/- variance ms

// Define powerup types and effects
enum PowerUpType {
  HEALTH = 'health',
  DAMAGE = 'damage',
  SPEED = 'speed',
}

interface PowerUp {
  type: PowerUpType;
  x: number;
  y: number;
  sprite?: Phaser.Physics.Arcade.Sprite;
  duration: number; // duration in ms, 0 for instant effects
}

// Slightly increased Gorilla Damage & Health
const GORILLA_STATS_ADJUSTED: CharacterStats = {
  maxHealth: 650, // Reduced from 750
  health: 650,    // Reduced from 750
  damage: 20,     // Reduced from 25
  speed: 45,      // Reduced from 50
};

// For men flocking behavior
interface FlockingData {
    neighbors: Phaser.Physics.Arcade.Sprite[];
}

// Define type-specific speed multipliers for men
const MEN_SPEED_MULTIPLIERS = {
    [ManType.SUPER]: 0.9,    // Super men are slowest
    [ManType.MEDIUM]: 1.0,   // Medium men are baseline
    [ManType.SMALL]: 1.35    // Small men are 35% faster (increased from default)
};

// Special gorilla abilities
enum GorillaAbility {
    GROUND_SLAM = 'groundSlam',
    RAGE_MODE = 'rageMode',
    INTIMIDATE = 'intimidate',
}

interface GorillaAbilityInfo {
    name: string;
    cooldown: number;   // ms
    duration: number;   // ms for effects that last (0 for instant)
    lastUsed: number;   // timestamp when last used
    isActive: boolean;  // whether ability is currently active
    effectMultiplier: number; // effect strength multiplier
}

export class MainScene extends Phaser.Scene {
    private gorilla?: Phaser.Physics.Arcade.Sprite;
    private menGroup?: Phaser.Physics.Arcade.Group;
    private powerUpsGroup?: Phaser.Physics.Arcade.Group;
    private gameConfig: GameConfig;
    private gameOver: boolean = false;
    private nextPowerUpTime: number = 0;
    private powerUpSpawnInterval: number = 10000; // 10 seconds between powerups
    private lastStateUpdateTime: number = 0; // Track last UI update time
    private stateUpdateInterval: number = 100; // Update UI every 100ms (was previously every 5th frame)
    private currentMenCount: number = 0; // Cache current men count
    private lastReportedMenCount: number = 0; // Last reported men count
    private lastReportedGorillaHealth: number = 0; // Last reported gorilla health
    private quadtree?: QuadTree; // Spatial partitioning for efficient collision detection
    private enableFlocking: boolean = true;
    private flockingMap: Map<Phaser.Physics.Arcade.Sprite, FlockingData> = new Map();
    private flockingParams = {
        separationWeight: 2.0,   // Increased from 1.5 - avoid crowding more
        cohesionWeight: 0.8,     // Increased from 0.7 - stay with group better
        alignmentWeight: 0.6,    // Increased from 0.5 - follow group direction better
        targetWeight: 1.5,       // Reduced from 2.0 - less focus on gorilla, more on group
        neighborRadius: 120,     // Increased from 100 - consider neighbors from further away
        maxSpeed: 135,           // Increased from 120 - move faster
        maxForce: 0.15           // Increased from 0.1 - turn more sharply
    };
    
    // Gorilla special abilities
    private gorillaAbilities: Map<GorillaAbility, GorillaAbilityInfo> = new Map();
    private nextAbilityTime: number = 0;
    private abilityMinInterval: number = 5000; // Min ms between abilities

    constructor() {
        super({ key: 'MainScene' });
        this.gameConfig = { superMenCount: 0, mediumMenCount: 0, smallMenCount: 0, strategy: 'random' };
    }

    init(data: GameConfig) {
        this.gameConfig = data;
        this.gameOver = false; // Reset game over state on init
        this.nextPowerUpTime = 0; // Reset powerup timer
        this.lastStateUpdateTime = 0;
        this.currentMenCount = data.superMenCount + data.mediumMenCount + data.smallMenCount;
        this.lastReportedMenCount = this.currentMenCount;
        this.lastReportedGorillaHealth = GORILLA_STATS_ADJUSTED.health;
        
        // Initialize gorilla abilities
        this.setupGorillaAbilities();
    }

    setupGorillaAbilities() {
        this.gorillaAbilities.clear();
        
        // Ground Slam - AOE damage in a larger radius
        this.gorillaAbilities.set(GorillaAbility.GROUND_SLAM, {
            name: "Ground Slam",
            cooldown: 15000,  // Increased from 10000
            duration: 0,      // Instant effect
            lastUsed: 0,
            isActive: false,
            effectMultiplier: 0.8 // Reduced from 1.0
        });
        
        // Rage Mode - Increased damage and speed for a duration
        this.gorillaAbilities.set(GorillaAbility.RAGE_MODE, {
            name: "Rage Mode",
            cooldown: 25000,  // Increased from 20000
            duration: 4000,   // Reduced from 5000
            lastUsed: 0,
            isActive: false,
            effectMultiplier: 1.3 // Reduced from 1.5
        });
        
        // Intimidate - Briefly stuns nearby men
        this.gorillaAbilities.set(GorillaAbility.INTIMIDATE, {
            name: "Intimidate",
            cooldown: 20000,  // Increased from 15000
            duration: 1500,   // Reduced from 2000
            lastUsed: 0,
            isActive: false,
            effectMultiplier: 0.8 // Reduced from 1.0
        });
    }

    preload() {
        // Placeholder assets
        this.load.image('gorilla', 'https://via.placeholder.com/64/FF0000/000000?text=G');
        this.load.image(ManType.SUPER, 'https://via.placeholder.com/32/0000FF/FFFFFF?text=S'); 
        this.load.image(ManType.MEDIUM, 'https://via.placeholder.com/32/00FF00/000000?text=M');
        this.load.image(ManType.SMALL, 'https://via.placeholder.com/32/FFFF00/000000?text=s'); 
        this.load.image('background', 'https://via.placeholder.com/800x600/222222/cccccc?text=Battleground');
        
        // Power-up assets
        this.load.image(PowerUpType.HEALTH, 'https://via.placeholder.com/24/FF0000/FFFFFF?text=H');
        this.load.image(PowerUpType.DAMAGE, 'https://via.placeholder.com/24/FFA500/000000?text=D');
        this.load.image(PowerUpType.SPEED, 'https://via.placeholder.com/24/00FFFF/000000?text=S');
    }

    create() {
        this.add.image(400, 300, 'background');

        // Initialize quadtree for spatial partitioning
        this.quadtree = new QuadTree({ x: 0, y: 0, width: 800, height: 600 }, 10);

        // Create Gorilla
        this.gorilla = this.physics.add.sprite(400, 150, 'gorilla');
        this.gorilla.setCollideWorldBounds(true);
        this.gorilla.setData('stats', { ...GORILLA_STATS_ADJUSTED });
        this.gorilla.setData('nextAttackTime', 0); // Initialize next attack time
        this.gorilla.setImmovable(true); // Gorilla shouldn't be pushed easily

        // Create Men Group
        this.menGroup = this.physics.add.group();
        
        // Create Power-ups Group
        this.powerUpsGroup = this.physics.add.group();

        // Deploy men according to selected strategy
        this.deployMenWithStrategy();

        // Collisions
        this.physics.add.collider(this.gorilla, this.menGroup);
        this.physics.add.collider(this.menGroup, this.menGroup);
        
        // Power-up collection
        this.physics.add.overlap(
            this.menGroup,
            this.powerUpsGroup,
            (obj1, obj2) => {
                // Type cast to correct types
                this.collectPowerUp(obj1 as Phaser.Physics.Arcade.Sprite, obj2 as Phaser.Physics.Arcade.Sprite);
            },
            undefined,
            this
        );

        // Schedule first power-up
        this.nextPowerUpTime = this.time.now + this.powerUpSpawnInterval;

        // Emit initial state
        this.emitStateUpdate();
    }
    
    deployMenWithStrategy() {
        const { strategy, superMenCount, mediumMenCount, smallMenCount } = this.gameConfig;
        
        switch (strategy) {
            case StrategyType.SURROUND:
                this.deploySurroundStrategy(superMenCount, mediumMenCount, smallMenCount);
                break;
            case StrategyType.FLANK:
                this.deployFlankStrategy(superMenCount, mediumMenCount, smallMenCount);
                break;
            case StrategyType.PHALANX:
                this.deployPhalanxStrategy(superMenCount, mediumMenCount, smallMenCount);
                break;
            case StrategyType.RANDOM:
            default:
                this.deployRandomStrategy(superMenCount, mediumMenCount, smallMenCount);
                break;
        }
        
        // Apply strategy-specific bonuses
        this.applyStrategyBonuses(strategy);
    }
    
    deployRandomStrategy(superCount: number, mediumCount: number, smallCount: number) {
        this.createMen(ManType.SUPER, superCount, SUPER_MAN_STATS, 1.1, { minX: 100, maxX: 700, minY: 400, maxY: 550 }); 
        this.createMen(ManType.MEDIUM, mediumCount, MEDIUM_MAN_STATS, 1.0, { minX: 100, maxX: 700, minY: 400, maxY: 550 }); 
        this.createMen(ManType.SMALL, smallCount, SMALL_MAN_STATS, 0.9, { minX: 100, maxX: 700, minY: 400, maxY: 550 }); 
    }
    
    deploySurroundStrategy(superCount: number, mediumCount: number, smallCount: number) {
        // Create a circular formation around the gorilla
        const center = { x: 400, y: 300 };
        const radius = 250; // Distance from center
        
        // Distribute super men evenly in a circle
        this.createMenInCircle(ManType.SUPER, superCount, SUPER_MAN_STATS, 1.1, center, radius, 0);
        
        // Distribute medium men evenly in a slightly smaller circle
        this.createMenInCircle(ManType.MEDIUM, mediumCount, MEDIUM_MAN_STATS, 1.0, center, radius - 30, 120);
        
        // Distribute small men evenly in an even smaller circle
        this.createMenInCircle(ManType.SMALL, smallCount, SMALL_MAN_STATS, 0.9, center, radius - 60, 240);
    }
    
    deployFlankStrategy(superCount: number, mediumCount: number, smallCount: number) {
        // Position men to attack from the sides, with super men in front
        const gorillaY = this.gorilla?.y || 150;
        
        // Super men in the middle front
        this.createMen(ManType.SUPER, superCount, SUPER_MAN_STATS, 1.1, { 
            minX: 300, maxX: 500, minY: gorillaY + 100, maxY: gorillaY + 200 
        });
        
        // Medium men on the left flank
        this.createMen(ManType.MEDIUM, Math.ceil(mediumCount/2), MEDIUM_MAN_STATS, 1.0, { 
            minX: 100, maxX: 250, minY: gorillaY + 50, maxY: gorillaY + 350 
        });
        
        // Medium men on the right flank
        this.createMen(ManType.MEDIUM, Math.floor(mediumCount/2), MEDIUM_MAN_STATS, 1.0, { 
            minX: 550, maxX: 700, minY: gorillaY + 50, maxY: gorillaY + 350 
        });
        
        // Small men split between far left and far right for fast flanking
        this.createMen(ManType.SMALL, Math.ceil(smallCount/2), SMALL_MAN_STATS, 0.9, { 
            minX: 50, maxX: 150, minY: gorillaY + 200, maxY: gorillaY + 400 
        });
        
        this.createMen(ManType.SMALL, Math.floor(smallCount/2), SMALL_MAN_STATS, 0.9, { 
            minX: 650, maxX: 750, minY: gorillaY + 200, maxY: gorillaY + 400 
        });
    }
    
    deployPhalanxStrategy(superCount: number, mediumCount: number, smallCount: number) {
        const gorillaY = this.gorilla?.y || 150;
        
        // Super men in front line
        this.createMen(ManType.SUPER, superCount, SUPER_MAN_STATS, 1.1, { 
            minX: 200, maxX: 600, minY: gorillaY + 100, maxY: gorillaY + 150 
        });
        
        // Medium men in middle lines
        this.createMen(ManType.MEDIUM, mediumCount, MEDIUM_MAN_STATS, 1.0, { 
            minX: 150, maxX: 650, minY: gorillaY + 180, maxY: gorillaY + 300 
        });
        
        // Small men in back lines
        this.createMen(ManType.SMALL, smallCount, SMALL_MAN_STATS, 0.9, { 
            minX: 100, maxX: 700, minY: gorillaY + 320, maxY: gorillaY + 450 
        });
    }
    
    createMenInCircle(type: ManType, count: number, stats: CharacterStats, scale: number, center: {x: number, y: number}, radius: number, rotationOffset: number = 0) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count * 360 + rotationOffset) * (Math.PI / 180);
            const x = center.x + radius * Math.cos(angle);
            const y = center.y + radius * Math.sin(angle);
            
            const man = this.menGroup?.create(x, y, type) as Phaser.Physics.Arcade.Sprite;
            if (man) {
                man.setScale(scale);
                man.setCollideWorldBounds(true);
                
                // Apply type-specific speed multiplier
                const adjustedStats = { ...stats };
                if (type === ManType.SMALL) {
                    // Enhance small men's mobility
                    adjustedStats.speed *= MEN_SPEED_MULTIPLIERS[type];
                }
                
                man.setData('stats', adjustedStats);
                man.setData('type', type);
                man.setData('nextAttackTime', this.time.now + Phaser.Math.Between(0, MAN_BASE_COOLDOWN));
                man.setCircle(man.width / 2);
            }
        }
    }
    
    applyStrategyBonuses(strategy: string) {
        if (!this.menGroup) return;
        
        switch (strategy) {
            case StrategyType.SURROUND:
                // Coordination bonus: All men attack more efficiently
                this.menGroup.children.iterate((child) => {
                    const man = child as Phaser.Physics.Arcade.Sprite;
                    const stats = man.getData('stats') as CharacterStats;
                    stats.damage *= 1.2; // 20% damage bonus
                    return true;
                });
                break;
                
            case StrategyType.FLANK:
                // Surprise advantage: Small men get speed boost
                this.menGroup.children.iterate((child) => {
                    const man = child as Phaser.Physics.Arcade.Sprite;
                    if (man.getData('type') === ManType.SMALL) {
                        const stats = man.getData('stats') as CharacterStats;
                        stats.speed *= 1.3; // 30% speed bonus
                    }
                    return true;
                });
                break;
                
            case StrategyType.PHALANX:
                // Defensive advantage: Super men get health boost
                this.menGroup.children.iterate((child) => {
                    const man = child as Phaser.Physics.Arcade.Sprite;
                    if (man.getData('type') === ManType.SUPER) {
                        const stats = man.getData('stats') as CharacterStats;
                        stats.maxHealth *= 1.3; // 30% max health bonus
                        stats.health = stats.maxHealth; // Set current health to new max
                    }
                    return true;
                });
                break;
        }
    }

    createMen(type: ManType, count: number, stats: CharacterStats, scale: number, bounds: {minX: number, maxX: number, minY: number, maxY: number}) {
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(bounds.minX, bounds.maxX);
            const y = Phaser.Math.Between(bounds.minY, bounds.maxY);
            const man = this.menGroup?.create(x, y, type) as Phaser.Physics.Arcade.Sprite;
            if (man) {
                man.setScale(scale);
                man.setCollideWorldBounds(true);
                
                // Apply type-specific speed multiplier
                const adjustedStats = { ...stats };
                if (type === ManType.SMALL) {
                    // Enhance small men's mobility
                    adjustedStats.speed *= MEN_SPEED_MULTIPLIERS[type];
                }
                
                man.setData('stats', adjustedStats);
                man.setData('type', type);
                man.setData('nextAttackTime', this.time.now + Phaser.Math.Between(0, MAN_BASE_COOLDOWN));
                man.setCircle(man.width / 2);
            }
        }
    }
    
    spawnPowerUp() {
        if (!this.powerUpsGroup) return;
        
        // Choose random power-up type
        const types = [PowerUpType.HEALTH, PowerUpType.DAMAGE, PowerUpType.SPEED];
        const type = types[Math.floor(Math.random() * types.length)];
        
        // Choose random position (avoiding gorilla's area)
        let x, y;
        const gorillaX = this.gorilla?.x || 400;
        const gorillaY = this.gorilla?.y || 150;
        
        do {
            x = Phaser.Math.Between(50, 750);
            y = Phaser.Math.Between(50, 550);
        } while (Phaser.Math.Distance.Between(x, y, gorillaX, gorillaY) < 100);
        
        // Create power-up sprite
        const powerUp = this.powerUpsGroup.create(x, y, type) as Phaser.Physics.Arcade.Sprite;
        
        // Set properties
        powerUp.setData('type', type);
        powerUp.setScale(1.2);
        powerUp.setDepth(1); // Ensure it's above background
        
        // Add visual effects
        this.tweens.add({
            targets: powerUp,
            y: powerUp.y - 10,
            duration: 1000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
        
        // Auto-despawn after 15 seconds
        this.time.delayedCall(15000, () => {
            if (powerUp.active) {
                powerUp.destroy();
            }
        });
    }
    
    collectPowerUp(man: Phaser.Physics.Arcade.Sprite, powerUp: Phaser.Physics.Arcade.Sprite) {
        if (!man.active || !powerUp.active) return;
        
        const type = powerUp.getData('type') as PowerUpType;
        const manStats = man.getData('stats') as CharacterStats;
        const manType = man.getData('type') as ManType;
        
        // Apply power-up effect based on type
        switch (type) {
            case PowerUpType.HEALTH:
                // Heal nearby men (area effect)
                this.menGroup?.children.iterate((child) => {
                    const nearbyMan = child as Phaser.Physics.Arcade.Sprite;
                    if (!nearbyMan.active) return true;
                    
                    const distance = Phaser.Math.Distance.Between(
                        man.x, man.y, nearbyMan.x, nearbyMan.y
                    );
                    
                    if (distance < 100) { // 100px radius
                        const stats = nearbyMan.getData('stats') as CharacterStats;
                        stats.health = Math.min(stats.maxHealth, stats.health + stats.maxHealth * 0.3);
                        
                        // Visual feedback
                        nearbyMan.setTint(0x00ff00);
                        this.time.delayedCall(300, () => {
                            if (nearbyMan.active) nearbyMan.clearTint();
                        });
                    }
                    
                    return true;
                });
                break;
                
            case PowerUpType.DAMAGE:
                // Damage boost to the collector
                manStats.damage *= 1.5; // 50% damage boost
                
                // Visual feedback - red glow effect
                man.setTint(0xff4500);
                
                // Set timeout to reset damage
                this.time.delayedCall(8000, () => {
                    if (man.active) {
                        manStats.damage /= 1.5;
                        man.clearTint();
                    }
                });
                break;
                
            case PowerUpType.SPEED:
                // Speed boost to all men of the same type
                this.menGroup?.children.iterate((child) => {
                    const typedMan = child as Phaser.Physics.Arcade.Sprite;
                    if (!typedMan.active) return true;
                    
                    if (typedMan.getData('type') === manType) {
                        const stats = typedMan.getData('stats') as CharacterStats;
                        stats.speed *= 1.4; // 40% speed boost
                        
                        // Visual feedback
                        typedMan.setTint(0x00ffff);
                        
                        // Set timeout to reset speed
                        this.time.delayedCall(10000, () => {
                            if (typedMan.active) {
                                stats.speed /= 1.4;
                                typedMan.clearTint();
                            }
                        });
                    }
                    
                    return true;
                });
                break;
        }
        
        // Create a visual effect at the collection point
        const effectCircle = this.add.circle(powerUp.x, powerUp.y, 50, 0xffffff, 0.7);
        this.tweens.add({
            targets: effectCircle,
            alpha: 0,
            scale: 2,
            duration: 500,
            onComplete: () => effectCircle.destroy()
        });
        
        // Remove the power-up
        powerUp.destroy();
    }

    takeDamage(target: Phaser.Physics.Arcade.Sprite, amount: number) {
        const stats = target.getData('stats') as CharacterStats;
        if (!stats || stats.health <= 0 || !target.active) return; // Already dead or inactive

        const oldHealth = stats.health;
        
        // Give men a critical hit chance against gorilla
        if (target === this.gorilla) {
            const manType = target === this.gorilla ? null : target.getData('type') as ManType;
            
            // Small men get extra attack power
            if (manType === ManType.SMALL) {
                // Small men deal 20% extra damage to gorilla (increased from before)
                amount *= 1.2;
            } else if (manType === ManType.SUPER) {
                // Super men deal 15% extra damage to gorilla
                amount *= 1.15;
            }
            
            // 10% chance for critical hit (1.5x damage)
            if (Math.random() < 0.1) {
                amount *= 1.5;
                
                // Visual effect for critical hit
                const critText = this.add.text(target.x, target.y - 20, 'CRIT!', {
                    fontSize: '16px',
                    color: '#ff0000',
                    fontStyle: 'bold'
                });
                critText.setOrigin(0.5);
                
                this.tweens.add({
                    targets: critText,
                    y: critText.y - 30,
                    alpha: 0,
                    duration: 800,
                    onComplete: () => critText.destroy()
                });
            }
        } else {
            // Men take reduced damage based on type
            const manType = target.getData('type') as ManType;
            if (manType === ManType.SUPER) {
                // Super men have 15% damage reduction
                amount *= 0.85;
            } else if (manType === ManType.SMALL) {
                // Small men have 15% dodge chance (increased from 10%)
                if (Math.random() < 0.15) {
                    // Dodge successful
                    amount = 0;
                    
                    // Dodge text effect
                    const dodgeText = this.add.text(target.x, target.y - 15, 'DODGE!', {
                        fontSize: '12px',
                        color: '#00ffff',
                        fontStyle: 'bold'
                    });
                    dodgeText.setOrigin(0.5);
                    
                    this.tweens.add({
                        targets: dodgeText,
                        y: dodgeText.y - 20,
                        alpha: 0,
                        duration: 600,
                        onComplete: () => dodgeText.destroy()
                    });
                }
            }
        }
        
        stats.health -= amount;
        
        // Visual indicator of damage amount
        if (amount > 0) {
            const damageText = this.add.text(
                target.x + (Math.random() * 20 - 10), 
                target.y - 10, 
                `-${Math.round(amount)}`, 
                {
                    fontSize: target === this.gorilla ? '16px' : '12px',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2
                }
            );
            damageText.setOrigin(0.5);
            
            this.tweens.add({
                targets: damageText,
                y: damageText.y - 20,
                alpha: 0,
                duration: 800,
                onComplete: () => damageText.destroy()
            });
        }
        
        target.setTint(0xff0000); 
        this.time.delayedCall(100, () => {
            if(target.active) target.clearTint();
        });

        if (target === this.gorilla) {
            // If gorilla health changed, update the UI immediately
            if (oldHealth !== stats.health) {
                this.emitStateUpdate(true);
            }
            
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
                
                // If a man died, decrement the count and update UI if needed
                this.currentMenCount--;
                if (this.currentMenCount % 5 === 0 || this.currentMenCount <= 20) {
                    // Update UI more frequently when few men are left or at regular intervals
                    this.emitStateUpdate(true);
                }
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

    // Method to emit current game state with optimizations
    emitStateUpdate(forceUpdate: boolean = false) {
        if (this.gameOver) return;

        const gorillaStats = this.gorilla?.getData('stats') as CharacterStats | undefined;
        const currentHealth = gorillaStats?.health ?? 0;
        this.currentMenCount = this.menGroup?.countActive(true) ?? 0;
        
        // Only update if values have changed or force update is true
        if (forceUpdate || 
            this.currentMenCount !== this.lastReportedMenCount || 
            currentHealth !== this.lastReportedGorillaHealth) {
            
            const state = {
                gorillaHealth: currentHealth,
                gorillaMaxHealth: gorillaStats?.maxHealth ?? GORILLA_STATS_ADJUSTED.maxHealth,
                menLeft: this.currentMenCount,
                fps: Math.round(this.game.loop.actualFps)
            };
            
            this.game.events.emit('stateUpdate', state);
            
            // Update cached values
            this.lastReportedMenCount = this.currentMenCount;
            this.lastReportedGorillaHealth = currentHealth;
        }
    }

    // Find men within attack range using quadtree for efficiency
    findMenInRange(x: number, y: number, range: number): Phaser.Physics.Arcade.Sprite[] {
        if (!this.quadtree) return [];
        return this.quadtree.queryRadius(x, y, range);
    }

    // Apply flocking behavior to a man
    applyFlockingBehavior(man: Phaser.Physics.Arcade.Sprite, neighbors: Phaser.Physics.Arcade.Sprite[]) {
        if (!this.gorilla?.active || !man.active) return;
        
        const manBody = man.body as Phaser.Physics.Arcade.Body;
        const manStats = man.getData('stats') as CharacterStats;
        if (!manBody || !manStats) return;
        
        // Get current velocity
        const velocity = new Phaser.Math.Vector2(manBody.velocity.x, manBody.velocity.y);
        
        // If the man is already at max speed, don't apply more force
        if (velocity.length() >= this.flockingParams.maxSpeed) return;
        
        // Get separation force (avoid crowding)
        const separation = this.getSeparationForce(man, neighbors);
        separation.scale(this.flockingParams.separationWeight);
        
        // Get cohesion force (stay with the group)
        const cohesion = this.getCohesionForce(man, neighbors);
        cohesion.scale(this.flockingParams.cohesionWeight);
        
        // Get alignment force (follow group direction)
        const alignment = this.getAlignmentForce(man, neighbors);
        alignment.scale(this.flockingParams.alignmentWeight);
        
        // Get target force (move toward gorilla)
        const target = this.getTargetForce(man);
        target.scale(this.flockingParams.targetWeight);
        
        // Apply combined forces
        const steeringForce = new Phaser.Math.Vector2();
        steeringForce.add(separation);
        steeringForce.add(cohesion);
        steeringForce.add(alignment);
        steeringForce.add(target);
        
        // Limit the force
        if (steeringForce.length() > this.flockingParams.maxForce) {
            steeringForce.normalize().scale(this.flockingParams.maxForce);
        }
        
        // Apply force to velocity
        velocity.add(steeringForce);
        
        // Limit velocity to max speed
        if (velocity.length() > manStats.speed) {
            velocity.normalize().scale(manStats.speed);
        }
        
        // Apply new velocity
        manBody.setVelocity(velocity.x, velocity.y);
    }
    
    getSeparationForce(man: Phaser.Physics.Arcade.Sprite, neighbors: Phaser.Physics.Arcade.Sprite[]): Phaser.Math.Vector2 {
        const steer = new Phaser.Math.Vector2(0, 0);
        let count = 0;
        
        // For each neighbor, check if it's too close
        for (const neighbor of neighbors) {
            if (neighbor === man || !neighbor.active) continue;
            
            const distance = Phaser.Math.Distance.Between(
                man.x, man.y, neighbor.x, neighbor.y
            );
            
            // If the neighbor is within separation distance
            if (distance > 0 && distance < 40) {
                // Get direction away from neighbor
                const diff = new Phaser.Math.Vector2(
                    man.x - neighbor.x,
                    man.y - neighbor.y
                );
                
                // Weight by distance (closer = stronger)
                diff.normalize().scale(1.0 / distance);
                
                // Add to steering force
                steer.add(diff);
                count++;
            }
        }
        
        // Average
        if (count > 0) {
            steer.scale(1.0 / count);
        }
        
        // If the steering force is significant
        if (steer.length() > 0) {
            // Scale to max speed
            steer.normalize().scale(this.flockingParams.maxSpeed);
            
            // Reynolds steering formula: steering = desired - velocity
            const manBody = man.body as Phaser.Physics.Arcade.Body;
            steer.subtract(new Phaser.Math.Vector2(manBody.velocity.x, manBody.velocity.y));
            
            // Limit to max force
            if (steer.length() > this.flockingParams.maxForce) {
                steer.normalize().scale(this.flockingParams.maxForce);
            }
        }
        
        return steer;
    }
    
    getCohesionForce(man: Phaser.Physics.Arcade.Sprite, neighbors: Phaser.Physics.Arcade.Sprite[]): Phaser.Math.Vector2 {
        const sum = new Phaser.Math.Vector2(0, 0);
        let count = 0;
        
        // For each neighbor, add its position
        for (const neighbor of neighbors) {
            if (neighbor === man || !neighbor.active) continue;
            
            const distance = Phaser.Math.Distance.Between(
                man.x, man.y, neighbor.x, neighbor.y
            );
            
            // If the neighbor is within cohesion distance
            if (distance > 0 && distance < this.flockingParams.neighborRadius) {
                sum.add(new Phaser.Math.Vector2(neighbor.x, neighbor.y));
                count++;
            }
        }
        
        // If there are neighbors
        if (count > 0) {
            // Calculate average position (center of mass)
            sum.scale(1.0 / count);
            
            // Get direction to center of mass
            return this.seek(man, sum);
        }
        
        return new Phaser.Math.Vector2(0, 0);
    }
    
    getAlignmentForce(man: Phaser.Physics.Arcade.Sprite, neighbors: Phaser.Physics.Arcade.Sprite[]): Phaser.Math.Vector2 {
        const sum = new Phaser.Math.Vector2(0, 0);
        let count = 0;
        
        // For each neighbor, add its velocity
        for (const neighbor of neighbors) {
            if (neighbor === man || !neighbor.active) continue;
            
            const distance = Phaser.Math.Distance.Between(
                man.x, man.y, neighbor.x, neighbor.y
            );
            
            // If the neighbor is within alignment distance
            if (distance > 0 && distance < this.flockingParams.neighborRadius) {
                const neighborBody = neighbor.body as Phaser.Physics.Arcade.Body;
                if (neighborBody) {
                    sum.add(new Phaser.Math.Vector2(neighborBody.velocity.x, neighborBody.velocity.y));
                    count++;
                }
            }
        }
        
        // If there are neighbors
        if (count > 0) {
            // Calculate average velocity
            sum.scale(1.0 / count);
            
            // Scale to max speed
            sum.normalize().scale(this.flockingParams.maxSpeed);
            
            // Reynolds steering formula: steering = desired - velocity
            const manBody = man.body as Phaser.Physics.Arcade.Body;
            sum.subtract(new Phaser.Math.Vector2(manBody.velocity.x, manBody.velocity.y));
            
            // Limit to max force
            if (sum.length() > this.flockingParams.maxForce) {
                sum.normalize().scale(this.flockingParams.maxForce);
            }
        }
        
        return sum;
    }
    
    getTargetForce(man: Phaser.Physics.Arcade.Sprite): Phaser.Math.Vector2 {
        if (!this.gorilla?.active) return new Phaser.Math.Vector2(0, 0);
        
        // Seek the gorilla
        return this.seek(man, new Phaser.Math.Vector2(this.gorilla.x, this.gorilla.y));
    }
    
    seek(man: Phaser.Physics.Arcade.Sprite, target: Phaser.Math.Vector2): Phaser.Math.Vector2 {
        const manBody = man.body as Phaser.Physics.Arcade.Body;
        const manStats = man.getData('stats') as CharacterStats;
        
        // Get direction to target
        const desired = new Phaser.Math.Vector2(
            target.x - man.x,
            target.y - man.y
        );
        
        // If direction exists
        if (desired.length() > 0) {
            // Scale to max speed
            desired.normalize().scale(manStats.speed);
            
            // Reynolds steering formula: steering = desired - velocity
            const steering = desired.clone().subtract(new Phaser.Math.Vector2(manBody.velocity.x, manBody.velocity.y));
            
            // Limit to max force
            if (steering.length() > this.flockingParams.maxForce) {
                steering.normalize().scale(this.flockingParams.maxForce);
            }
            
            return steering;
        }
        
        return new Phaser.Math.Vector2(0, 0);
    }

    // Check if a gorilla ability is ready to use
    isAbilityReady(ability: GorillaAbility, currentTime: number): boolean {
        const abilityInfo = this.gorillaAbilities.get(ability);
        if (!abilityInfo) return false;
        
        return currentTime - abilityInfo.lastUsed >= abilityInfo.cooldown;
    }
    
    // Use a gorilla ability
    useGorillaAbility(ability: GorillaAbility, currentTime: number) {
        if (!this.gorilla || !this.gorilla.active) return;
        
        const abilityInfo = this.gorillaAbilities.get(ability);
        if (!abilityInfo || !this.isAbilityReady(ability, currentTime)) return;
        
        // Mark ability as used and active if it has duration
        abilityInfo.lastUsed = currentTime;
        if (abilityInfo.duration > 0) {
            abilityInfo.isActive = true;
            
            // Schedule deactivation
            this.time.delayedCall(abilityInfo.duration, () => {
                if (abilityInfo) {
                    abilityInfo.isActive = false;
                    
                    // Visual cue when ability ends
                    if (this.gorilla?.active) {
                        this.gorilla.setTint(0xffffff);
                        this.time.delayedCall(200, () => {
                            if (this.gorilla?.active) this.gorilla.clearTint();
                        });
                    }
                    
                    console.log(`${abilityInfo.name} ended`);
                }
            });
        }
        
        // Perform ability-specific actions
        switch (ability) {
            case GorillaAbility.GROUND_SLAM:
                this.performGroundSlam(abilityInfo);
                break;
            case GorillaAbility.RAGE_MODE:
                this.performRageMode(abilityInfo);
                break;
            case GorillaAbility.INTIMIDATE:
                this.performIntimidate(abilityInfo);
                break;
        }
        
        // Set time until next ability can be used
        this.nextAbilityTime = currentTime + this.abilityMinInterval;
        
        console.log(`Gorilla used ${abilityInfo.name}`);
    }
    
    // Ground Slam ability implementation - further reduced damage
    performGroundSlam(abilityInfo: GorillaAbilityInfo) {
        if (!this.gorilla || !this.menGroup) return;
        
        // Visual effect: circle expanding from gorilla
        const circle = this.add.circle(
            this.gorilla.x, 
            this.gorilla.y, 
            GORILLA_ATTACK_RANGE * 1.8,
            0xff0000, 
            0.3
        );
        
        // Animation for the circle
        this.tweens.add({
            targets: circle,
            scale: 1.5,
            alpha: 0,
            duration: 500,
            onComplete: () => circle.destroy()
        });
        
        // Camera shake effect
        this.cameras.main.shake(300, 0.01);
        
        // Find men in a radius (reduced)
        const slamRadius = GORILLA_ATTACK_RANGE * 1.8;
        let menInRange: Phaser.Physics.Arcade.Sprite[] = [];
        
        if (this.quadtree) {
            menInRange = this.quadtree.queryRadius(this.gorilla.x, this.gorilla.y, slamRadius);
        } else {
            // Fallback if quadtree not available
            this.menGroup.children.iterate((sprite) => {
                const man = sprite as Phaser.Physics.Arcade.Sprite;
                if (!man.active) return true;
                
                const distance = Phaser.Math.Distance.Between(
                    this.gorilla!.x, this.gorilla!.y, man.x, man.y
                );
                
                if (distance <= slamRadius) {
                    menInRange.push(man);
                }
                
                return true;
            });
        }
        
        // Apply damage and knockback to men in range
        const gorillaStats = this.gorilla.getData('stats') as CharacterStats;
        if (!gorillaStats) return;
        
        let menHit = 0;
        menInRange.forEach(man => {
            if (!man.active) return;
            
            // Further reduced damage for ground slam
            const slamDamage = gorillaStats.damage * 1.15; // Reduced from 1.25
            
            // Small men can partially resist ground slam
            const manType = man.getData('type') as ManType;
            if (manType === ManType.SMALL) {
                // Small men take less damage from ground slam
                this.takeDamage(man, slamDamage * 0.85); // 15% less damage for small men
            } else {
                this.takeDamage(man, slamDamage);
            }
            
            // Reduced knockback effect
            const pushDirection = new Phaser.Math.Vector2(
                man.x - this.gorilla!.x, 
                man.y - this.gorilla!.y
            ).normalize();
            
            const pushForce = 250;
            const manBody = man.body as Phaser.Physics.Arcade.Body;
            if (manBody) {
                manBody.setVelocity(pushDirection.x * pushForce, pushDirection.y * pushForce);
                man.setData('isRecovering', true);
                
                // Small men recover faster from knockback
                if (manType === ManType.SMALL) {
                    man.setData('recoveryEndTime', this.time.now + 300); // Quicker recovery for small men
                } else {
                    man.setData('recoveryEndTime', this.time.now + 400);
                }
            }
            
            menHit++;
        });
        
        console.log(`Ground Slam hit ${menHit} men`);
    }
    
    // Rage Mode ability implementation
    performRageMode(abilityInfo: GorillaAbilityInfo) {
        if (!this.gorilla) return;
        
        // Visual effect: gorilla turns red
        this.gorilla.setTint(0xff0000);
        
        // Temporary stat boost
        const gorillaStats = this.gorilla.getData('stats') as CharacterStats;
        if (!gorillaStats) return;
        
        const originalDamage = gorillaStats.damage;
        const originalSpeed = gorillaStats.speed;
        
        // Increase damage and speed
        gorillaStats.damage *= abilityInfo.effectMultiplier;
        gorillaStats.speed *= abilityInfo.effectMultiplier;
        
        // Create pulsing effect
        const pulseEffect = this.tweens.add({
            targets: this.gorilla,
            alpha: 0.8,
            duration: 300,
            yoyo: true,
            repeat: -1
        });
        
        // Restore original stats when ability ends
        this.time.delayedCall(abilityInfo.duration, () => {
            if (!this.gorilla?.active) return;
            
            const currentStats = this.gorilla.getData('stats') as CharacterStats;
            if (currentStats) {
                currentStats.damage = originalDamage;
                currentStats.speed = originalSpeed;
            }
            
            pulseEffect.stop();
            this.gorilla.setAlpha(1);
        });
    }
    
    // Intimidate ability implementation
    performIntimidate(abilityInfo: GorillaAbilityInfo) {
        if (!this.gorilla || !this.menGroup) return;
        
        // Visual effect: shock wave
        const shockwave = this.add.circle(
            this.gorilla.x, 
            this.gorilla.y, 
            20, 
            0xffff00, 
            0.5
        );
        
        // Animation for the shockwave
        this.tweens.add({
            targets: shockwave,
            scale: 10,
            alpha: 0,
            duration: 800,
            onComplete: () => shockwave.destroy()
        });
        
        // Find men in range
        const intimidateRadius = GORILLA_ATTACK_RANGE * 3;
        let menInRange: Phaser.Physics.Arcade.Sprite[] = [];
        
        if (this.quadtree) {
            menInRange = this.quadtree.queryRadius(this.gorilla.x, this.gorilla.y, intimidateRadius);
        } else {
            // Fallback if quadtree not available
            this.menGroup.children.iterate((sprite) => {
                const man = sprite as Phaser.Physics.Arcade.Sprite;
                if (!man.active) return true;
                
                const distance = Phaser.Math.Distance.Between(
                    this.gorilla!.x, this.gorilla!.y, man.x, man.y
                );
                
                if (distance <= intimidateRadius) {
                    menInRange.push(man);
                }
                
                return true;
            });
        }
        
        // Stun men in range
        let menStunned = 0;
        menInRange.forEach(man => {
            if (!man.active) return;
            
            // Stun effect
            man.setTint(0xffff00);
            man.setData('isStunned', true);
            man.setData('stunEndTime', this.time.now + abilityInfo.duration);
            
            // Stop movement
            const manBody = man.body as Phaser.Physics.Arcade.Body;
            if (manBody) {
                manBody.setVelocity(0, 0);
            }
            
            menStunned++;
        });
        
        // Remove stun effect after duration
        this.time.delayedCall(abilityInfo.duration, () => {
            menInRange.forEach(man => {
                if (!man.active) return;
                
                man.clearTint();
                man.setData('isStunned', false);
            });
        });
        
        console.log(`Intimidate stunned ${menStunned} men`);
    }

    update(time: number, delta: number) {
        if (this.gameOver || !this.gorilla || !this.menGroup) return;

        // Update quadtree with current positions
        if (this.quadtree) {
            this.quadtree.clear();
            this.menGroup.children.iterate((sprite) => {
                const man = sprite as Phaser.Physics.Arcade.Sprite;
                if (man.active) {
                    this.quadtree!.insert(man);
                }
                return true;
            });
        }

        // Check if it's time to spawn a power-up
        if (time > this.nextPowerUpTime) {
            this.spawnPowerUp();
            this.nextPowerUpTime = time + this.powerUpSpawnInterval;
        }

        // --- Gorilla Logic ---
        if (this.gorilla.active) {
            const gorillaStats = this.gorilla.getData('stats') as CharacterStats;
            const nextAttackTime = this.gorilla.getData('nextAttackTime') as number;
            let closestMan: Phaser.Physics.Arcade.Sprite | null = null;
            let minDistanceSq = Infinity;
            let canAttack = time > nextAttackTime; // Check if gorilla can attack now

            // Efficiently find men in range using quadtree
            const menInRange = this.findMenInRange(this.gorilla.x, this.gorilla.y, GORILLA_ATTACK_RANGE);
            
            // Track alive count while finding closest man
            let aliveCount = 0;
            
            this.menGroup.children.iterate((manSprite) => {
                const man = manSprite as Phaser.Physics.Arcade.Sprite;
                if (!man.active) return true; 
                
                aliveCount++;
                const distanceSq = Phaser.Math.Distance.Squared(this.gorilla!.x, this.gorilla!.y, man.x, man.y);
                if (distanceSq < minDistanceSq) {
                    minDistanceSq = distanceSq;
                    closestMan = man;
                }
                return true;
            });
            
            // Update men count if changed to avoid redundant countActive() calls
            if (aliveCount !== this.currentMenCount) {
                this.currentMenCount = aliveCount;
            }

            // Check if it's time to use a special ability (reduced probability)
            if (time > this.nextAbilityTime && this.currentMenCount > 0) {
                // Chance to use abilities increases as health decreases (but lower overall)
                const healthPercent = gorillaStats.health / gorillaStats.maxHealth;
                const useAbilityChance = 0.05 + (1 - healthPercent) * 0.25; // 5% to 30% chance (reduced)
                
                if (Math.random() < useAbilityChance) {
                    // Choose which ability to use based on situation
                    if (this.isAbilityReady(GorillaAbility.GROUND_SLAM, time) && menInRange.length >= 5) {
                        // Use ground slam when many men are in range
                        this.useGorillaAbility(GorillaAbility.GROUND_SLAM, time);
                    } 
                    else if (this.isAbilityReady(GorillaAbility.RAGE_MODE, time) && gorillaStats.health < gorillaStats.maxHealth * 0.4) {
                        // Use rage mode when health is low
                        this.useGorillaAbility(GorillaAbility.RAGE_MODE, time);
                    }
                    else if (this.isAbilityReady(GorillaAbility.INTIMIDATE, time) && this.currentMenCount > this.gameConfig.superMenCount / 2) {
                        // Use intimidate when there are still many men
                        this.useGorillaAbility(GorillaAbility.INTIMIDATE, time);
                    }
                }
            }

            // Gorilla Attack AI (Area Attack - Prioritized)
            if (canAttack && menInRange.length > 0) {
                (this.gorilla.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0); // Stop moving to attack
                
                // Batch process men attack to avoid unnecessary UI updates
                const attackedMenCount = menInRange.length;
                let menKilled = 0;
                
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

                    // Check if the man died from this attack
                    const manStats = man.getData('stats') as CharacterStats;
                    if (manStats && manStats.health <= 0) {
                        menKilled++;
                    }
                });
                
                // Log only on significant attacks
                if (attackedMenCount > 5) {
                    console.log(`Gorilla attacks ${attackedMenCount} men, killed ${menKilled}!`);
                }
                
                // Add a longer cooldown when there are many men nearby to give them a chance
                const baseCooldown = GORILLA_BASE_COOLDOWN + (menInRange.length > 10 ? 300 : 0);
                const cooldown = baseCooldown + Phaser.Math.Between(-GORILLA_COOLDOWN_VARIANCE, GORILLA_COOLDOWN_VARIANCE);
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
        let menAttackedThisFrame = 0;
        
        // For efficient flocking, rebuild the flocking map
        this.flockingMap.clear();
        
        if (this.enableFlocking && this.quadtree) {
            // Pre-calculate neighbors for each man
            this.menGroup.children.iterate((sprite) => {
                const man = sprite as Phaser.Physics.Arcade.Sprite;
                if (!man.active) return true;
                
                // Use quadtree to efficiently find neighbors
                const neighbors = this.quadtree?.queryRadius(
                    man.x, man.y, this.flockingParams.neighborRadius
                ) || [];
                
                this.flockingMap.set(man, { neighbors });
                return true;
            });
            
            // Increase engagement for men when gorilla is damaged
            if (this.gorilla?.active) {
                const gorillaStats = this.gorilla.getData('stats') as CharacterStats;
                const gorillaHealthPercent = gorillaStats ? gorillaStats.health / gorillaStats.maxHealth : 1;
                
                // As gorilla gets weaker, men become more aggressive
                const aggressionBoost = 1 + (1 - gorillaHealthPercent) * 0.3; // Up to 30% boost
                
                // Apply boost to all men
                if (gorillaHealthPercent < 0.7) { // Only when gorilla below 70% health
                    this.menGroup.children.iterate((manSprite) => {
                        const man = manSprite as Phaser.Physics.Arcade.Sprite;
                        if (!man.active) return true;
                        
                        const manStats = man.getData('stats') as CharacterStats;
                        if (manStats && !man.getData('boosted')) {
                            // Apply boost based on gorilla's remaining health
                            manStats.damage *= aggressionBoost;
                            man.setData('boosted', true);
                            
                            // Visual indication of boost
                            if (Math.random() < 0.2) { // Only show for some men to avoid clutter
                                man.setTint(0x00ffff);
                                this.time.delayedCall(300, () => {
                                    if (man.active) man.clearTint();
                                });
                            }
                        }
                        
                        return true;
                    });
                }
            }
        }
        
        // Process men movement and attacks
        this.menGroup.children.iterate((manSprite) => {
            const man = manSprite as Phaser.Physics.Arcade.Sprite;
            if (!man.active || !this.gorilla?.active) return true;

            const manStats = man.getData('stats') as CharacterStats;
            const manType = man.getData('type') as ManType;
            const nextAttackTime = man.getData('nextAttackTime') as number;
            const manBody = man.body as Phaser.Physics.Arcade.Body;
            const gorillaBody = this.gorilla.body as Phaser.Physics.Arcade.Body;
            let isRecovering = man.getData('isRecovering') || false;
            let recoveryEndTime = man.getData('recoveryEndTime') || 0;
            let isStunned = man.getData('isStunned') || false;
            let stunEndTime = man.getData('stunEndTime') || 0;

            // Check if recovery period ended
            if (isRecovering && time > recoveryEndTime) {
                man.setData('isRecovering', false);
                isRecovering = false;
            }
            
            // Check if stun ended
            if (isStunned && time > stunEndTime) {
                man.setData('isStunned', false);
                isStunned = false;
            }

            // Movement and Attack Logic (only if not recovering or stunned)
            if (!isRecovering && !isStunned) {
                // Attack AI (Check before moving)
                if (time > nextAttackTime) {
                    // Smaller attack range for small men but they attack faster
                    let attackRange = MAN_ATTACK_RANGE;
                    let cooldownMultiplier = 1.0;
                    
                    if (manType === ManType.SMALL) {
                        // Small men attack 20% faster
                        cooldownMultiplier = 0.8;
                    }
                    
                    const distanceToGorillaSq = Phaser.Math.Distance.Squared(manBody.center.x, manBody.center.y, gorillaBody.center.x, gorillaBody.center.y);
                    if (distanceToGorillaSq < attackRange * attackRange) {
                        manBody.setVelocity(0, 0); // Stop moving to attack
                        this.takeDamage(this.gorilla, manStats.damage);
                        menAttackedThisFrame++;
                        
                        const cooldown = (MAN_BASE_COOLDOWN * cooldownMultiplier) + 
                                        Phaser.Math.Between(-MAN_COOLDOWN_VARIANCE, MAN_COOLDOWN_VARIANCE);
                        man.setData('nextAttackTime', time + Math.max(50, cooldown));
                        
                        // Tint based on man type
                        const tintColor = manType === ManType.SMALL ? 0x00ffff : 0x0000ff;
                        man.setTint(tintColor);
                        this.time.delayedCall(50, () => {
                           if(man.active) man.clearTint();
                        });
                        return true; // Skip movement logic if attacked this frame
                    }
                }
                
                // Apply flocking behavior instead of direct movement
                if (this.enableFlocking && this.flockingMap.has(man)) {
                    const flockData = this.flockingMap.get(man);
                    if (flockData) {
                        this.applyFlockingBehavior(man, flockData.neighbors);
                    } else {
                        this.physics.moveToObject(man, this.gorilla, manStats.speed);
                    }
                } else {
                    this.physics.moveToObject(man, this.gorilla, manStats.speed);
                }
            } else if (isStunned) {
                // Make stunned men shudder a bit
                manBody.setVelocity(
                    Math.random() * 10 - 5,
                    Math.random() * 10 - 5
                );
            }
            
            return true;
        });

        // --- Check Win/Loss Conditions ---
        if (this.currentMenCount === 0 && !this.gameOver) {
            console.log("All Men Defeated!");
            this.endGame("GORILLA WINS");
        }
        
        // Update UI state on a time-based interval
        if (time - this.lastStateUpdateTime >= this.stateUpdateInterval) {
            this.emitStateUpdate();
            this.lastStateUpdateTime = time;
        }
    }
} 