import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3
} from 'three'
import { createArrayCursor } from './array'
import { logger } from './logger'
import { Skeleton } from '../objects/Skeleton'

const LOG_KEYS = {
  createGeometry: 'create geometry',
  parseBufferAttributes: '|  parse buffer attributes',
  createBufferAttributes: '|  create buffer attributes',
  createSkin: 'create skin',
  parseBones: '|  parse bones',
  parseBoneFrames: '|  parse bone frames',
  createSkeleton: '|  create skeleton'
}

export function parseModel (props, meta) {
  // logger.logHash('model meta', meta)
  logger.time(LOG_KEYS.createGeometry)
  const geometry = createGeometry(props, meta)
  logger.timeEnd(LOG_KEYS.createGeometry)
  return {
    geometry
  }
}

export function parseSkin (props, meta) {
  // logger.logHash('model meta', meta)
  logger.time(LOG_KEYS.createSkin)

  logger.time(LOG_KEYS.parseBones)
  const bones = parseBones(props.bones)
  logger.timeEnd(LOG_KEYS.parseBones)

  logger.time(LOG_KEYS.parseBoneFrames)
  const frames = parseBoneFrames(props.boneFrames)
  logger.timeEnd(LOG_KEYS.parseBoneFrames)

  logger.time(LOG_KEYS.createSkeleton)
  const skeleton = createSkeleton(bones)
  logger.timeEnd(LOG_KEYS.createSkeleton)

  logger.timeEnd(LOG_KEYS.createSkin)

  return {
    skeleton,
    frames
  }
}

function createGeometry (props, meta) {
  const geometry = new BufferGeometry()
  logger.time(LOG_KEYS.parseBufferAttributes)
  const attributes = parseBufferAttributes(props, meta)
  logger.timeEnd(LOG_KEYS.parseBufferAttributes)

  logger.time(LOG_KEYS.createBufferAttributes)
  addBufferAttribute(geometry, {
    key: 'position',
    value: attributes.position,
    itemSize: 3
  })
  addBufferAttribute(geometry, {
    key: 'normal',
    value: attributes.normal,
    itemSize: 3
  })
  addBufferAttribute(geometry, {
    key: 'uv',
    value: attributes.uv,
    itemSize: 2
  })
  addBufferAttribute(geometry, {
    key: 'skinIndex',
    value: attributes.skinIndex,
    itemSize: 4
  })
  addBufferAttribute(geometry, {
    key: 'skinWeight',
    value: attributes.skinWeight,
    itemSize: 4
  })
  logger.timeEnd(LOG_KEYS.createBufferAttributes)

  return geometry
}

function addBufferAttribute (geometry, props) {
  const { key, value } = props
  if (!(value && value.length)) return
  geometry.addAttribute(key,
    new BufferAttribute(value, props.itemSize))
}

function isBitSet (value, position) {
  return value & (1 << position)
}

// NOTE:
// - Only triangles (no quads)
// - Only single UV layer
function parseBufferAttributes (props, meta) {
  const {
    faces, normals, uvs, vertices,
    skinIndices, skinWeights
  } = props
  const uvLayer = uvs

  if (!faces.length) {
    return {
      position: vertices
    }
  }

  const hasSkinning = !!(skinIndices && skinWeights)
  const fLength = faces.length
  let fOffset = 0

  const position = createArrayCursor(new Float32Array(meta.faces * 3 * 3))
  const uv = createArrayCursor(new Float32Array(meta.faces * 3 * 2))
  const normal = createArrayCursor(new Float32Array(meta.faces * 3 * 3))
  const skinIndex = hasSkinning && createArrayCursor(new Float32Array(meta.faces * 3 * 4))
  const skinWeight = hasSkinning && createArrayCursor(new Float32Array(meta.faces * 3 * 4))

  while (fOffset < fLength) {
    const type = faces[fOffset++]
    const hasMaterial = isBitSet(type, 1)
    const hasFaceVertexUv = isBitSet(type, 3)
    const hasFaceNormal = isBitSet(type, 4)
    const hasFaceVertexNormal = isBitSet(type, 5)

    let indexA = faces[fOffset++]
    let indexB = faces[fOffset++]
    let indexC = faces[fOffset++]

    let vertA = indexA * 3
    let vertB = indexB * 3
    let vertC = indexC * 3

    position.push(
      vertices[vertA],
      vertices[vertA + 1],
      vertices[vertA + 2],

      vertices[vertB],
      vertices[vertB + 1],
      vertices[vertB + 2],

      vertices[vertC],
      vertices[vertC + 1],
      vertices[vertC + 2])

    if (hasSkinning) {
      let vertA = indexA * 4
      let vertB = indexB * 4
      let vertC = indexC * 4

      skinIndex.push(
        skinIndices[vertA],
        skinIndices[vertA + 1],
        skinIndices[vertA + 2],
        skinIndices[vertA + 3],

        skinIndices[vertB],
        skinIndices[vertB + 1],
        skinIndices[vertB + 2],
        skinIndices[vertB + 3],

        skinIndices[vertC],
        skinIndices[vertC + 1],
        skinIndices[vertC + 2],
        skinIndices[vertC + 3])

      skinWeight.push(
        skinWeights[vertA],
        skinWeights[vertA + 1],
        skinWeights[vertA + 2],
        skinWeights[vertA + 3],

        skinWeights[vertB],
        skinWeights[vertB + 1],
        skinWeights[vertB + 2],
        skinWeights[vertB + 3],

        skinWeights[vertC],
        skinWeights[vertC + 1],
        skinWeights[vertC + 2],
        skinWeights[vertC + 3])
    }

    if (hasMaterial) {
      fOffset++
    }

    if (hasFaceVertexUv) {
      vertA = 2 * faces[fOffset++]
      vertB = 2 * faces[fOffset++]
      vertC = 2 * faces[fOffset++]

      uv.push(
        uvLayer[vertA],
        uvLayer[vertA + 1],

        uvLayer[vertB],
        uvLayer[vertB + 1],

        uvLayer[vertC],
        uvLayer[vertC + 1])
    }

    if (hasFaceNormal) {
      fOffset++
    }

    // FIXME: Not sure why normals are weird
    if (hasFaceVertexNormal) {
      for (let i = 0; i < 3; i++) {
        const normalIndex = faces[fOffset++] * 3
        normal.push(
          normals[normalIndex + 0],
          -normals[normalIndex + 2],
          normals[normalIndex + 1])
      }
    }
  }

  const propAttrs = {
    position: position.array,
    normal: normal.array,
    uv: uv.array
  }
  if (hasSkinning) {
    propAttrs.skinIndex = skinIndex.array
    propAttrs.skinWeight = skinWeight.array
  }
  return propAttrs
}

function createSkeleton (bones) {
  return new Skeleton(bones, undefined, true)
}

function parseBones (bonesData) {
  return bonesData.map((data) => {
    const bone = new Bone()
    bone.name = data.name
    bone.parentIndex = data.parent
    bone.position.fromArray(data.pos)
    bone.quaternion.fromArray(data.rotq)
    if (data.scl) bone.scale.fromArray(data.scl)
    return bone
  })
}

function parseBoneFrames (boneFrames) {
  return boneFrames.map((actionFrames) => (
    actionFrames.map((frame) => ({
      pos: new Vector3().fromArray(frame.pos),
      rot: new Quaternion().fromArray(frame.rot),
      scl: new Vector3().fromArray(frame.scl)
    }))
  ))
}
