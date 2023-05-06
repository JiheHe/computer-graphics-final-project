import * as Dat from 'dat.gui';
import { Scene, Color } from 'three';
import { Land, Player } from 'objects';
import { Skyscraper } from 'objects';
import { BasicLights } from 'lights';
import * as CANNON from 'cannon-es'; // aliasing

class SeedScene extends Scene {
    constructor(camera) {
        // Call parent Scene() constructor
        super();

        // Init state
        this.state = {
            gui: new Dat.GUI(), // Create GUI for scene
            rotationSpeed: 1,
            updateList: [],
            world: new CANNON.World( { // Add a new Cannon.js world (for the physics engine calculation). Can use set function to change parameters at run time.
                gravity: new CANNON.Vec3(0, -9.81, 0), // gravity is set in the Y directionly only right now. // UNCOMMENT ME WHEN COLLISION IS READY
            } ), 
            keys: {}, // Add user keypress input
        };

        // Set the scene camera
        this.camera = camera;

        // Set background to a nice color
        this.background = new Color(0x7ec0ee);

        // Add meshes to scene
        const land = new Land(this);
        const player = new Player(this);
        const lights = new BasicLights();
        const simpleBuilding = new Skyscraper(this, true, new CANNON.Vec3(0, 10, 0));
        this.add(simpleBuilding, land, player, lights);

        // Populate GUI
        this.state.gui.add(this.state, 'rotationSpeed', -5, 5);

        // Add event listeners for keydown and keyup events (basically key press and key lift)
        window.addEventListener('keydown', (event) => this.handleKey(event, true));
        window.addEventListener('keyup', (event) => this.handleKey(event, false));
    }

    addToUpdateList(object) {
        this.state.updateList.push(object);
    }

    update(timeStamp) {
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

    handleKey(event, isPressed) { // Checks key validity when a key press is triggered.
        const key = event.key.toUpperCase();
        const relevantKeys = ['A', 'D', 'W', 'S', ' ']; // Basic mechanics for now: left, right, forward, backward, jump
        if (relevantKeys.includes(key)) {
            this.state.keys[key] = isPressed; // updating the state of each relevant key (not pressed = false, pressed = true)
            event.preventDefault();
        }
    }
}

export default SeedScene;
