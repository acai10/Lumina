import * as THREE from 'three'
import { palette } from '../../shared/theme/palette'
import { UM_PER_MM } from '../../shared/constants'

const AXIS_LABEL_CANVAS_SIZE = 64
const AXIS_LABEL_FONT = 'bold 52px sans-serif'

const TICK_CANVAS_W = 96
const TICK_CANVAS_H = 40
const TICK_FONT = 'bold 26px sans-serif'

/** Tick-label sprite size relative to the axis-letter label scale. */
const TICK_LABEL_SCALE_FACTOR = 0.55
/** Perpendicular offset of tick labels from the axis line (× label scale). */
const TICK_PERP_OFFSET_FACTOR = 0.9

const AXIS_DEFINITIONS = [
    { text: 'X', color: palette.axisX, pos: [1, 0, 0] },
    { text: 'Y', color: palette.axisY, pos: [0, 1, 0] },
    { text: 'Z', color: palette.axisZ, pos: [0, 0, 1] },
] as const

const TICK_NICE_UM = [25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000]
/** Aim for roughly this many ticks per axis when picking a "nice" interval. */
const TARGET_TICK_COUNT = 6

/**
 * Builds the X/Y/Z axis letters and tick labels for the 3-D viewer as canvas sprites.
 *
 * Ticks are placed on a "nice" interval (1/2/5 x 10^n micrometres) picked from the
 * volume's physical extent, so the labels stay readable at any zoom instead of
 * landing on arbitrary values. Sprites carry canvas textures, which have to be
 * disposed explicitly before the scene is torn down.
 */
function niceIntervalUm(fullExtentUm: number): number {
    const raw = fullExtentUm / TARGET_TICK_COUNT
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

/** Place each axis label a little beyond the end of its own edge. */
const AXIS_LABEL_OVERSHOOT = 1.06

/**
 * Create X/Y/Z axis label sprites and add them to *scene*.
 *
 * @param scene  - Three.js scene to add sprites to.
 * @param axisLengths - Per-axis edge lengths ``[lenX, lenY, lenZ]`` in scene units;
 *   each label is placed just past the end of its corresponding edge.
 * @param labelScale - Uniform sprite scale in world units.
 * @returns Array of created sprites (caller is responsible for disposal on unmount).
 */
export function createAxisLabels(
    scene: THREE.Object3D,
    axisLengths: readonly [number, number, number],
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
        sprite.position.set(
            pos[0] * axisLengths[0] * AXIS_LABEL_OVERSHOOT,
            pos[1] * axisLengths[1] * AXIS_LABEL_OVERSHOOT,
            pos[2] * axisLengths[2] * AXIS_LABEL_OVERSHOOT,
        )
        sprite.scale.setScalar(labelScale)
        scene.add(sprite)
        return [sprite]
    })
}

/**
 * Create numeric tick label sprites along X, Y, Z axes and add them to *scene*.
 *
 * Ticks are placed along the full length of each axis (the origin sits at the
 * box's min corner) at physically meaningful intervals derived from voxelSizeUm
 * and the volume dimensions.
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
    const tickScale = labelScale * TICK_LABEL_SCALE_FACTOR
    // Perpendicular offset so ticks don't sit on the axis line
    const off = labelScale * TICK_PERP_OFFSET_FACTOR
    const sprites: THREE.Sprite[] = []

    // X axis: scene units = pixels, 1 su = dx µm; range [0, width]
    const xFullUm = width * dx
    const xInterval = niceIntervalUm(xFullUm)
    for (let um = xInterval; um <= xFullUm + 1; um += xInterval) {
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

    // Z axis: scene units = pixels, 1 su = dy µm; range [0, height]
    const zFullUm = height * dy
    const zInterval = niceIntervalUm(zFullUm)
    for (let um = zInterval; um <= zFullUm + 1; um += zInterval) {
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

    // Y axis: 1 su = (dz * nSlices / volumeSpacing) µm; range [0, volumeSpacing]
    const yUmPerSU = (dz * nSlices) / volumeSpacing
    const yFullUm = volumeSpacing * yUmPerSU
    const yInterval = niceIntervalUm(yFullUm)
    for (let um = yInterval; um <= yFullUm + 1; um += yInterval) {
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
