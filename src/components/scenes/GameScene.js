import * as Dat from 'dat.gui';
import { Scene, Color } from 'three';
import { Land, Player } from 'objects';
import { Skyscraper } from 'objects';
import { BasicLights } from 'lights';
import * as CANNON from 'cannon-es'; // aliasing

// State machine states.
const GAMESTATE_INGAME = 1;
const GAMESTATE_PAUSED = 2;
const GAMESTATE_NOTINGAME = 3;

class GameScene extends Scene {
    constructor(camera, sharedState) {
        // Call parent Scene() constructor
        super();

        this.gameState = GAMESTATE_NOTINGAME; // the variable to control the state machine

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
    }

    startGameplay() {
        if (this.gameState == GAMESTATE_NOTINGAME) { // start the session
            console.log("Game starts!");
            // game starts, can spawn waves and stuff. 
            // TODO
            this.startGameButton.__li.firstElementChild.textContent = "Reload Game";
            this.gameState = GAMESTATE_INGAME; // for now
        }
        // okay we COULD include  || this.gameState == GAMESTATE_PAUSED for reloading too, but fatfinger syndrome is a thing so...
        else if (this.gameState == GAMESTATE_INGAME) { // reloads the current level
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
            this.pauseResumeButton.__li.firstElementChild.textContent = "Resume Game";
            this.startGameButton.__li.firstElementChild.textContent = "DISABLED: resume game first";
        }
        else if (this.gameState == GAMESTATE_PAUSED) { // resume the session
            console.log("Game resumes!");
            this.gameState = GAMESTATE_INGAME;
            this.pauseResumeButton.__li.firstElementChild.textContent = "Pause Game";
            this.startGameButton.__li.firstElementChild.textContent = "Reload Game";
        }
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
                    const { updateList } = this.state;

                    // Call update for each object in the updateList
                    for (const obj of updateList) {
                        if (obj.name === 'player') {
                            obj.update(this.camera);
                        } else {
                            obj.update(timeStamp);
                        }
                    }
            
                    // Update physics world
                    this.state.world.step(1 / 60);
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

        // Add meshes to scene
        const land = new Land(this, new CANNON.Vec3(0, 0, 0)); // the floor; can specify its starting position
        const player = new Player(this, new CANNON.Vec3(5, 1, 5)); // the player; can specify its starting position
        const lights = new BasicLights(); // the lighting, can prob make more classes etc.
        const simpleBuilding = new Skyscraper(this, true, new CANNON.Vec3(0, 10, 0)); // an example of actual building
        const buildingVisualization = new Skyscraper(this, false, new CANNON.Vec3(-5, 10, -5)); // an example of size/loc visualization
        // this.currentSceneObjects = [simpleBuilding, land, player, lights, buildingVisualization];
        this.add(simpleBuilding, land, player, lights, buildingVisualization);
    }
    // ...

}

export default GameScene;
