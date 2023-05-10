import * as Dat from 'dat.gui';
import { Scene, Color, Vector3 } from 'three';
import { Land, Player } from 'objects';
import { Skyscraper, BuildingI } from 'objects';
import { BasicLights } from 'lights';
import * as CANNON from 'cannon-es'; // aliasing
import { Water } from 'objects' // water particles

// State machine states.
const GAMESTATE_INGAME = 1;
const GAMESTATE_PAUSED = 2;
const GAMESTATE_NOTINGAME = 3;

class GameScene extends Scene {
    constructor(camera, sharedState) {
        // Call parent Scene() constructor
        super();

        this.gameState = GAMESTATE_NOTINGAME; // the variable to control the state machine

        this.gameTimer = new GameTimer(this); // the game timer.

        this.bodyIDToString = []; // A table with physical body ID as the key and the obj name as the string

        // Init state
        this.state = {
            // GUI stuff
            gui: new Dat.GUI(), // Create GUI for scene
            volume: 1,

            // Game logic stuff
            updateList: [],
            world: new CANNON.World( { // Add a new Cannon.js world (for the physics engine calculation). Can use set function to change parameters at run time.
                gravity: new CANNON.Vec3(0, -9.81, 0), // gravity is set in the Y directionly only right now. // UNCOMMENT ME WHEN COLLISION IS READY
            } ), 
            keys: {}, // Add user keypress input
        };

        // Set the scene camera and app ref
        this.camera = camera;
        this.sharedState = sharedState;

        // Add buttons to GUI
        this.guiControls = {
            startGame: () => {
                this.startGameplay(); // can also be used to initialize game scene
            },
            pauseGame: () => {
                this.pauseResumeGameplay(); // pauses/resumes the game session
            },
        };
        
        // Populate GUI
        this.startGameButton = this.state.gui.add(this.guiControls, "startGame").name("Start Game");
        this.pauseResumeButton = this.state.gui.add(this.guiControls, "pauseGame").name("Pause Game");
        this.state.gui.add(this.state, 'volume', 0, 1);

        // Add event listeners for keydown and keyup events (basically key press and key lift)
        window.addEventListener('keydown', (event) => this.handleKey(event, true));
        window.addEventListener('keyup', (event) => this.handleKey(event, false));

        // Initializes a scene; TODO: can work with level loading using an info param or smth.
        this.initializeTestingScene(); 

        // Load in the text elements. Variable should've been set in scene initialization
        this.sharedState.timerText.textContent = "Time Remaining: " + this.numSecondsToSurvive;
        this.sharedState.healthText.textContent = "Health: " + this.player.health;
        this.sharedState.gameMessage.textContent = ""; // in seconds
    }

    startGameplay() {
        if (this.gameState == GAMESTATE_NOTINGAME) { // start the session
            console.log("Game starts!");
            // game starts, can spawn waves and stuff. 
            // TODO
            this.gameTimer.startTimer();
            this.startGameButton.__li.firstElementChild.textContent = "DISABLED: pause game first";
            this.gameState = GAMESTATE_INGAME; // for now
        }
        // okay we COULD include  || this.gameState == GAMESTATE_INGAME for reloading too, but fatfinger syndrome is a thing so...
        else if (this.gameState == GAMESTATE_PAUSED) { // reloads the current level
            // Right now, this scene is gone, and a new copy takes over, so doesn't matter anymore.
            this.state.gui.destroy(); // destroy the current GUI
            this.sharedState.scene = new GameScene(this.camera, this.sharedState); // replace this scene itself with a new scene
            // TODO: can add a "level" parameter and other additional informations to pass onto the next copy.
            // Just need an initializer at the beginning of the constructor ;D
        }
    }

    pauseResumeGameplay() { // pauses all input processing and physics simulation. The world freezes.
        if (this.gameState == GAMESTATE_INGAME) { // pause the session
            console.log("Game paused!");
            this.gameState = GAMESTATE_PAUSED;
            this.gameTimer.pauseTimer();
            this.pauseResumeButton.__li.firstElementChild.textContent = "Resume Game";
            this.startGameButton.__li.firstElementChild.textContent = "Reload Game";
        }
        else if (this.gameState == GAMESTATE_PAUSED) { // resume the session
            console.log("Game resumes!");
            this.gameState = GAMESTATE_INGAME;
            this.pauseResumeButton.__li.firstElementChild.textContent = "Pause Game";
            this.startGameButton.__li.firstElementChild.textContent = "DISABLED: pause game first";
        }
    }

    stagePassed() { // the user survives the timer!
        this.sharedState.gameMessage.textContent = "You Survived!"; // in seconds
        this.pauseResumeGameplay(); // for now
    }

    stageFailed() { // the user ran out of health before timer ends.
        this.sharedState.gameMessage.textContent = "You Failed!"; // in seconds
        this.pauseResumeGameplay(); // for now
    }

    addToUpdateList(object) {
        this.state.updateList.push(object);
    }

    handleKey(event, isPressed) { // Checks key validity when a key press is triggered.
        const key = event.key.toUpperCase();
        const relevantKeys = ['A', 'D', 'W', 'S', ' ']; // Basic mechanics for now: left, right, forward, backward, jump
        if (relevantKeys.includes(key)) {
            this.state.keys[key] = isPressed; // updating the state of each relevant key (not pressed = false, pressed = true)
            event.preventDefault();
        }
    }

    update(timeStamp) {
        switch(this.gameState) { // state machine :D
            case GAMESTATE_INGAME:
                {
                    // Check timer
                    let timeRemaining = this.numSecondsToSurvive - this.gameTimer.timeElapsedInSeconds();
                    this.sharedState.timerText.textContent = "Time Remaining: " + Math.floor(timeRemaining); // in seconds
                    if (timeRemaining <= 0) this.stagePassed();
     
                    // Update physics world
                    this.state.world.step(1 / 60);

                    // Call update for each object in the updateList
                    const { updateList } = this.state;
                    for (const obj of updateList) {
                        if (obj.name === 'player') {
                            obj.update(this.camera);
                        } else {
                            obj.update(timeStamp);
                        }
                    }

                    // Check health
                    this.sharedState.healthText.textContent = "Health: " + this.player.health;
                    if (this.player.health <= 0) this.stageFailed();
                    // this.player.loseHealth(); // just for example.
                }
                break;

            case GAMESTATE_NOTINGAME:
                break;
            
            case GAMESTATE_PAUSED:
                break;
        }
    }

    // Contains the intializers for all the scenes. Do scene setups here.
    initializeTestingScene() { // this is a testing scene.
        // Set background to a nice color
        this.background = new Color(0x7ec0ee);
        
        // Set number of numbers player is expected to survive in this scene
        this.numSecondsToSurvive = 60; 

        // Create all the materials. // The material properties of the object: {how much object slides, how much object bounces on contact} 
        let characterMaterial = new CANNON.Material({ friction: 0.001, restitution: 0.3 }); 
        let landMaterial = new CANNON.Material({friction: 0.6, restitution: 0.2 }); 
        let skyscraperMaterial = new CANNON.Material({friction: 1, restitution: 0.1});

        // Create contact materials, i.e. a way to define the interaction properties between two materials when they come into contact. Same param.
        // const characterBuildingContactMaterial = new CANNON.ContactMaterial(characterMaterial, skyscraperMaterial, {friction: 0.5, restitution: 0.6});
        // this.state.world.addContactMaterial(characterBuildingContactMaterial);  // doesn't feel the effect for this one rn...
        // const waterFloorContactMaterial = new CANNON.ContactMaterial(landMaterial, waterMaterial, {friction: 0, restitution: 1});
        // this.state.world.addContactMaterial(waterFloorContactMaterial); 

        // creating particle system FIRST
        let numberOfParticles = 125, sizeOfParticle = 0.75, physicalOffset = 0.25;
        const startingPosition = new CANNON.Vec3(12, 1, 0);
        const waterMaterial = new CANNON.Material({friction: 0, restitution: 1});
        const water = new Water(
            this,               // passing in the parent class
            startingPosition,   // starting position of stream of water
            numberOfParticles,  // number of particles
            waterMaterial,      // the material to use for the water
            sizeOfParticle,     // the size of the particle
            physicalOffset      // the physical offset for the radius of the physical body
        ); // creating a new Water object to spawn water particles

        // Add meshes to scene (CONVENTION: use this.player = player after)
        const player = new Player(this, new CANNON.Vec3(6, 3, 6), characterMaterial); // the player; can specify its starting position
        this.player = player; // IMPORTANT: DON'T FORGET THIS LINE!!!!!!!!!!!!!!!!!
        const land = new Land(this, new CANNON.Vec3(0, 0, 0), landMaterial, // the floor; can specify its starting position
            {wallHeight: 5000, wallTurnOffIndexList: [], isVisible: true}, // wallTurnOffIndexList: walls usually go counter-clockwise around the shape
            {start: -1, end: 10}); // start and end Y value of the rising platform that simulates rising tide  
        const lights = new BasicLights(); // the lighting, can prob make more classes etc.
        
        // Sihoulette
        const buildingVisualization = new Skyscraper(this, false, new CANNON.Vec3(3, 1, 8), skyscraperMaterial,
             new Vector3(3, 4, 3)); // an example of size/loc visualization
        
        // const buildingVisualization2 = new Skyscraper(this, false, new CANNON.Vec3(8, 0, 8), skyscraperMaterial, new Vector3(2, 2, 2));
        // const buildingVisualization3 = new Skyscraper(this, false, new CANNON.Vec3(-2, 3, 6), skyscraperMaterial,
        //     new Vector3(2, 6, 2));
        // const buildingVisualization4 = new Skyscraper(this, false, new CANNON.Vec3(-7, 4, 5), skyscraperMaterial,
        //     new Vector3(3, 6, 3));
        // const buildingVisualization5 = new Skyscraper(this, false, new CANNON.Vec3(-9, 5, 1), skyscraperMaterial,
        //     new Vector3(2, 6, 2));
        // const buildingVisualization6 = new Skyscraper(this, false, new CANNON.Vec3(-9, 6, -2), skyscraperMaterial,
        //     new Vector3(2, 6, 2));
        // const buildingVisualization7 = new Skyscraper(this, false, new CANNON.Vec3(-7, 7, -4), skyscraperMaterial,
        //     new Vector3(4, 8, 4));
        // const buildingVisualization8 = new Skyscraper(this, false, new CANNON.Vec3(-1, 7, -6), skyscraperMaterial,
        //     new Vector3(4, 12, 4));
        // const buildingVisualization9 = new Skyscraper(this, false, new CANNON.Vec3(3, 8, -3), skyscraperMaterial,
        //     new Vector3(3, 15, 3));
        // const buildingVisualization10 = new Skyscraper(this, false, new CANNON.Vec3(2, 8, 1), skyscraperMaterial,
        //     new Vector3(2, 18, 2));
        // const buildingVisualization11 = new Skyscraper(this, false, new CANNON.Vec3(-2, 9, 0), skyscraperMaterial,
        //     new Vector3(3, 18, 3));

        const building1 = new BuildingI(this, true, new CANNON.Vec3(8, -0.05, 8), skyscraperMaterial, 1, 100); // an example of size/loc visualization

        this.add(land, player, lights, water, 
            building1);
    }
    // ...
}

class GameTimer { // a very simple class with game timer logic.
    constructor(scene) {
        this.milliSecondsAccumulated = 0;
        this.benchmarkTime = 0;
        this.scene = scene;
        this.wasPaused = false;
    }

    startTimer() {
        this.benchmarkTime = Date.now();
        this.scene.addToUpdateList(this); // the timer is now affected by scene pausing / unpausing
    }

    pauseTimer() { // logs the current milliseconds before pausing
        const timeNow = Date.now();
        this.milliSecondsAccumulated += timeNow - this.benchmarkTime;
        this.wasPaused = true;
    }

    update() { // this update is only executed if scene's update is not paused
        if (this.wasPaused) {
            this.benchmarkTime = Date.now();
            this.wasPaused = false;
        }
        else {
            const timeNow = Date.now();
            this.milliSecondsAccumulated += timeNow - this.benchmarkTime;
            this.benchmarkTime = timeNow;
        }
    }

    timeElapsedInSeconds() {
        return this.milliSecondsAccumulated / 1000;
    }
}

export default GameScene;
