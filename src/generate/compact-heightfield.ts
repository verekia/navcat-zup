import { box3, type Box3, type Vec3, vec3 } from 'mathcat';
import { pointInPoly } from '../geometry';
import { BuildContext, type BuildContextState } from './build-context';
import { DIR_OFFSETS, MAX_HEIGHT, MAX_LAYERS, NOT_CONNECTED, NULL_AREA } from './common';
import type { Heightfield } from './heightfield';

export type CompactHeightfieldSpan = {
    /** the lower extent of the span. measured from the heightfields base. */
    z: number;
    /** the id of the region the span belongs to, or zero if not in a region */
    region: number;
    /** packed neighbour connection data */
    con: number;
    /** the height of the span, measured from z */
    h: number;
};

export type CompactHeightfieldCell = {
    /** index to the first span in the column */
    index: number;
    /** number of spans in the column */
    count: number;
};

export type CompactHeightfield = {
    /** the width of the heightfield (along y axis in cell units) */
    width: number;
    /** the height of the heightfield (along x axis in cell units) */
    height: number;
    /** the number of spans in the heightfield */
    spanCount: number;
    /** the walkable height used during the build of the heightfield */
    walkableHeightVoxels: number;
    /** the walkable climb used during the build of the heightfield */
    walkableClimbVoxels: number;
    /** the AABB border size used during the build of the heightfield */
    borderSize: number;
    /** the maxiumum distance value of any span within the heightfield */
    maxDistance: number;
    /** the maximum region id of any span within the heightfield */
    maxRegions: number;
    /** the heightfield bounds in world space */
    bounds: Box3;
    /** the size of each cell */
    cellSize: number;
    /** the height of each cell */
    cellHeight: number;
    /** array of cells, size = width*height */
    cells: CompactHeightfieldCell[];
    /** array of spans, size = spanCount */
    spans: CompactHeightfieldSpan[];
    /** array containing area id data, size = spanCount */
    areas: number[];
    /** array containing distance field data, size = spanCount */
    distances: number[];
};

/**
 * Helper function to set connection data in a span
 */
export const setCon = (span: CompactHeightfieldSpan, dir: number, layerIndex: number) => {
    const shift = dir * 6; // 6 bits per direction
    const mask = 0x3f << shift; // 6-bit mask
    span.con = (span.con & ~mask) | ((layerIndex & 0x3f) << shift);
};

/**
 * Helper function to get connection data from a span
 */
export const getCon = (span: CompactHeightfieldSpan, dir: number): number => {
    const shift = dir * 6; // 6 bits per direction
    return (span.con >> shift) & 0x3f;
};

/**
 * Count the number of walkable spans in the heightfield
 */
const getHeightFieldSpanCount = (heightfield: Heightfield): number => {
    const numCols = heightfield.width * heightfield.height;
    let spanCount = 0;

    for (let columnIndex = 0; columnIndex < numCols; ++columnIndex) {
        let span = heightfield.spans[columnIndex];
        while (span !== null) {
            if (span.area !== NULL_AREA) {
                spanCount++;
            }
            span = span.next || null;
        }
    }

    return spanCount;
};

export const buildCompactHeightfield = (
    ctx: BuildContextState,
    walkableHeightVoxels: number,
    walkableClimbVoxels: number,
    heightfield: Heightfield,
): CompactHeightfield => {
    const ySize = heightfield.width;
    const xSize = heightfield.height;
    const spanCount = getHeightFieldSpanCount(heightfield);

    const compactHeightfield: CompactHeightfield = {
        width: ySize,
        height: xSize,
        spanCount,
        walkableHeightVoxels,
        walkableClimbVoxels,
        borderSize: 0,
        maxDistance: 0,
        maxRegions: 0,
        bounds: box3.clone(heightfield.bounds),
        cellSize: heightfield.cellSize,
        cellHeight: heightfield.cellHeight,
        cells: new Array(ySize * xSize),
        spans: new Array(spanCount),
        areas: new Array(spanCount),
        distances: new Array(spanCount).fill(0),
    };

    // adjust upper bound to account for walkable height
    compactHeightfield.bounds[5] += walkableHeightVoxels * heightfield.cellHeight;

    // initialize cells
    for (let i = 0; i < ySize * xSize; i++) {
        compactHeightfield.cells[i] = {
            index: 0,
            count: 0,
        };
    }

    // initialize spans
    for (let i = 0; i < spanCount; i++) {
        compactHeightfield.spans[i] = {
            z: 0,
            region: 0,
            con: 0,
            h: 0,
        };
        compactHeightfield.areas[i] = NULL_AREA;
    }

    // fill in cells and spans
    let currentCellIndex = 0;
    const numColumns = ySize * xSize;

    for (let columnIndex = 0; columnIndex < numColumns; ++columnIndex) {
        let span = heightfield.spans[columnIndex];

        // if there are no spans at this cell, just leave the data to index=0, count=0.
        if (span === null) {
            continue;
        }

        const cell = compactHeightfield.cells[columnIndex];
        cell.index = currentCellIndex;
        cell.count = 0;

        while (span !== null) {
            if (span.area !== NULL_AREA) {
                const bot = span.max;
                const top = span.next ? span.next.min : MAX_HEIGHT;

                compactHeightfield.spans[currentCellIndex].z = Math.min(Math.max(bot, 0), 0xffff);
                compactHeightfield.spans[currentCellIndex].h = Math.min(Math.max(top - bot, 0), 0xff);
                compactHeightfield.areas[currentCellIndex] = span.area;

                currentCellIndex++;
                cell.count++;
            }
            span = span.next || null;
        }
    }

    // find neighbour connections
    let maxLayerIndex = 0;
    const xStride = ySize;

    for (let x = 0; x < xSize; ++x) {
        for (let y = 0; y < ySize; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];

            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];

                for (let dir = 0; dir < 4; ++dir) {
                    setCon(span, dir, NOT_CONNECTED);

                    const neighborY = y + DIR_OFFSETS[dir][0];
                    const neighborX = x + DIR_OFFSETS[dir][1];

                    // first check that the neighbour cell is in bounds.
                    if (neighborY < 0 || neighborX < 0 || neighborY >= ySize || neighborX >= xSize) {
                        continue;
                    }

                    // iterate over all neighbour spans and check if any of them is
                    // accessible from current cell.
                    const neighborCell = compactHeightfield.cells[neighborY + neighborX * xStride];

                    for (let k = neighborCell.index; k < neighborCell.index + neighborCell.count; ++k) {
                        const neighborSpan = compactHeightfield.spans[k];
                        const bot = Math.max(span.z, neighborSpan.z);
                        const top = Math.min(span.z + span.h, neighborSpan.z + neighborSpan.h);

                        // check that the gap between the spans is walkable,
                        // and that the climb height between the gaps is not too high.
                        if (top - bot >= walkableHeightVoxels && Math.abs(neighborSpan.z - span.z) <= walkableClimbVoxels) {
                            // Mark direction as walkable.
                            const layerIndex = k - neighborCell.index;
                            if (layerIndex < 0 || layerIndex > MAX_LAYERS) {
                                maxLayerIndex = Math.max(maxLayerIndex, layerIndex);
                                continue;
                            }
                            setCon(span, dir, layerIndex);
                            break;
                        }
                    }
                }
            }
        }
    }

    if (maxLayerIndex > MAX_LAYERS) {
        BuildContext.warn(ctx, `buildCompactHeightfield: Heightfield has too many layers ${maxLayerIndex} (max: ${MAX_LAYERS})`);
    }

    return compactHeightfield;
};

const MAX_DISTANCE = 255;

/**
 * Computes a distance field for the compact heightfield.
 * Each span gets a distance value representing how far it is from any boundary or obstacle.
 * @returns A Uint8Array containing distance values for each span
 */
const computeDistanceToBoundary = (compactHeightfield: CompactHeightfield): Uint8Array => {
    const ySize = compactHeightfield.width;
    const xSize = compactHeightfield.height;
    const xStride = ySize; // for readability

    // initialize distance array
    const distanceToBoundary = new Uint8Array(compactHeightfield.spanCount);
    distanceToBoundary.fill(MAX_DISTANCE);

    // mark boundary cells
    for (let x = 0; x < xSize; ++x) {
        for (let y = 0; y < ySize; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            for (let spanIndex = cell.index; spanIndex < cell.index + cell.count; ++spanIndex) {
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    distanceToBoundary[spanIndex] = 0;
                    continue;
                }

                const span = compactHeightfield.spans[spanIndex];

                // check that there is a non-null adjacent span in each of the 4 cardinal directions
                let neighborCount = 0;
                for (let direction = 0; direction < 4; ++direction) {
                    const neighborConnection = getCon(span, direction);
                    if (neighborConnection === NOT_CONNECTED) {
                        break;
                    }

                    const neighborY = y + DIR_OFFSETS[direction][0];
                    const neighborX = x + DIR_OFFSETS[direction][1];
                    const neighborSpanIndex =
                        compactHeightfield.cells[neighborY + neighborX * xStride].index + neighborConnection;

                    if (compactHeightfield.areas[neighborSpanIndex] === NULL_AREA) {
                        break;
                    }
                    neighborCount++;
                }

                // at least one missing neighbour, so this is a boundary cell
                if (neighborCount !== 4) {
                    distanceToBoundary[spanIndex] = 0;
                }
            }
        }
    }

    // pass 1: Forward pass (top-left to bottom-right)
    for (let x = 0; x < xSize; ++x) {
        for (let y = 0; y < ySize; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                if (getCon(span, 0) !== NOT_CONNECTED) {
                    // (-1,0) - West neighbor
                    const aY = y + DIR_OFFSETS[0][0];
                    const aX = x + DIR_OFFSETS[0][1];
                    const aIndex = compactHeightfield.cells[aY + aX * ySize].index + getCon(span, 0);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(distanceToBoundary[aIndex] + 2, 255);
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (-1,-1) - Northwest diagonal
                    if (getCon(aSpan, 3) !== NOT_CONNECTED) {
                        const bY = aY + DIR_OFFSETS[3][0];
                        const bX = aX + DIR_OFFSETS[3][1];
                        const bIndex = compactHeightfield.cells[bY + bX * ySize].index + getCon(aSpan, 3);
                        newDistance = Math.min(distanceToBoundary[bIndex] + 3, 255);
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }

                if (getCon(span, 3) !== NOT_CONNECTED) {
                    // (0,-1) - North neighbor
                    const aY = y + DIR_OFFSETS[3][0];
                    const aX = x + DIR_OFFSETS[3][1];
                    const aIndex = compactHeightfield.cells[aY + aX * ySize].index + getCon(span, 3);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(distanceToBoundary[aIndex] + 2, 255);
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (1,-1) - Northeast diagonal
                    if (getCon(aSpan, 2) !== NOT_CONNECTED) {
                        const bY = aY + DIR_OFFSETS[2][0];
                        const bX = aX + DIR_OFFSETS[2][1];
                        const bIndex = compactHeightfield.cells[bY + bX * ySize].index + getCon(aSpan, 2);
                        newDistance = Math.min(distanceToBoundary[bIndex] + 3, 255);
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }
            }
        }
    }

    // pass 2: Backward pass (bottom-right to top-left)
    for (let x = xSize - 1; x >= 0; --x) {
        for (let y = ySize - 1; y >= 0; --y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                if (getCon(span, 2) !== NOT_CONNECTED) {
                    // (1,0) - East neighbor
                    const aY = y + DIR_OFFSETS[2][0];
                    const aX = x + DIR_OFFSETS[2][1];
                    const aIndex = compactHeightfield.cells[aY + aX * ySize].index + getCon(span, 2);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(distanceToBoundary[aIndex] + 2, 255);
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (1,1) - Southeast diagonal
                    if (getCon(aSpan, 1) !== NOT_CONNECTED) {
                        const bY = aY + DIR_OFFSETS[1][0];
                        const bX = aX + DIR_OFFSETS[1][1];
                        const bIndex = compactHeightfield.cells[bY + bX * ySize].index + getCon(aSpan, 1);
                        newDistance = Math.min(distanceToBoundary[bIndex] + 3, 255);
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }

                if (getCon(span, 1) !== NOT_CONNECTED) {
                    // (0,1) - South neighbor
                    const aY = y + DIR_OFFSETS[1][0];
                    const aX = x + DIR_OFFSETS[1][1];
                    const aIndex = compactHeightfield.cells[aY + aX * ySize].index + getCon(span, 1);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(distanceToBoundary[aIndex] + 2, 255);
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (-1,1) - Southwest diagonal
                    if (getCon(aSpan, 0) !== NOT_CONNECTED) {
                        const bY = aY + DIR_OFFSETS[0][0];
                        const bX = aX + DIR_OFFSETS[0][1];
                        const bIndex = compactHeightfield.cells[bY + bX * ySize].index + getCon(aSpan, 0);
                        newDistance = Math.min(distanceToBoundary[bIndex] + 3, 255);
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }
            }
        }
    }

    return distanceToBoundary;
};

export const erodeWalkableArea = (walkableRadiusVoxels: number, compactHeightfield: CompactHeightfield) => {
    const distanceToBoundary = computeDistanceToBoundary(compactHeightfield);

    // erode areas that are too close to boundaries
    const minBoundaryDistance = walkableRadiusVoxels * 2;
    for (let spanIndex = 0; spanIndex < compactHeightfield.spanCount; ++spanIndex) {
        if (distanceToBoundary[spanIndex] < minBoundaryDistance) {
            compactHeightfield.areas[spanIndex] = NULL_AREA;
        }
    }
};

/**
 * Erodes the walkable area for a base agent radius and marks restricted areas for larger agents based on given walkable radius thresholds.
 *
 * Note that this function requires careful tuning of the build parameters to get a good result:
 * - The cellSize needs to be small enough to accurately represent narrow passages. Generally you need to use smaller cellSizes than you otherwise would for single agent navmesh builds.
 * - The thresholds should not be so small that the resulting regions are too small to successfully build good navmesh polygons for. Values like 1-2 voxels will likely lead to poor results.
 * - You may get a better result using "buildRegionsMonotone" over "buildRegions" as this will better handle the many small clusters of areas that may be created from smaller thresholds.
 *
 * A typical workflow for using this utility to implement multi-agent support:
 * 1. Call erodeAndMarkWalkableAreas with your smallest agent radius and list of restricted areas
 * 2. Continue with buildDistanceField, buildRegionsMonotone, etc.
 * 3. Configure query filters so large agents exclude the narrow/restricted area IDs
 *
 * @param baseWalkableRadiusVoxels the smallest agent radius in voxels (used for erosion)
 * @param thresholds array of area ids and their corresponding walkable radius in voxels.
 * @param compactHeightfield the compact heightfield to process
 */
export const erodeAndMarkWalkableAreas = (
    baseWalkableRadiusVoxels: number,
    thresholds: Array<{ areaId: number; walkableRadiusVoxels: number }>,
    compactHeightfield: CompactHeightfield,
) => {
    // compute distance field once for both operations
    const distanceToBoundary = computeDistanceToBoundary(compactHeightfield);

    // sort thresholds by radius (smallest first) - we want to mark narrowest corridors first
    const sortedThresholds = [...thresholds].sort((a, b) => a.walkableRadiusVoxels - b.walkableRadiusVoxels);

    const baseMinDistance = baseWalkableRadiusVoxels * 2;

    // process each span
    for (let spanIndex = 0; spanIndex < compactHeightfield.spanCount; ++spanIndex) {
        const distance = distanceToBoundary[spanIndex];

        // first, check if this span should be eroded (removed) based on base agent radius
        if (distance < baseMinDistance) {
            compactHeightfield.areas[spanIndex] = NULL_AREA;
            continue;
        }

        // span survived base erosion, now check if it should be marked
        for (const config of sortedThresholds) {
            const minDistance = config.walkableRadiusVoxels * 2;

            if (distance < minDistance) {
                // this span is too narrow for this agent size
                // mark it with the area id
                compactHeightfield.areas[spanIndex] = config.areaId;
                break; // once marked, we're done with this span
            }
        }

        // if the span wasn't eroded or marked, it remains in its current area
    }
};

/**
 * Marks spans in the heightfield that intersect the specified box area with the given area ID.
 */
export const markBoxArea = (bounds: Box3, areaId: number, compactHeightfield: CompactHeightfield) => {
    const ySize = compactHeightfield.width;
    const xSize = compactHeightfield.height;
    const xStride = ySize; // For readability

    // Find the footprint of the box area in grid cell coordinates.
    let minY = Math.floor((bounds[1] - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const minZ = Math.floor((bounds[2] - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let minX = Math.floor((bounds[0] - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);
    let maxY = Math.floor((bounds[4] - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const maxZ = Math.floor((bounds[5] - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let maxX = Math.floor((bounds[3] - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);

    // Early-out if the box is outside the bounds of the grid.
    if (maxY < 0) return;
    if (minY >= ySize) return;
    if (maxX < 0) return;
    if (minX >= xSize) return;

    // Clamp relevant bound coordinates to the grid.
    if (minY < 0) minY = 0;
    if (maxY >= ySize) maxY = ySize - 1;
    if (minX < 0) minX = 0;
    if (maxX >= xSize) maxX = xSize - 1;

    // Mark relevant cells.
    for (let x = minX; x <= maxX; ++x) {
        for (let y = minY; y <= maxY; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                // Skip if the span is outside the box extents.
                if (span.z < minZ || span.z > maxZ) {
                    continue;
                }

                // Skip if the span has been removed.
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    continue;
                }

                // Mark the span.
                compactHeightfield.areas[spanIndex] = areaId;
            }
        }
    }
};

/**
 * Marks spans in the heightfield that intersect the specified rotated box area with the given area ID.
 * @param center - The center point of the box in world space [x, y, z]
 * @param halfExtents - Half extents of the box along each axis [x, y, z]
 * @param angleRadians - Rotation angle in radians around the Z axis
 * @param areaId - The area ID to assign to intersecting spans
 * @param compactHeightfield - The compact heightfield to mark
 */
export const markRotatedBoxArea = (
    center: Vec3,
    halfExtents: Vec3,
    angleRadians: number,
    areaId: number,
    compactHeightfield: CompactHeightfield,
) => {
    const ySize = compactHeightfield.width;
    const xSize = compactHeightfield.height;
    const xStride = ySize; // for readability

    // precompute sin and cos for rotation
    const cosAngle = Math.cos(angleRadians);
    const sinAngle = Math.sin(angleRadians);

    // compute the 4 corners of the rotated box in the XY plane and find AABB
    // the corners in local space are at (±halfExtents[1], ±halfExtents[0])
    const hy = halfExtents[1];
    const hx = halfExtents[0];

    // corner 1: (-hy, -hx)
    let worldY = center[1] + cosAngle * -hy - sinAngle * -hx;
    let worldX = center[0] + sinAngle * -hy + cosAngle * -hx;
    let minWorldY = worldY;
    let maxWorldY = worldY;
    let minWorldX = worldX;
    let maxWorldX = worldX;

    // corner 2: (hy, -hx)
    worldY = center[1] + cosAngle * hy - sinAngle * -hx;
    worldX = center[0] + sinAngle * hy + cosAngle * -hx;
    minWorldY = Math.min(minWorldY, worldY);
    maxWorldY = Math.max(maxWorldY, worldY);
    minWorldX = Math.min(minWorldX, worldX);
    maxWorldX = Math.max(maxWorldX, worldX);

    // corner 3: (hy, hx)
    worldY = center[1] + cosAngle * hy - sinAngle * hx;
    worldX = center[0] + sinAngle * hy + cosAngle * hx;
    minWorldY = Math.min(minWorldY, worldY);
    maxWorldY = Math.max(maxWorldY, worldY);
    minWorldX = Math.min(minWorldX, worldX);
    maxWorldX = Math.max(maxWorldX, worldX);

    // corner 4: (-hy, hx)
    worldY = center[1] + cosAngle * -hy - sinAngle * hx;
    worldX = center[0] + sinAngle * -hy + cosAngle * hx;
    minWorldY = Math.min(minWorldY, worldY);
    maxWorldY = Math.max(maxWorldY, worldY);
    minWorldX = Math.min(minWorldX, worldX);
    maxWorldX = Math.max(maxWorldX, worldX);

    // compute Z extents in world space
    const minWorldZ = center[2] - halfExtents[2];
    const maxWorldZ = center[2] + halfExtents[2];

    // convert AABB to grid coordinates
    let minY = Math.floor((minWorldY - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const minZ = Math.floor((minWorldZ - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let minX = Math.floor((minWorldX - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);
    let maxY = Math.floor((maxWorldY - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const maxZ = Math.floor((maxWorldZ - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let maxX = Math.floor((maxWorldX - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);

    // early-out if the rotated box AABB is outside the grid bounds
    if (maxY < 0) return;
    if (minY >= ySize) return;
    if (maxX < 0) return;
    if (minX >= xSize) return;

    // clamp to grid bounds
    if (minY < 0) minY = 0;
    if (maxY >= ySize) maxY = ySize - 1;
    if (minX < 0) minX = 0;
    if (maxX >= xSize) maxX = xSize - 1;

    // iterate through cells in the AABB
    for (let x = minX; x <= maxX; ++x) {
        for (let y = minY; y <= maxY; ++y) {
            // calculate cell center in world space
            const cellWorldY = compactHeightfield.bounds[1] + (y + 0.5) * compactHeightfield.cellSize;
            const cellWorldX = compactHeightfield.bounds[0] + (x + 0.5) * compactHeightfield.cellSize;

            // transform cell center to box's local coordinate system
            // first translate to box origin
            const dy = cellWorldY - center[1];
            const dx = cellWorldX - center[0];

            // then apply inverse rotation (rotation by -angleRadians)
            // inverse rotation matrix for Z-axis: [cos(θ), -sin(θ); sin(θ), cos(θ)]
            const localY = cosAngle * dy - sinAngle * dx;
            const localX = sinAngle * dy + cosAngle * dx;

            // check if the point is inside the box in local space
            if (Math.abs(localY) > halfExtents[1] || Math.abs(localX) > halfExtents[0]) {
                continue;
            }

            // cell is inside the rotated box, mark its spans
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                // skip if the span is outside the Z extents
                if (span.z < minZ || span.z > maxZ) {
                    continue;
                }

                // skip if the span has been removed
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    continue;
                }

                // mark the span
                compactHeightfield.areas[spanIndex] = areaId;
            }
        }
    }
};

const _markConvexPolyArea_point = vec3.create();

/**
 * Marks spans in the heightfield that intersect the specified convex polygon area with the given area ID.
 */
export const markConvexPolyArea = (
    verts: number[],
    minZ: number,
    maxZ: number,
    areaId: number,
    compactHeightfield: CompactHeightfield,
) => {
    const ySize = compactHeightfield.width;
    const xSize = compactHeightfield.height;
    const xStride = ySize; // for readability

    // compute the bounding box of the polygon
    const bmin = [verts[0], verts[1], minZ];
    const bmax = [verts[0], verts[1], maxZ];

    const numVerts = verts.length / 3;
    for (let i = 1; i < numVerts; ++i) {
        const vertIndex = i * 3;
        bmin[1] = Math.min(bmin[1], verts[vertIndex + 1]);
        bmin[0] = Math.min(bmin[0], verts[vertIndex]);
        bmax[1] = Math.max(bmax[1], verts[vertIndex + 1]);
        bmax[0] = Math.max(bmax[0], verts[vertIndex]);
    }

    // compute the grid footprint of the polygon
    let miny = Math.floor((bmin[1] - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const minz = Math.floor((bmin[2] - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let minx = Math.floor((bmin[0] - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);
    let maxy = Math.floor((bmax[1] - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const maxz = Math.floor((bmax[2] - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let maxx = Math.floor((bmax[0] - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);

    // early-out if the polygon lies entirely outside the grid.
    if (maxy < 0) return;
    if (miny >= ySize) return;
    if (maxx < 0) return;
    if (minx >= xSize) return;

    // clamp the polygon footprint to the grid
    if (miny < 0) miny = 0;
    if (maxy >= ySize) maxy = ySize - 1;
    if (minx < 0) minx = 0;
    if (maxx >= xSize) maxx = xSize - 1;

    // TODO: optimize.
    for (let x = minx; x <= maxx; ++x) {
        for (let y = miny; y <= maxy; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                // skip if span is removed.
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    continue;
                }

                // skip if z extents don't overlap.
                if (span.z < minz || span.z > maxz) {
                    continue;
                }

                const point = vec3.set(
                    _markConvexPolyArea_point,
                    compactHeightfield.bounds[0] + (x + 0.5) * compactHeightfield.cellSize,
                    compactHeightfield.bounds[1] + (y + 0.5) * compactHeightfield.cellSize,
                    0,
                );

                if (pointInPoly(point, verts, numVerts)) {
                    compactHeightfield.areas[spanIndex] = areaId;
                }
            }
        }
    }
};

/**
 * Marks spans in the heightfield that intersect the specified cylinder area with the given area ID.
 */
export const markCylinderArea = (
    position: Vec3,
    radius: number,
    height: number,
    areaId: number,
    compactHeightfield: CompactHeightfield,
) => {
    const ySize = compactHeightfield.width;
    const xSize = compactHeightfield.height;
    const xStride = ySize; // for readability

    // compute the bounding box of the cylinder
    const cylinderBBMin = [position[0] - radius, position[1] - radius, position[2]];
    const cylinderBBMax = [position[0] + radius, position[1] + radius, position[2] + height];

    // compute the grid footprint of the cylinder
    let miny = Math.floor((cylinderBBMin[1] - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const minz = Math.floor((cylinderBBMin[2] - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let minx = Math.floor((cylinderBBMin[0] - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);
    let maxy = Math.floor((cylinderBBMax[1] - compactHeightfield.bounds[1]) / compactHeightfield.cellSize);
    const maxz = Math.floor((cylinderBBMax[2] - compactHeightfield.bounds[2]) / compactHeightfield.cellHeight);
    let maxx = Math.floor((cylinderBBMax[0] - compactHeightfield.bounds[0]) / compactHeightfield.cellSize);

    // early-out if the cylinder is completely outside the grid bounds.
    if (maxy < 0 || miny >= ySize || maxx < 0 || minx >= xSize) {
        return;
    }

    // clamp the cylinder bounds to the grid.
    if (miny < 0) miny = 0;
    if (maxy >= ySize) maxy = ySize - 1;
    if (minx < 0) minx = 0;
    if (maxx >= xSize) maxx = xSize - 1;

    const radiusSq = radius * radius;

    for (let x = minx; x <= maxx; ++x) {
        for (let y = miny; y <= maxy; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            const cellY = compactHeightfield.bounds[1] + (y + 0.5) * compactHeightfield.cellSize;
            const cellX = compactHeightfield.bounds[0] + (x + 0.5) * compactHeightfield.cellSize;
            const deltaY = cellY - position[1];
            const deltaX = cellX - position[0];

            // skip this column if it's too far from the center point of the cylinder.
            if (deltaY * deltaY + deltaX * deltaX >= radiusSq) {
                continue;
            }

            // mark all overlapping spans
            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                // skip if span is removed.
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    continue;
                }

                // mark if z extents overlap.
                if (span.z >= minz && span.z <= maxz) {
                    compactHeightfield.areas[spanIndex] = areaId;
                }
            }
        }
    }
};

/**
 * Helper function to perform insertion sort on a small array
 */
const insertSort = (arr: number[], length: number) => {
    for (let i = 1; i < length; ++i) {
        const key = arr[i];
        let j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
};

const _neighborAreas = new Array(9);

/**
 * Applies a median filter to walkable area types (based on area id), removing noise.
 * filter is usually applied after applying area id's using functions
 * such as #markBoxArea, #markConvexPolyArea, and #markCylinderArea.
 */
export const medianFilterWalkableArea = (compactHeightfield: CompactHeightfield): boolean => {
    const ySize = compactHeightfield.width;
    const xSize = compactHeightfield.height;
    const xStride = ySize; // for readability

    // create a temporary array to store the filtered areas
    const areas = new Uint8Array(compactHeightfield.spanCount);
    areas.fill(0xff);

    for (let x = 0; x < xSize; ++x) {
        for (let y = 0; y < ySize; ++y) {
            const cell = compactHeightfield.cells[y + x * xStride];
            const maxSpanIndex = cell.index + cell.count;

            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    areas[spanIndex] = compactHeightfield.areas[spanIndex];
                    continue;
                }

                // collect neighbor areas (including center cell)
                for (let neighborIndex = 0; neighborIndex < 9; ++neighborIndex) {
                    _neighborAreas[neighborIndex] = compactHeightfield.areas[spanIndex];
                }

                // check all 4 cardinal directions
                for (let dir = 0; dir < 4; ++dir) {
                    if (getCon(span, dir) === NOT_CONNECTED) {
                        continue;
                    }

                    const aY = y + DIR_OFFSETS[dir][0];
                    const aX = x + DIR_OFFSETS[dir][1];
                    const aIndex = compactHeightfield.cells[aY + aX * xStride].index + getCon(span, dir);

                    if (compactHeightfield.areas[aIndex] !== NULL_AREA) {
                        _neighborAreas[dir * 2 + 0] = compactHeightfield.areas[aIndex];
                    }

                    // check diagonal neighbor
                    const aSpan = compactHeightfield.spans[aIndex];
                    const dir2 = (dir + 1) & 0x3;
                    const neighborConnection2 = getCon(aSpan, dir2);

                    if (neighborConnection2 !== NOT_CONNECTED) {
                        const bY = aY + DIR_OFFSETS[dir2][0];
                        const bX = aX + DIR_OFFSETS[dir2][1];
                        const bIndex = compactHeightfield.cells[bY + bX * xStride].index + neighborConnection2;

                        if (compactHeightfield.areas[bIndex] !== NULL_AREA) {
                            _neighborAreas[dir * 2 + 1] = compactHeightfield.areas[bIndex];
                        }
                    }
                }

                // sort and take median (middle value)
                insertSort(_neighborAreas, 9);
                areas[spanIndex] = _neighborAreas[4];
            }
        }
    }

    // Copy filtered areas back to the heightfield
    for (let i = 0; i < compactHeightfield.spanCount; ++i) {
        compactHeightfield.areas[i] = areas[i];
    }

    return true;
};
