import * as THREE from 'three'
import * as CANNON from 'cannon-es';
import { Group } from 'three'

// NOTE : this approach didn't work, so we implemented it ourselves
// import { MarchingCubes } from './MarchingCubes.js';

// coding the MarchingCubes algorithm proved to be too tedious
// function MarchingCubes(particles) {
//     // accessing the innner geometry of the particle
//     console.log(particles[0])
//     // console.log(particles[0].geometry)

//     var faces = particles[0].geometry.faces;
//     var vertices = particles[0].geometry.vertices;

//     // return mesh
// }

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

        this.particles = [];
        this.numberOfParticles = numberOfParticles;
        this.parent = parent;

        // creating all of the particles
        for (let i = 0; i < numberOfParticles; i++) {
            // making the sphere particles (visual)
            const sphere = new THREE.SphereGeometry( radius, 5, 5 ); // remember to add more than 8 segments

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
            const offsetX = (Math.random() * radius * 15) - 1;   // Random number between -1 and 1
            const offsetY = (Math.random() * radius * 15) - 1;   // Random number between -1 and 1
            const offsetZ = (Math.random() * radius * 15) - 1;   // Random number between -1 and 1
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
            let base = 0.5, decayFactor = 2; // initialize parameter variables

            // getting the two sphere three.js objects that collided
            var sphere1 = this.particles[event.contact.bi.index - 1].particle;
            var sphere2 = this.particles[event.contact.bj.index - 1].particle;

            // Updating the vertices of both objects to look as though they are merging
            const [newVerts1, newVerts2] = updateVerticesOfCloseSpheres(sphere1, sphere2, base, decayFactor);
            // const oldVerts1 = sphere1.geometry.getAttribute('position').array;
            const oldVerts1 = sphere1.geometry.vertices;

            for (let i = 0; i < newVerts1.length; i++) {
                oldVerts1[i].x = newVerts1[i].x;
                oldVerts1[i].y = newVerts1[i].y;
                oldVerts1[i].z = newVerts1[i].z;
            }

            // Updating the vertices of both objects to look as though they are merging
            // const oldVerts2 = sphere2.geometry.getAttribute('position').array;
            const oldVerts2 = sphere2.geometry.vertices;

            for (let i = 0; i < newVerts2.length; i++) {
                oldVerts2[i].x = newVerts2[i].x;
                oldVerts2[i].y = newVerts2[i].y;
                oldVerts2[i].z = newVerts2[i].z;
            }
        }
    }

    update() {
        // performing the Smoothed-Particle Hydrodynamics calculation
        const pbodyList = this.particles.map((item) => item.pbody);
        SmoothedParticleHydrodynamics(pbodyList, 0.1, 1000, 0.1);

        // generating a marching cubes mesh and updating it
        const particleList = this.particles.map((item) => item.particle);
        // MarchingCubes(particleList);
        // for (let i = 0; i < this.numberOfParticles; i++) {
        //     console.log(this.particles[i]);
        // }

        // updating the position of the visual world with the bodies
        for (let i = 0; i < this.numberOfParticles; i++) {
            let p = this.particles[i];
            p.particle.position.copy(p.pbody.position);
        }
    }
}

function exponentialDecay(x, base, decayFactor) {
  return 1 / (1 + Math.pow(base, decayFactor * x));
}

function extractVectorVertices(arrayOfCoordinates) {
  var extractedVectorVertices = [];

  for (let i = 0; i < arrayOfCoordinates.length; i += 3) {
    extractedVectorVertices.push(
      new THREE.Vector3(
        arrayOfCoordinates[i], arrayOfCoordinates[i + 1], arrayOfCoordinates[i + 2]
      ) // creating a new Vector3 point to add to the list
    );
  }

  return extractedVectorVertices;
}

function updateVerticesOfCloseSpheres(sphere1, sphere2, base, decayFactor) {
  // console.log(sphere1); console.log(sphere2); // debugging the spheres

  // getting the positions of each of the spheres
  const position1 = sphere1.position;
  const position2 = sphere2.position;

  // getting the geometries of each of the spheres
  const sphere1Geometry = sphere1.geometry;
  const sphere2Geometry = sphere2.geometry;

  // getting the vertex coordinate values
//   const sphere1Vertices = sphere1Geometry.getAttribute('position').array;
//   const sphere2Vertices = sphere2Geometry.getAttribute('position').array;

  // getting the sphere vector array (since we are using old version, we don't need to extract)
//   const sphere1VectorVertices = extractVectorVertices(sphere1Vertices);
//   const sphere2VectorVertices = extractVectorVertices(sphere2Vertices);
  const sphere1VectorVertices = sphere1Geometry.vertices;
  const sphere2VectorVertices = sphere2Geometry.vertices;

  const newVerts1 = [], newVerts2 = []; // creating storage arrays for all of the vertices

  for (let i = 0; i < sphere1VectorVertices.length; i++) {
    let distance = position2.distanceTo(sphere1VectorVertices[i]); // getting the distance to the other sphere
    let factor = exponentialDecay(distance, base, decayFactor);

    var direction = sphere1VectorVertices[i].sub(position2);

    newVerts1.push(sphere1VectorVertices[i].clone().add(direction.clone().multiplyScalar(factor)));
  }

  for (let i = 0; i < sphere2VectorVertices; i++) {
    let distance = position1.distanceTo(sphere2VectorVertices[i]); // getting the distance to the other sphere
    let factor = exponentialDecay(distance, base, decayFactor);

    var direction = sphere2VectorVertices[i].sub(position1);

    newVerts2.push(sphere2VectorVertices[i].clone().add(direction.clone().multiplyScalar(factor)));
  }

  return [newVerts1, newVerts2];
}

export default Water;
