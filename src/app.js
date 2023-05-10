/**
 * app.js
 *
 * This is the first file loaded. It sets up the Renderer,
 * Scene and Camera. It also starts the render loop and
 * handles window resizes.
 *
 */
import { WebGLRenderer, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GameScene } from 'scenes';

// Initialize core ThreeJS components
const camera = new PerspectiveCamera();
const renderer = new WebGLRenderer({ antialias: true });


// Some html texts for gameState. TODO: potential visual upgrade?
const timerText = createTextElement("Time Remaining: ", { top: '20px', left: '20px' }, 1000);
const healthText = createTextElement("Health: ", { top: '40px', left: '20px' }, 1000);
const gameMessage = createTextElement("", {}, 1000, true);

// Create a shared state object to pass around (communicates between this and the scene objs created)
const sharedState = {timerText, healthText, gameMessage};
// Assign the scene property after sharedState has been created
sharedState.scene = new GameScene(camera, sharedState);
// TODO: add additional info parameters.


// Set up camera
camera.position.set(6, 3, -10);
camera.lookAt(new Vector3(0, 0, 0));

// Set up renderer, canvas, and minor CSS adjustments
renderer.setPixelRatio(window.devicePixelRatio);
const canvas = renderer.domElement;
canvas.style.display = 'block'; // Removes padding below canvas
document.body.style.margin = 0; // Removes margin around page
document.body.style.overflow = 'hidden'; // Fix scrolling
document.body.appendChild(canvas);

// Set up controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 30;
controls.update();

// Render loop
const onAnimationFrameHandler = (timeStamp) => {
    const scene = sharedState.scene;
    controls.update();
    renderer.render(scene, camera);
    scene.update && scene.update(timeStamp);
    window.requestAnimationFrame(onAnimationFrameHandler);
};
window.requestAnimationFrame(onAnimationFrameHandler);

// Resize Handler
const windowResizeHandler = () => {
    const { innerHeight, innerWidth } = window;
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
};
windowResizeHandler();
window.addEventListener('resize', windowResizeHandler, false);

// A helper function that adds a text to the top left of the page, specified with some parameter. HTML style.
function createTextElement(textContent, position, zIndex, center = false) {
    const textElement = document.createElement('div');
    textElement.textContent = textContent;
    textElement.style.position = 'fixed';
    textElement.style.zIndex = zIndex || '999'; // Make sure the text element is on top of other elements
  
    if (center) {
      textElement.style.top = '50%';
      textElement.style.left = '50%';
      textElement.style.transform = 'translate(-50%, -50%)';
    } else {
      textElement.style.top = position.top || '10px';
      textElement.style.left = position.left || '10px';
    }
  
    document.body.appendChild(textElement);
    return textElement;
  }