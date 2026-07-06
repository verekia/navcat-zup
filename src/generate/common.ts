export type ArrayLike<T> = {
    [index: number]: T;
    length: number;
};

// Direction offsets for 4-directional neighbor access.
// Each entry is [dy, dx]: the first value offsets the grid's first axis (world y),
// the second value offsets the grid's second axis (world x).
export const DIR_OFFSETS = [
    // negative Y
    [-1, 0],
    // positive X
    [0, 1],
    // positive Y
    [1, 0],
    // negative X
    [0, -1],
];

export const getDirOffsetY = (dir: number): number => {
    return DIR_OFFSETS[dir & 0x03][0];
};

export const getDirOffsetX = (dir: number): number => {
    return DIR_OFFSETS[dir & 0x03][1];
};

export const getDirForOffset = (y: number, x: number): number => {
    for (let i = 0; i < DIR_OFFSETS.length; i++) {
        if (DIR_OFFSETS[i][0] === y && DIR_OFFSETS[i][1] === x) {
            return i;
        }
    }
    return 0; // Default to first direction if no match
};

export const AXIS_X = 0;
export const AXIS_Y = 1;
export const AXIS_Z = 2;

export const MULTIPLE_REGS = 0;
export const MESH_NULL_IDX = -1;
export const BORDER_VERTEX = 0x10000;
export const CONTOUR_REG_MASK = 0xffff;
export const AREA_BORDER = 0x20000;

export const NULL_AREA = 0;
export const WALKABLE_AREA = 1;
export const BORDER_REG = 0x8000;

export const NOT_CONNECTED = 0x3f; // 63
export const MAX_HEIGHT = 0xffff;
export const MAX_LAYERS = NOT_CONNECTED - 1;

/**
 * A flag that indicates that an entity links to an external enttity.
 * (E.g. A polygon edge is a portal that links to another polygon.)
 */
export const POLY_NEIS_FLAG_EXT_LINK = 0x8000;

/**
 * A mask for the direction of an external link.
 */
export const POLY_NEIS_FLAG_EXT_LINK_DIR_MASK = 0xff;
