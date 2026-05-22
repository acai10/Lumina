import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Box } from '@mui/material'
import { useViewerStore, defaultRenderControls } from '../../app/store/viewerSlice'
import { createScene } from '../../shared/three/sceneUtils'
import type { H5Meta } from '../../shared/types/viewer.types'

interface H5ViewerProps {
    vIndices: Float32Array
    vIntensities: Float32Array
    meta: H5Meta
    fileKey: string
    onError?: (msg: string) => void
}

const vertexShader = /* glsl */ `
in float vIndex;
in float vIntensity;
out float fIntensity;
out float fS;
out float fW;
out float fH;

uniform float uNSlices;
uniform float uHeight;
uniform float uWidth;
uniform float uVolumeSpacing;
uniform float uPointSize;

void main() {
    float sliceSize = uHeight * uWidth;
    float s = floor(vIndex / sliceSize);
    float rem = mod(vIndex, sliceSize);
    float h = floor(rem / uWidth);
    float w = mod(rem, uWidth);

    float x = w - uWidth * 0.5;
    float y = (s - uNSlices * 0.5) * (uVolumeSpacing / uNSlices);
    float z = h - uHeight * 0.5;

    fIntensity = vIntensity;
    fS = s;
    fW = w;
    fH = h;
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp float;
in float fIntensity;
in float fS;
in float fW;
in float fH;
out vec4 fragColor;

uniform float uThreshold;
uniform float uBrightness;
uniform float uContrast;
uniform float uOpacity;
uniform float uSliceMin;
uniform float uSliceMax;
uniform float uWidthMin;
uniform float uWidthMax;
uniform float uHeightMin;
uniform float uHeightMax;

void main() {
    if (fIntensity < uThreshold) discard;
    if (fS < uSliceMin || fS >= uSliceMax) discard;
    if (fW < uWidthMin || fW >= uWidthMax) discard;
    if (fH < uHeightMin || fH >= uHeightMax) discard;
    float c = clamp(fIntensity * uBrightness, 0.0, 1.0);
    if (c < 0.5) c = 0.5 * pow(2.0 * c, uContrast);
    else         c = 1.0 - 0.5 * pow(2.0 * (1.0 - c), uContrast);
    fragColor = vec4(c, c, c, uOpacity);
}
`

export default function H5Viewer({ vIndices, vIntensities, meta, fileKey }: H5ViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const materialRef = useRef<THREE.ShaderMaterial | null>(null)

    const rc = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.renderControls ?? defaultRenderControls,
    )

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { scene, camera, renderer, controls, disposeBase } = createScene(container)

        const { nSlices, height, width } = meta
        const rc0 =
            useViewerStore.getState().h5PerFileStates[fileKey]?.renderControls ??
            defaultRenderControls
        const maxDim = Math.max(width, height, rc0.volumeSpacing)

        const axes = new THREE.AxesHelper(maxDim * 0.7)
        scene.add(axes)

        const axisLen = maxDim * 0.78
        const labelScale = maxDim * 0.09
        const axisLabels = (
            [
                { text: 'X', color: '#ff4444', pos: [axisLen, 0, 0] },
                { text: 'Y', color: '#44ff88', pos: [0, axisLen, 0] },
                { text: 'Z', color: '#4488ff', pos: [0, 0, axisLen] },
            ] as const
        ).map(({ text, color, pos }) => {
            const canvas = document.createElement('canvas')
            canvas.width = 64
            canvas.height = 64
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = color
            ctx.font = 'bold 52px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(text, 32, 32)
            const texture = new THREE.CanvasTexture(canvas)
            const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
            const sprite = new THREE.Sprite(mat)
            sprite.position.set(pos[0], pos[1], pos[2])
            sprite.scale.setScalar(labelScale)
            scene.add(sprite)
            return sprite
        })

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('vIndex', new THREE.BufferAttribute(vIndices, 1))
        geometry.setAttribute('vIntensity', new THREE.BufferAttribute(vIntensities, 1))
        geometry.setDrawRange(0, vIndices.length)

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uNSlices: { value: nSlices },
                uHeight: { value: height },
                uWidth: { value: width },
                uVolumeSpacing: { value: rc0.volumeSpacing },
                uPointSize: { value: rc0.h5PointSize },
                uThreshold: { value: rc0.h5Threshold },
                uBrightness: { value: rc0.h5Brightness },
                uContrast: { value: rc0.h5Contrast },
                uOpacity: { value: rc0.h5Opacity },
                uSliceMin: { value: rc0.h5SliceRange[0] },
                uSliceMax: { value: rc0.h5SliceRange[1] },
                uWidthMin: { value: rc0.h5WidthRange[0] },
                uWidthMax: { value: rc0.h5WidthRange[1] },
                uHeightMin: { value: rc0.h5HeightRange[0] },
                uHeightMax: { value: rc0.h5HeightRange[1] },
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
        })

        const boundingBox = new THREE.Box3(
            new THREE.Vector3(-width / 2, -rc0.volumeSpacing / 2, -height / 2),
            new THREE.Vector3(width / 2, rc0.volumeSpacing / 2, height / 2),
        )
        const boxHelper = new THREE.Box3Helper(boundingBox, new THREE.Color(0x64ffc8))
        scene.add(boxHelper)

        const points = new THREE.Points(geometry, material)
        points.frustumCulled = false
        scene.add(points)
        materialRef.current = material

        const saved = useViewerStore.getState().h5PerFileStates[fileKey]
        if (saved?.cameraPosition) {
            camera.position.fromArray(saved.cameraPosition)
            camera.quaternion.fromArray(saved.cameraQuaternion!)
            controls.target.fromArray(saved.controlsTarget!)
        } else {
            camera.position.set(maxDim * 0.5, maxDim * 1.5, maxDim * 1.2)
            camera.lookAt(0, 0, 0)
        }
        camera.near = maxDim * 0.001
        camera.far = maxDim * 100
        camera.updateProjectionMatrix()
        controls.update()

        let animId: number
        const animate = () => {
            animId = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

        return () => {
            cancelAnimationFrame(animId)
            useViewerStore.getState().saveH5CameraState(fileKey, {
                cameraPosition: camera.position.toArray() as [number, number, number],
                cameraQuaternion: camera.quaternion.toArray() as [number, number, number, number],
                controlsTarget: controls.target.toArray() as [number, number, number],
            })
            geometry.dispose()
            material.dispose()
            axes.dispose()
            boxHelper.dispose()
            axisLabels.forEach((s) => {
                s.material.map?.dispose()
                s.material.dispose()
            })
            materialRef.current = null
            disposeBase()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vIndices, vIntensities, meta, fileKey])

    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uVolumeSpacing.value = rc.volumeSpacing
        mat.uniforms.uPointSize.value = rc.h5PointSize
        mat.uniforms.uThreshold.value = rc.h5Threshold
        mat.uniforms.uBrightness.value = rc.h5Brightness
        mat.uniforms.uContrast.value = rc.h5Contrast
        mat.uniforms.uOpacity.value = rc.h5Opacity
        mat.uniforms.uSliceMin.value = rc.h5SliceRange[0]
        mat.uniforms.uSliceMax.value = rc.h5SliceRange[1]
        mat.uniforms.uWidthMin.value = rc.h5WidthRange[0]
        mat.uniforms.uWidthMax.value = rc.h5WidthRange[1]
        mat.uniforms.uHeightMin.value = rc.h5HeightRange[0]
        mat.uniforms.uHeightMax.value = rc.h5HeightRange[1]
    }, [
        rc.volumeSpacing,
        rc.h5PointSize,
        rc.h5Threshold,
        rc.h5Brightness,
        rc.h5Contrast,
        rc.h5Opacity,
        rc.h5SliceRange[0],
        rc.h5SliceRange[1],
        rc.h5WidthRange[0],
        rc.h5WidthRange[1],
        rc.h5HeightRange[0],
        rc.h5HeightRange[1],
    ])

    return <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
}
