import * as THREE from 'three'
import { palette } from '../../shared/theme/palette'
import { UM_PER_MM } from '../../shared/constants'

const AXIS_LABEL_CANVAS_SIZE = 64
const AXIS_LABEL_FONT = 'bold 52px sans-serif'

const TICK_CANVAS_W = 96
const TICK_CANVAS_H = 40
const TICK_FONT = 'bold 26px sans-serif'

const AXIS_DEFINITIONS = [
    { text: 'X', color: palette.axisX, pos: [1, 0, 0] },
    { text: 'Y', color: palette.axisY, pos: [0, 1, 0] },
    { text: 'Z', color: palette.axisZ, pos: [0, 0, 1] },
] as const

const TICK_NICE_UM = [25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000]

function niceIntervalUm(halfExtentUm: number): number {
    const raw = halfExtentUm / 3
    return TICK_NICE_UM.find((v) => v >= raw) ?? TICK_NICE_UM[TICK_NICE_UM.length - 1]
}

function formatTickLabel(um: number): string {
    if (um >= UM_PER_MM)
        return `${Number.isInteger(um / UM_PER_MM) ? um / UM_PER_MM : (um / UM_PER_MM).toFixed(1)}mm`
    return `${um}µm`
}

function makeTickSprite(
    scene: THREE.Object3D,
    pos: THREE.Vector3,
    text: string,
    spriteScale: number,
    color: string,
): THREE.Sprite[] {
    const canvas = document.createElement('canvas')
    canvas.width = TICK_CANVAS_W
    canvas.height = TICK_CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    ctx.fillStyle = color
    ctx.font = TICK_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, TICK_CANVAS_W / 2, TICK_CANVAS_H / 2)
    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.position.copy(pos)
    sprite.scale.set(spriteScale * (TICK_CANVAS_W / TICK_CANVAS_H), spriteScale, 1)
    scene.add(sprite)
    return [sprite]
}

/**
 * Create X/Y/Z axis label sprites and add them to *scene*.
 *
 * @param scene  - Three.js scene to add sprites to.
 * @param axisLen - Distance from origin to place each label.
 * @param labelScale - Uniform sprite scale in world units.
 * @returns Array of created sprites (caller is responsible for disposal on unmount).
 */
export function createAxisLabels(
    scene: THREE.Object3D,
    axisLen: number,
    labelScale: number,
): THREE.Sprite[] {
    return AXIS_DEFINITIONS.flatMap(({ text, color, pos }) => {
        const canvas = document.createElement('canvas')
        canvas.width = AXIS_LABEL_CANVAS_SIZE
        canvas.height = AXIS_LABEL_CANVAS_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) return []
        ctx.fillStyle = color
        ctx.font = AXIS_LABEL_FONT
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, AXIS_LABEL_CANVAS_SIZE / 2, AXIS_LABEL_CANVAS_SIZE / 2)
        const texture = new THREE.CanvasTexture(canvas)
        const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
        const sprite = new THREE.Sprite(mat)
        sprite.position.set(pos[0] * axisLen, pos[1] * axisLen, pos[2] * axisLen)
        sprite.scale.setScalar(labelScale)
        scene.add(sprite)
        return [sprite]
    })
}

/**
 * Create numeric tick label sprites along X, Y, Z axes and add them to *scene*.
 *
 * Ticks are placed along the positive half of each axis at physically meaningful
 * intervals derived from voxelSizeUm and the volume dimensions.
 *
 * @param scene          - Three.js scene to add sprites to.
 * @param meta           - Volume dimensions {nSlices, height, width}.
 * @param voxelSizeUm    - [dz, dy, dx] in µm/voxel.
 * @param labelScale     - Sprite scale in world units (same unit as axis coordinates).
 * @param volumeSpacing  - Y-axis stretch in scene units (uniform = isotropic display).
 * @returns Array of created sprites (caller is responsible for disposal on unmount).
 */
export function createAxisTickLabels(
    scene: THREE.Object3D,
    meta: { nSlices: number; height: number; width: number },
    voxelSizeUm: [number, number, number],
    labelScale: number,
    volumeSpacing: number,
): THREE.Sprite[] {
    const [dz, dy, dx] = voxelSizeUm
    const { nSlices, height, width } = meta
    const tickScale = labelScale * 0.55
    // Perpendicular offset so ticks don't sit on the axis line
    const off = labelScale * 0.9
    const sprites: THREE.Sprite[] = []

    // X axis: scene units = pixels, 1 su = dx µm; range [-width/2, width/2]
    const xHalfUm = (width / 2) * dx
    const xInterval = niceIntervalUm(xHalfUm)
    for (let um = xInterval; um <= xHalfUm + 1; um += xInterval) {
        const su = um / dx
        sprites.push(
            ...makeTickSprite(
                scene,
                new THREE.Vector3(su, 0, off),
                formatTickLabel(um),
                tickScale,
                palette.axisX,
            ),
        )
    }

    // Z axis: scene units = pixels, 1 su = dy µm; range [-height/2, height/2]
    const zHalfUm = (height / 2) * dy
    const zInterval = niceIntervalUm(zHalfUm)
    for (let um = zInterval; um <= zHalfUm + 1; um += zInterval) {
        const su = um / dy
        sprites.push(
            ...makeTickSprite(
                scene,
                new THREE.Vector3(off, 0, su),
                formatTickLabel(um),
                tickScale,
                palette.axisZ,
            ),
        )
    }

    // Y axis: 1 su = (dz * nSlices / volumeSpacing) µm; range [-vS/2, vS/2]
    const yUmPerSU = (dz * nSlices) / volumeSpacing
    const yHalfUm = (volumeSpacing / 2) * yUmPerSU
    const yInterval = niceIntervalUm(yHalfUm)
    for (let um = yInterval; um <= yHalfUm + 1; um += yInterval) {
        const su = um / yUmPerSU
        sprites.push(
            ...makeTickSprite(
                scene,
                new THREE.Vector3(off, su, 0),
                formatTickLabel(um),
                tickScale,
                palette.axisY,
            ),
        )
    }

    return sprites
}
