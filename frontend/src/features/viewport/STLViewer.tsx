import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

import type { STLData } from '../../shared/types/stl.types';

function STLMesh({ data }: { data: STLData }) {
    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();

        const flatVertices = new Float32Array(data.faces.length * 3 * 3);
        const flatNormals = new Float32Array(data.faces.length * 3 * 3);

        for (let fi = 0; fi < data.faces.length; fi++) {
            const face = data.faces[fi];
            const normal = data.face_normals[fi];
            for (let vi = 0; vi < 3; vi++) {
                const v = data.vertices[face[vi]];
                const base = (fi * 3 + vi) * 3;
                flatVertices[base] = v[0];
                flatVertices[base + 1] = v[1];
                flatVertices[base + 2] = v[2];
                flatNormals[base] = normal[0];
                flatNormals[base + 1] = normal[1];
                flatNormals[base + 2] = normal[2];
            }
        }

        geo.setAttribute('position', new THREE.BufferAttribute(flatVertices, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(flatNormals, 3));
        geo.computeBoundingBox();

        // center the mesh at origin
        const center = new THREE.Vector3();
        geo.boundingBox!.getCenter(center);
        geo.translate(-center.x, -center.y, -center.z);

        return geo;
    }, [data]);

    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial color="#90caf9" side={THREE.DoubleSide} />
        </mesh>
    );
}

export default function STLViewer({ data }: { data: STLData }) {
    return (
        <Canvas
            camera={{ position: [0, 0, 100], fov: 45, near: 0.1, far: 100000 }}
            style={{ width: '100%', height: '100%', background: '#121212' }}
        >
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 20, 10]} intensity={1} />
            <directionalLight position={[-10, -10, -10]} intensity={0.3} />
            <STLMesh data={data} />
            <OrbitControls makeDefault />
        </Canvas>
    );
}
