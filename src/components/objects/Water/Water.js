import * as THREE from 'three'
import * as CANNON from 'cannon-es';
import { Group } from 'three'
import { MarchingCubes } from './MarchingCubes.js';


// parameters for the Smoothed-Particle Hydrodynamics (SPH) simulation
function SmoothedParticleHydrodynamics(particles, h, restDensity, viscosity) {
    // iterating through each of the particles
    for (let i = 0; i < particles.length; i++) {
        const particle = particles[i] // getting the current particle

        // IMPROVEMENT : use k-nearest neighbors to make this algorithm O(nm)
        let density = 0;
        for (let j = 0; j < particles.length; j++) {
            const otherParticle = particles[j]

            // skip self-interaction
            if (otherParticle === particle) continue;

            // calculate the distance between the particles
            const distance = particle.position.distanceTo(otherParticle.position);

            // calculate the density contribution of the other particle
            const mass = restDensity * Math.pow(h, 3)
            const kernel = 315 / (64 * Math.PI * Math.pow(h, 9));
            density += mass * kernel * Math.pow(h*h - distance*distance, 3);
        }

        // calculate the pressure of the particle
        const k = 1.0;
        const pressure = k * (density - restDensity);

        // calculate the acceleration of the particle
        let acceleration = new THREE.Vector3();
        for (let j = 0; j < particles.length; j++) {
            const otherParticle = particles[j];

            // skip self-interaction
            if (otherParticle === particle) continue;

            // calculate the distance and velocity difference between the particles
            const distance = particle.position.distanceTo(otherParticle.position);
            const velocityDiff = otherParticle.velocity.clone().vsub(particle.velocity);

            // calculate the pressure and viscosity contributions to the acceleration
            const mass = restDensity * Math.pow(h, 3);
            const kernel1 = 45 / (Math.PI * Math.pow(h, 6));
            const kernel2 = 45 * viscosity / (Math.PI * Math.pow(h, 3));
            const pressureAccel = -mass * (pressure + otherParticle.pressure) / (2 * otherParticle.density) * kernel1 * (h - distance);
            const viscosityAccel = mass * velocityDiff / otherParticle.density * kernel2;
            acceleration.add(pressureAccel).add(viscosityAccel);
        }

        particle.velocity.vadd(acceleration)
        particle.position.vadd(particle.velocity)
    }
}

// O(n^2) algorithm for now, but we can improve later using something like this
function getNearestNeighbors(particle, particles, searchRadius) {
    // an array to hold the neighbors
    const neighbors = [];

    // loop through all objects in the scene and calculate distances
    for (let i = 0; i < particles.length; i++) {
        const otherObject = particles[i].particle;

        // ignore the object we are searching for
        if (otherObject === particle) continue;

        // calculate the distance between the object and the other object
        const distance = particle.position.distanceTo(otherObject.position);

        // check if the distance is within the search radius
        if (distance <= searchRadius) {
            // add the other object to the list of neighbors
            neighbors.push(otherObject);
        }
    }

    return neighbors;
}

class Water extends Group {
    constructor (
        parent, startingPosition, numberOfParticles, waterMaterial, radius,
        // adding physics parameters
    ) {
        super(); // inherit parent class Group properties

        // Marching cubes attempt
        /*const resolution = 32; // Adjust the resolution based on your needs
        const material = new THREE.MeshBasicMaterial({ color: 0x0032ff, opacity: 0.5, transparent: true });
        this.marchingCubes = new MarchingCubes(resolution, material, true, true);
        // this.marchingCubes.position.set(0, 3, 0);
        this.marchingCubes.scale.set(1, 1, 1); // Adjust scale values based on your needs
        // this.marchingCubes.field = sphereField;
        parent.add(this.marchingCubes);*/

        this.particles = [];
        this.numberOfParticles = numberOfParticles;
        this.parent = parent;

        // creating all of the particles
        for (let i = 0; i < numberOfParticles; i++) {
            // making the sphere particles (visual)
            const sphere = new THREE.SphereGeometry(radius, 50, 50); // remember to add more than 8 segments

            // load the cube texture
            const loader = new THREE.CubeTextureLoader();

            // const irradiance = loader.load([
            //     './src/components/objects/Water/textures/irradiance/negX.jpg',  // right
            //     './src/components/objects/Water/textures/irradiance/posX.jpg',  // left
            //     './src/components/objects/Water/textures/irradiance/negZ.jpg',  // top
            //     './src/components/objects/Water/textures/irradiance/posZ.jpg',  // bottom
            //     './src/components/objects/Water/textures/irradiance/negY.jpg',  // front
            //     './src/components/objects/Water/textures/irradiance/posY.jpg'   // back
            // ])
            // irradiance.encoding = THREE.sRGBEncoding;

            const specular = loader.load([
                './src/components/objects/Water/textures/specular/negX.jpg',  // right
                './src/components/objects/Water/textures/specular/posX.jpg',  // left
                './src/components/objects/Water/textures/specular/negZ.jpg',  // top
                './src/components/objects/Water/textures/specular/posZ.jpg',  // bottom
                './src/components/objects/Water/textures/specular/negY.jpg',  // front
                './src/components/objects/Water/textures/specular/posY.jpg'   // back
            ]);
            specular.encoding = THREE.sRGBEncoding;
            specular.minFilter = THREE.LinearFilter;

            // create the water material
            const waterMaterial = new THREE.MeshStandardMaterial({
                color: 0x0055ff,      // Base color of the water
                roughness: 0.2,       // Roughness of the water surface
                metalness: 0.8,       // Reflectivity of the water surface
                envMap: specular,      // The cube texture used for reflections
                envMapIntensity: 1.0, // Intensity of the reflections
                transparent: true,    // The material is transparent
                opacity: 0.8          // The opacity of the material
            });

            // generating mesh of the particle
            const particle = new THREE.Mesh(sphere, waterMaterial)

            // generating a random starting position for each ball
            const offsetX = (Math.random() * 3) - 1;   // Random number between -1 and 1
            const offsetY = (Math.random() * 3) - 1;   // Random number between -1 and 1
            const offsetZ = (Math.random() * 3) - 1;   // Random number between -1 and 1
            const offsetVector = new CANNON.Vec3(offsetX, offsetY, offsetZ);

            // Add the offset vector to your original vector
            const randomStartingPosition = startingPosition.vadd(offsetVector);

            // making the sphere particles (physical)
            const pbody = new CANNON.Body({ // particle body
                mass: 1,
                shape: new CANNON.Sphere(radius), // shape of the object's collision volume
                material: waterMaterial,
                linearDamping: 0,
                fixedRotation: false, // disables forced rotation due to collision
                position: randomStartingPosition, // starting position of the object in the physics world
                collisionFilterGroup: -1,
                collisionFilterMask: -1,
            });
            pbody.updateMassProperties(); // Need to call this after setting up the parameter
            parent.bodyIDToString[pbody.id] = "WaterParticle";
            
            // Add body to the world (physics world)
            parent.state.world.addBody(pbody);

            // Add a collision event listener to the building's MAIN physics body
            pbody.addEventListener("collide", this.handleCollision.bind(this));

            particle.position.copy(pbody.position);

            this.particles.push({ particle, pbody });
        }

        // adding all particles to the parent
         for (let i = 0; i < numberOfParticles; i++) {
            parent.add(this.particles[i].particle)
         }

        // Add self to parent's update list
        parent.addToUpdateList(this);
    }

    handleCollision(event) { // the function executed when a collision happens between something and the main physical buildling.
        if (this.parent.bodyIDToString[event.contact.bj.id] == "Land") {
            // event.contact.bi.applyForce(new CANNON.Vec3(0, 10, 0), event.contact.bi.position);
        }

        if (this.parent.bodyIDToString[event.contact.bj.id] == "WaterParticle" ) {
        }
    }

    update() {
        const pbodyList = this.particles.map((item) => item.pbody)
        SmoothedParticleHydrodynamics(pbodyList, 0.1, 1000, 0.1)
         for (let i = 0; i < this.numberOfParticles; i++) {
            let p = this.particles[i]
           p.particle.position.copy(p.pbody.position);
         }
        
        // Marching Cube Efforts
        // this.updateScalarField();
        // this.updateMesh();
    }

    updateScalarField() {
        this.marchingCubes.reset();
      
        const strength = 12; // adjust this value to control the size of the ball
        const subtract = 5; // positive for a solid ball, negative for a hollow ball
        const colors = null;
      
        for (const { pbody } of this.particles) {
          const position = pbody.position;
          this.marchingCubes.addBall(position.x, position.y, position.z, strength, subtract, colors);
        }
    }

    updateMesh() {
        this.marchingCubes.update();
    }

}

export default Water;
