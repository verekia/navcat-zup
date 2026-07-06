import type { Vec2, Vec3 } from 'mathcat';
import { vec2, vec3 } from 'mathcat';

const EPS = 1e-6;

/**
 * Calculates the closest point on a line segment to a given point in 2D (XY plane)
 * @param out Output parameter for the closest point
 * @param pt The point
 * @param p First endpoint of the segment
 * @param q Second endpoint of the segment
 */
export const closestPtSeg2d = (out: Vec3, pt: Vec3, p: Vec3, q: Vec3): void => {
    const pqy = q[1] - p[1];
    const pqx = q[0] - p[0];
    const dy = pt[1] - p[1];
    const dx = pt[0] - p[0];

    const d = pqy * pqy + pqx * pqx;
    let t = pqy * dy + pqx * dx;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    out[1] = p[1] + t * pqy;
    out[2] = p[2]; // keep original Z value from p
    out[0] = p[0] + t * pqx;
};

/**
 * Tests if a point is inside a polygon in 2D (XY plane)
 */
export const pointInPoly = (point: Vec3, vertices: number[], nVertices: number): boolean => {
    let inside = false;
    const y = point[1];
    const x = point[0];

    for (let l = nVertices, i = 0, j = l - 1; i < l; j = i++) {
        const yj = vertices[j * 3 + 1],
            xj = vertices[j * 3],
            yi = vertices[i * 3 + 1],
            xi = vertices[i * 3];
        const where = (xi - xj) * (y - yi) - (yi - yj) * (x - xi);
        if (xj < xi) {
            if (x >= xj && x < xi) {
                if (where === 0) {
                    // point on the line
                    return true;
                }
                if (where > 0) {
                    if (x === xj) {
                        // ray intersects vertex
                        if (x > vertices[(j === 0 ? l - 1 : j - 1) * 3]) {
                            inside = !inside;
                        }
                    } else {
                        inside = !inside;
                    }
                }
            }
        } else if (xi < xj) {
            if (x > xi && x <= xj) {
                if (where === 0) {
                    // point on the line
                    return true;
                }
                if (where < 0) {
                    if (x === xj) {
                        // ray intersects vertex
                        if (x < vertices[(j === 0 ? l - 1 : j - 1) * 3]) {
                            inside = !inside;
                        }
                    } else {
                        inside = !inside;
                    }
                }
            }
        } else if (x === xi && ((y >= yj && y <= yi) || (y >= yi && y <= yj))) {
            // point on horizontal edge
            return true;
        }
    }

    return inside;
};

const _distPtTriV0: Vec3 = vec3.create();
const _distPtTriV1: Vec3 = vec3.create();
const _distPtTriV2: Vec3 = vec3.create();

const _distPtTriVec0: Vec2 = vec2.create();
const _distPtTriVec1: Vec2 = vec2.create();
const _distPtTriVec2: Vec2 = vec2.create();

export const distPtTri = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): number => {
    const v0 = _distPtTriV0;
    const v1 = _distPtTriV1;
    const v2 = _distPtTriV2;

    vec3.subtract(v0, c, a);
    vec3.subtract(v1, b, a);
    vec3.subtract(v2, p, a);

    _distPtTriVec0[0] = v0[1];
    _distPtTriVec0[1] = v0[0];

    _distPtTriVec1[0] = v1[1];
    _distPtTriVec1[1] = v1[0];

    _distPtTriVec2[0] = v2[1];
    _distPtTriVec2[1] = v2[0];

    const dot00 = vec2.dot(_distPtTriVec0, _distPtTriVec0);
    const dot01 = vec2.dot(_distPtTriVec0, _distPtTriVec1);
    const dot02 = vec2.dot(_distPtTriVec0, _distPtTriVec2);
    const dot11 = vec2.dot(_distPtTriVec1, _distPtTriVec1);
    const dot12 = vec2.dot(_distPtTriVec1, _distPtTriVec2);

    // Compute barycentric coordinates
    const invDenom = 1.0 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    // If point lies inside the triangle, return interpolated z-coord.
    const EPS_TRI = 1e-4;
    if (u >= -EPS_TRI && v >= -EPS_TRI && u + v <= 1 + EPS_TRI) {
        const z = a[2] + v0[2] * u + v1[2] * v;
        return Math.abs(z - p[2]);
    }
    return Number.MAX_VALUE;
};

const _distPtSegP: Vec3 = vec3.create();
const _distPtSegQ: Vec3 = vec3.create();

export const distancePtSeg = (pt: Vec3, p: Vec3, q: Vec3): number => {
    const pq = _distPtSegP;
    const d_vec = _distPtSegQ;

    vec3.subtract(pq, q, p); // pq = q - p
    vec3.subtract(d_vec, pt, p); // d_vec = pt - p

    const d = vec3.dot(pq, pq);
    let t = vec3.dot(pq, d_vec);
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    // calculate closest point on segment: p + t * pq
    vec3.scale(pq, pq, t);
    vec3.add(pq, p, pq);

    // calculate distance vector: closest_point - pt
    vec3.subtract(pq, pq, pt);

    return vec3.dot(pq, pq); // return squared distance
};

export type DistPtSeg2dResult = { dist: number; t: number };

export const createDistPtSeg2dResult = (): DistPtSeg2dResult => ({
    dist: 0,
    t: 0,
});

export const distancePtSeg2d = (out: DistPtSeg2dResult, pt: Vec3, p: Vec3, q: Vec3) => {
    const pqy = q[1] - p[1];
    const pqx = q[0] - p[0];
    const dy = pt[1] - p[1];
    const dx = pt[0] - p[0];

    const d = pqy * pqy + pqx * pqx;
    let t = pqy * dy + pqx * dx;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const closeDy = p[1] + t * pqy - pt[1];
    const closeDx = p[0] + t * pqx - pt[0];

    const dist = closeDy * closeDy + closeDx * closeDx;

    out.dist = dist;
    out.t = t;
    return out;
};

export type DistancePtSegSqr2dResult = { distSqr: number; t: number };

export const createDistancePtSegSqr2dResult = (): DistancePtSegSqr2dResult => ({
    distSqr: 0,
    t: 0,
});

export const distancePtSegSqr2d = (out: DistancePtSegSqr2dResult, pt: Vec3, p: Vec3, q: Vec3) => {
    const pqy = q[1] - p[1];
    const pqx = q[0] - p[0];
    const dy = pt[1] - p[1];
    const dx = pt[0] - p[0];

    const d = pqy * pqy + pqx * pqx;
    let t = pqy * dy + pqx * dx;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const closestY = p[1] + t * pqy;
    const closestX = p[0] + t * pqx;

    const distY = closestY - pt[1];
    const distX = closestX - pt[0];

    const distSqr = distY * distY + distX * distX;

    out.distSqr = distSqr;
    out.t = t;

    return out;
};

const _distPtTriA: Vec3 = vec3.create();
const _distPtTriB: Vec3 = vec3.create();
const _distPtTriC: Vec3 = vec3.create();

export const distToTriMesh = (p: Vec3, verts: number[], tris: number[], ntris: number): number => {
    let dmin = Number.MAX_VALUE;
    for (let i = 0; i < ntris; ++i) {
        const va = tris[i * 4 + 0] * 3;
        const vb = tris[i * 4 + 1] * 3;
        const vc = tris[i * 4 + 2] * 3;

        vec3.fromBuffer(_distPtTriA, verts, va);
        vec3.fromBuffer(_distPtTriB, verts, vb);
        vec3.fromBuffer(_distPtTriC, verts, vc);

        const d = distPtTri(p, _distPtTriA, _distPtTriB, _distPtTriC);
        if (d < dmin) dmin = d;
    }
    if (dmin === Number.MAX_VALUE) return -1;
    return dmin;
};

const _distToPolyVj: Vec3 = vec3.create();
const _distToPolyVi: Vec3 = vec3.create();
const _distToPoly_distPtSeg2dResult = createDistPtSeg2dResult();

export const distToPoly = (nvert: number, verts: number[], p: Vec3): number => {
    let dmin = Number.MAX_VALUE;
    let c = 0;

    for (let i = 0, j = nvert - 1; i < nvert; j = i++) {
        const vi = i * 3;
        const vj = j * 3;
        if (
            verts[vi] > p[0] !== verts[vj] > p[0] &&
            p[1] < ((verts[vj + 1] - verts[vi + 1]) * (p[0] - verts[vi])) / (verts[vj] - verts[vi]) + verts[vi + 1]
        ) {
            c = c === 0 ? 1 : 0;
        }

        vec3.fromBuffer(_distToPolyVj, verts, vj);
        vec3.fromBuffer(_distToPolyVi, verts, vi);

        distancePtSeg2d(_distToPoly_distPtSeg2dResult, p, _distToPolyVj, _distToPolyVi);
        dmin = Math.min(dmin, _distToPoly_distPtSeg2dResult.dist);
    }
    return c ? -dmin : dmin;
};

/**
 * Calculates the closest height point on a triangle using barycentric coordinates.
 * @param p The point to project
 * @param a First triangle vertex
 * @param b Second triangle vertex
 * @param c Third triangle vertex
 * @returns Height at position, or NaN if point is not inside triangle
 */
export const closestHeightPointTriangle = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): number => {
    const v0y = c[1] - a[1];
    const v0z = c[2] - a[2];
    const v0x = c[0] - a[0];

    const v1y = b[1] - a[1];
    const v1z = b[2] - a[2];
    const v1x = b[0] - a[0];

    const v2y = p[1] - a[1];
    const v2x = p[0] - a[0];

    // Compute scaled barycentric coordinates
    let denom = v0y * v1x - v0x * v1y;
    if (Math.abs(denom) < EPS) {
        return NaN;
    }

    let u = v1x * v2y - v1y * v2x;
    let v = v0y * v2x - v0x * v2y;

    if (denom < 0) {
        denom = -denom;
        u = -u;
        v = -v;
    }

    // If point lies inside the triangle, return interpolated zcoord.
    if (u >= 0.0 && v >= 0.0 && u + v <= denom) {
        return a[2] + (v0z * u + v1z * v) / denom;
    }

    return NaN;
};

const _overlapSegAB: Vec2 = vec2.create();
const _overlapSegAD: Vec2 = vec2.create();
const _overlapSegAC: Vec2 = vec2.create();
const _overlapSegCD: Vec2 = vec2.create();
const _overlapSegCA: Vec2 = vec2.create();

export const overlapSegSeg2d = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
    // calculate cross products for line segment intersection test
    const ab = _overlapSegAB;
    const ad = _overlapSegAD;
    const ac = _overlapSegAC;

    vec2.subtract(ab, b, a); // b - a
    vec2.subtract(ad, d, a); // d - a
    const a1 = ab[0] * ad[1] - ab[1] * ad[0];

    vec2.subtract(ac, c, a); // c - a
    const a2 = ab[0] * ac[1] - ab[1] * ac[0];

    if (a1 * a2 < 0.0) {
        const cd = _overlapSegCD;
        const ca = _overlapSegCA;

        vec2.subtract(cd, d, c); // d - c
        vec2.subtract(ca, a, c); // a - c
        const a3 = cd[0] * ca[1] - cd[1] * ca[0];
        const a4 = a3 + a2 - a1;
        if (a3 * a4 < 0.0) return true;
    }
    return false;
};

/**
 * 2D signed area in XY plane (positive if c is to the left of ab)
 */
export const triArea2D = (a: Vec3, b: Vec3, c: Vec3): number => {
    const aby = b[1] - a[1];
    const abx = b[0] - a[0];
    const acy = c[1] - a[1];
    const acx = c[0] - a[0];
    return acy * abx - aby * acx;
};

export type IntersectSegSeg2DResult = { hit: boolean; s: number; t: number };

export const createIntersectSegSeg2DResult = (): IntersectSegSeg2DResult => ({
    hit: false,
    s: 0,
    t: 0,
});

/**
 * Segment-segment intersection in XY plane.
 * Returns { hit, s, t } where
 *  P = a + s*(b-a) and Q = c + t*(d-c). Hit only if both s and t are within [0,1].
 */
export const intersectSegSeg2D = (out: IntersectSegSeg2DResult, a: Vec3, b: Vec3, c: Vec3, d: Vec3): IntersectSegSeg2DResult => {
    const bay = b[1] - a[1];
    const bax = b[0] - a[0];
    const dcy = d[1] - c[1];
    const dcx = d[0] - c[0];
    const acy = a[1] - c[1];
    const acx = a[0] - c[0];
    const denom = dcx * bay - dcy * bax;
    if (Math.abs(denom) < 1e-12) {
        out.hit = false;
        out.s = 0;
        out.t = 0;
        return out;
    }
    const s = (dcy * acx - dcx * acy) / denom;
    const t = (bay * acx - bax * acy) / denom;
    const hit = !(s < 0 || s > 1 || t < 0 || t > 1);
    out.hit = hit;
    out.s = s;
    out.t = t;
    return out;
};

const _polyMinExtentPt: Vec3 = vec3.create();
const _polyMinExtentP1: Vec3 = vec3.create();
const _polyMinExtentP2: Vec3 = vec3.create();
const _polyMinExtent_distPtSeg2dResult = createDistPtSeg2dResult();

// calculate minimum extend of the polygon.
export const polyMinExtent = (verts: number[], nverts: number): number => {
    let minDist = Number.MAX_VALUE;

    for (let i = 0; i < nverts; i++) {
        const ni = (i + 1) % nverts;
        const p1 = i * 3;
        const p2 = ni * 3;
        let maxEdgeDist = 0;
        for (let j = 0; j < nverts; j++) {
            if (j === i || j === ni) continue;

            const ptIdx = j * 3;
            vec3.fromBuffer(_polyMinExtentPt, verts, ptIdx);
            vec3.fromBuffer(_polyMinExtentP1, verts, p1);
            vec3.fromBuffer(_polyMinExtentP2, verts, p2);

            distancePtSeg2d(_polyMinExtent_distPtSeg2dResult, _polyMinExtentPt, _polyMinExtentP1, _polyMinExtentP2);
            maxEdgeDist = Math.max(maxEdgeDist, _polyMinExtent_distPtSeg2dResult.dist);
        }
        minDist = Math.min(minDist, maxEdgeDist);
    }

    return Math.sqrt(minDist);
};

/**
 * Derives the xy-plane 2D perp product of the two vectors. (ux*vy - uy*vx)
 * The vectors are projected onto the xy-plane, so the z-values are ignored.
 * @param u The LHV vector [(y, z, x)]
 * @param v The RHV vector [(y, z, x)]
 * @returns The perp dot product on the xz-plane.
 */
const vperp2D = (u: Vec3, v: Vec3): number => {
    return u[0] * v[1] - u[1] * v[0];
};

export type IntersectSegmentPoly2DResult = {
    intersects: boolean;
    tmin: number;
    tmax: number;
    segMin: number;
    segMax: number;
};

export const createIntersectSegmentPoly2DResult = (): IntersectSegmentPoly2DResult => ({
    intersects: false,
    tmin: 0,
    tmax: 0,
    segMin: -1,
    segMax: -1,
});

const _intersectSegmentPoly2DVi = vec3.create();
const _intersectSegmentPoly2DVj = vec3.create();
const _intersectSegmentPoly2DDir = vec3.create();
const _intersectSegmentPoly2DToStart = vec3.create();
const _intersectSegmentPoly2DEdge = vec3.create();

/**
 * Intersects a segment with a polygon in 2D (ignoring Z).
 * Uses the Sutherland-Hodgman clipping algorithm approach.
 *
 * @param result The result object to store intersection data
 * @param startPosition Start position of the segment
 * @param endPosition End position of the segment
 * @param verts Polygon vertices as flat array [y,z,x,y,z,x,...]
 * @param nv Number of vertices in the polygon
 */
export const intersectSegmentPoly2D = (
    result: IntersectSegmentPoly2DResult,
    startPosition: Vec3,
    endPosition: Vec3,
    nv: number,
    verts: number[],
): IntersectSegmentPoly2DResult => {
    result.intersects = false;
    result.tmin = 0;
    result.tmax = 1;
    result.segMin = -1;
    result.segMax = -1;

    const dir = vec3.subtract(_intersectSegmentPoly2DDir, endPosition, startPosition);

    const vi = _intersectSegmentPoly2DVi;
    const vj = _intersectSegmentPoly2DVj;
    const edge = _intersectSegmentPoly2DEdge;
    const diff = _intersectSegmentPoly2DToStart;

    for (let i = 0, j = nv - 1; i < nv; j = i, i++) {
        vec3.fromBuffer(vi, verts, i * 3);
        vec3.fromBuffer(vj, verts, j * 3);

        vec3.subtract(edge, vi, vj);
        vec3.subtract(diff, startPosition, vj);

        const n = vperp2D(edge, diff);
        const d = vperp2D(dir, edge);

        if (Math.abs(d) < EPS) {
            // S is nearly parallel to this edge
            if (n < 0) {
                return result;
            }

            continue;
        }

        const t = n / d;

        if (d < 0) {
            // segment S is entering across this edge
            if (t > result.tmin) {
                result.tmin = t;
                result.segMin = j;
                // S enters after leaving polygon
                if (result.tmin > result.tmax) {
                    return result;
                }
            }
        } else {
            // segment S is leaving across this edge
            if (t < result.tmax) {
                result.tmax = t;
                result.segMax = j;
                // S leaves before entering polygon
                if (result.tmax < result.tmin) {
                    return result;
                }
            }
        }
    }

    result.intersects = true;

    return result;
};

const _randomPointInConvexPolyVa = vec3.create();
const _randomPointInConvexPolyVb = vec3.create();
const _randomPointInConvexPolyVc = vec3.create();

/**
 * Generates a random point inside a convex polygon using barycentric coordinates.
 *
 * @param verts - Polygon vertices as flat array [y,z,x,y,z,x,...]
 * @param areas - Temporary array for triangle areas (will be modified)
 * @param s - Random value [0,1] for triangle selection
 * @param t - Random value [0,1] for point within triangle
 * @param out - Output point [y,z,x]
 */
export const randomPointInConvexPoly = (out: Vec3, nv: number, verts: number[], areas: number[], s: number, t: number): Vec3 => {
    // calculate cumulative triangle areas for weighted selection
    let areaSum = 0;
    const va = vec3.fromBuffer(_randomPointInConvexPolyVa, verts, 0);
    for (let i = 2; i < nv; i++) {
        const vb = vec3.fromBuffer(_randomPointInConvexPolyVb, verts, (i - 1) * 3);
        const vc = vec3.fromBuffer(_randomPointInConvexPolyVc, verts, i * 3);
        areas[i] = triArea2D(va, vb, vc);
        areaSum += Math.max(0.001, areas[i]);
    }

    // choose triangle based on area-weighted random selection
    const thr = s * areaSum;
    let acc = 0;
    let u = 1;
    let tri = nv - 1;
    for (let i = 2; i < nv; i++) {
        const dacc = areas[i];
        if (thr >= acc && thr < acc + dacc) {
            u = (thr - acc) / dacc;
            tri = i;
            break;
        }
        acc += dacc;
    }

    // generate random point in triangle using barycentric coordinates
    // standard method: use square root for uniform distribution
    const v = Math.sqrt(t);

    const a = 1 - v;
    const b = (1 - u) * v;
    const c = u * v;

    const vb = vec3.fromBuffer(_randomPointInConvexPolyVb, verts, (tri - 1) * 3);
    const vc = vec3.fromBuffer(_randomPointInConvexPolyVc, verts, tri * 3);

    out[0] = a * va[0] + b * vb[0] + c * vc[0];
    out[1] = a * va[1] + b * vb[1] + c * vc[1];
    out[2] = a * va[2] + b * vb[2] + c * vc[2];

    return out;
};

/**
 * Projects a polygon onto an axis and returns the min/max projection values.
 * @param out Output tuple [min, max]
 * @param axis The axis to project onto [y, x]
 * @param verts Polygon vertices [y,z,x,y,z,x,...]
 * @param nverts Number of vertices
 */
const projectPoly = (out: [number, number], axis: Vec2, verts: number[], nverts: number): void => {
    let min = axis[0] * verts[1] + axis[1] * verts[0]; // dot product with first vertex (y,x)
    let max = min;

    for (let i = 1; i < nverts; i++) {
        const dot = axis[0] * verts[i * 3 + 1] + axis[1] * verts[i * 3]; // dot product (y,x)
        min = Math.min(min, dot);
        max = Math.max(max, dot);
    }

    out[0] = min;
    out[1] = max;
};

/**
 * Checks if two ranges overlap with epsilon tolerance.
 * @param amin Min value of range A
 * @param amax Max value of range A
 * @param bmin Min value of range B
 * @param bmax Max value of range B
 * @param eps Epsilon tolerance
 * @returns True if ranges overlap
 */
const overlapRange = (amin: number, amax: number, bmin: number, bmax: number, eps: number): boolean => {
    return !(amin + eps > bmax || amax - eps < bmin);
};

const _overlapPolyPolyNormal: Vec2 = vec2.create();
const _overlapPolyPolyVa: Vec2 = vec2.create();
const _overlapPolyPolyVb: Vec2 = vec2.create();
const _overlapPolyPolyProjA: [number, number] = [0, 0];
const _overlapPolyPolyProjB: [number, number] = [0, 0];

/**
 * Tests if two convex polygons overlap in 2D (XY plane).
 * Uses the separating axis theorem - matches the C++ dtOverlapPolyPoly2D implementation.
 * All vertices are projected onto the xy-plane, so the z-values are ignored.
 *
 * @param vertsA Vertices of the first polygon [y,z,x,y,z,x,...]
 * @param nvertsA Number of vertices in the first polygon
 * @param vertsB Vertices of the second polygon [y,z,x,y,z,x,...]
 * @param nvertsB Number of vertices in the second polygon
 * @returns True if the polygons overlap
 */
export const overlapPolyPoly2D = (vertsA: number[], nvertsA: number, vertsB: number[], nvertsB: number): boolean => {
    const eps = 1e-4;

    // Check separation along each edge normal of polygon A
    for (let i = 0, j = nvertsA - 1; i < nvertsA; j = i++) {
        const va = _overlapPolyPolyVa;
        const vb = _overlapPolyPolyVb;

        va[0] = vertsA[j * 3 + 1]; // y
        va[1] = vertsA[j * 3]; // x
        vb[0] = vertsA[i * 3 + 1]; // y
        vb[1] = vertsA[i * 3]; // x

        // Calculate edge normal: n = { vb[x]-va[x], -(vb[y]-va[y]) }
        const normal = _overlapPolyPolyNormal;
        normal[0] = vb[1] - va[1]; // x component
        normal[1] = -(vb[0] - va[0]); // negative y component

        // Project both polygons onto this normal
        const projA = _overlapPolyPolyProjA;
        const projB = _overlapPolyPolyProjB;
        projectPoly(projA, normal, vertsA, nvertsA);
        projectPoly(projB, normal, vertsB, nvertsB);

        // Check if projections are separated
        if (!overlapRange(projA[0], projA[1], projB[0], projB[1], eps)) {
            // Found separating axis
            return false;
        }
    }

    // Check separation along each edge normal of polygon B
    for (let i = 0, j = nvertsB - 1; i < nvertsB; j = i++) {
        const va = _overlapPolyPolyVa;
        const vb = _overlapPolyPolyVb;

        va[0] = vertsB[j * 3 + 1]; // y
        va[1] = vertsB[j * 3]; // x
        vb[0] = vertsB[i * 3 + 1]; // y
        vb[1] = vertsB[i * 3]; // x

        // Calculate edge normal: n = { vb[x]-va[x], -(vb[y]-va[y]) }
        const normal = _overlapPolyPolyNormal;
        normal[0] = vb[1] - va[1]; // x component
        normal[1] = -(vb[0] - va[0]); // negative y component

        // Project both polygons onto this normal
        const projA = _overlapPolyPolyProjA;
        const projB = _overlapPolyPolyProjB;
        projectPoly(projA, normal, vertsA, nvertsA);
        projectPoly(projB, normal, vertsB, nvertsB);

        // Check if projections are separated
        if (!overlapRange(projA[0], projA[1], projB[0], projB[1], eps)) {
            // Found separating axis
            return false;
        }
    }

    // No separating axis found, polygons overlap
    return true;
};
