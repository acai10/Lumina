import * as THREE from 'three'
import { palette } from '../../shared/theme/palette'

const AXIS_LABEL_CANVAS_SIZE = 64
const AXIS_LABEL_FONT = 'bold 52px sans-serif'

const AXIS_DEFINITIONS = [
    { text: 'X', color: palette.axisX, pos: [1, 0, 0] },
    { text: 'Y', color: palette.axisY, pos: [0, 1, 0] },
    { text: 'Z', color: palette.axisZ, pos: [0, 0, 1] },
] as const

/**
 * Create X/Y/Z axis label sprites and add them to *scene*.
 *
 * @param scene  - Three.js scene to add sprites to.
 * @param axisLen - Distance from origin to place each label.
 * @param labelScale - Uniform sprite scale in world units.
 * @returns Array of created sprites (caller is responsible for disposal on unmount).
 */
export function createAxisLabels(
    scene: THREE.Scene,
    axisLen: number,
    labelScale: number,
): THREE.Sprite[] {
    return AXIS_DEFINITIONS.map(({ text, color, pos }) => {
        const canvas = document.createElement('canvas')
        canvas.width = AXIS_LABEL_CANVAS_SIZE
        canvas.height = AXIS_LABEL_CANVAS_SIZE
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = color
        ctx.font = AXIS_LABEL_FONT
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, 32, 32)
        const texture = new THREE.CanvasTexture(canvas)
        const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
        const sprite = new THREE.Sprite(mat)
        sprite.position.set(pos[0] * axisLen, pos[1] * axisLen, pos[2] * axisLen)
        sprite.scale.setScalar(labelScale)
        scene.add(sprite)
        return sprite
    })
}
